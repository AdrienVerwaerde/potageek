import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

import { sendCommand } from '@/api/client';
import type { QueuedCommand } from '@/db/command-cache';
import { drainQueue } from '@/services/command-queue';
import { useSensorStore } from '@/stores/sensor-store';

// jest.mock calls below are hoisted above these imports by babel-jest, so the
// queue is loaded with the mocks in place.

/**
 * The queue's logic, without a phone: SQLite is replaced by an array that
 * behaves like the real table (oldest pending first), and the network by a
 * mock whose answers each test decides.
 */

const rows: QueuedCommand[] = [];

jest.mock('@/db/command-cache', () => ({
  insertCommand: jest.fn(async (command: QueuedCommand) => {
    rows.push({ ...command });
  }),
  dropPending: jest.fn(async () => {}),
  updateCommand: jest.fn(async (id: string, fields: Partial<QueuedCommand>) => {
    const row = rows.find((r) => r.id === id);
    if (row) Object.assign(row, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
  }),
  // Same contract as the SQL: still owed, oldest first.
  readUnsent: jest.fn(async (device: string) =>
    rows.filter((r) => r.device === device && r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)
  ),
  readRecent: jest.fn(async () => []),
  resetInFlight: jest.fn(async () => {}),
  pruneCommands: jest.fn(async () => {}),
}));

jest.mock('@/api/client', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  }
  return { ApiError, sendCommand: jest.fn(), putThresholds: jest.fn() };
});

jest.mock('@/stores/auth-store', () => ({ currentToken: () => 'jwt' }));
jest.mock('@/services/auth', () => ({ signOut: jest.fn(async () => {}) }));

const send = sendCommand as jest.MockedFunction<typeof sendCommand>;
const device = 'esp-01';
const networkDown = () => new TypeError('Network request failed');

function queued(id: string, createdAt: number, led = true): QueuedCommand {
  return { id, device, kind: 'led', payload: { led }, status: 'pending', attempts: 0, reason: null, createdAt };
}

const status = (id: string) => rows.find((r) => r.id === id)?.status;
const sentIds = () => send.mock.calls.map(([, command]) => command.id);

beforeEach(() => {
  jest.useFakeTimers();
  rows.length = 0;
  send.mockReset();
  // The queue never drains in the background.
  useSensorStore.setState({ appState: 'active' });
});

afterEach(() => {
  jest.useRealTimers();
});

test('replays pending commands in order, once each', async () => {
  // Inserted out of order: the queue must follow creation time, not insertion.
  rows.push(queued('c-2', 200, false), queued('c-1', 100, true), queued('c-3', 300, true));
  send.mockImplementation(async (_device, { id }) => ({ id, status: 'sent' as const }));

  await drainQueue(device);

  expect(sentIds()).toEqual(['c-1', 'c-2', 'c-3']);
  expect(send.mock.calls[0]).toEqual([device, { id: 'c-1', led: true }, 'jwt']);
  expect(['c-1', 'c-2', 'c-3'].map(status)).toEqual(['sent', 'sent', 'sent']);
});

test('a retry reuses the same id, and two drains at once never send twice', async () => {
  rows.push(queued('c-1', 100));
  send
    .mockRejectedValueOnce(networkDown())
    .mockImplementation(async (_device, { id }) => ({ id, status: 'sent' as const }));

  // The socket opening and NetInfo coming back fire together: one pass only.
  await Promise.all([drainQueue(device), drainQueue(device)]);
  expect(sentIds()).toEqual(['c-1']);
  expect(status('c-1')).toBe('pending');

  // After the backoff delay, the same order goes again — same id, so the
  // backend recognises it and never publishes it twice.
  await jest.advanceTimersByTimeAsync(30_000);

  expect(sentIds()).toEqual(['c-1', 'c-1']);
  expect(status('c-1')).toBe('sent');
});

test('gives up as failed after 5 network failures, and stops retrying', async () => {
  rows.push(queued('c-1', 100));
  send.mockRejectedValue(networkDown());

  await drainQueue(device);
  // Backoff is capped at 30 s (+30 % jitter): 5 minutes covers every retry.
  await jest.advanceTimersByTimeAsync(5 * 60_000);

  expect(send).toHaveBeenCalledTimes(5);
  expect(status('c-1')).toBe('failed');
  expect(rows[0].attempts).toBe(5);
});

test('a refusal by the backend fails at once, without retrying', async () => {
  const { ApiError } = jest.requireMock<typeof import('@/api/client')>('@/api/client');
  rows.push(queued('c-1', 100), queued('c-2', 200));
  send
    .mockRejectedValueOnce(new ApiError(404, 'unknown device'))
    .mockImplementation(async (_device, { id }) => ({ id, status: 'sent' as const }));

  await drainQueue(device);

  // The same request would be refused again: failed, and the queue moves on.
  expect(status('c-1')).toBe('failed');
  expect(status('c-2')).toBe('sent');
  expect(sentIds()).toEqual(['c-1', 'c-2']);
});
