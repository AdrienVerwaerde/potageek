import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeviceId } from '@/api/config';
import type { Thresholds } from '@/api/types';
import { AccountSection } from '@/components/account-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { enqueueThresholds } from '@/services/command-queue';
import { crashForSentryTest, crashTestEnabled } from '@/services/monitoring';
import { setAlertsEnabled } from '@/services/notifications';
import { applyThresholds } from '@/services/thresholds';
import { inFlightCommand, useCommandStore } from '@/stores/command-store';
import { usePreferenceStore } from '@/stores/preference-store';
import { useThresholdStore } from '@/stores/threshold-store';
import { parseBound, validate, type ThresholdErrors } from '@/utils/thresholds';

type Draft = Record<keyof Thresholds, string>;

const Fields: { key: keyof Thresholds; label: string; unit: string }[] = [
  { key: 'tMax', label: 'Température max', unit: '°C' },
  { key: 'tMin', label: 'Température min', unit: '°C' },
  { key: 'hMax', label: 'Humidité max', unit: '%' },
  { key: 'hMin', label: 'Humidité min', unit: '%' },
  { key: 'holdMinutes', label: 'Maintien avant alerte', unit: 'min' },
];

const show = (value: number | null) => (value === null ? '' : String(value));

const toDraft = (thresholds: Thresholds): Draft => ({
  tMin: show(thresholds.tMin),
  tMax: show(thresholds.tMax),
  hMin: show(thresholds.hMin),
  hMax: show(thresholds.hMax),
  holdMinutes: String(thresholds.holdMinutes),
});

/** Undefined when a field does not parse, which is its own error. */
function toThresholds(draft: Draft): Thresholds | undefined {
  const bounds = {
    tMin: parseBound(draft.tMin),
    tMax: parseBound(draft.tMax),
    hMin: parseBound(draft.hMin),
    hMax: parseBound(draft.hMax),
  };

  if (Object.values(bounds).some((value) => value === undefined)) return undefined;

  const hold = Number(draft.holdMinutes.trim());
  if (!Number.isFinite(hold)) return undefined;

  return { ...(bounds as Omit<Thresholds, 'holdMinutes'>), holdMinutes: hold };
}

export default function SettingsScreen() {
  const thresholds = useThresholdStore((state) => state.thresholds);
  const loaded = useThresholdStore((state) => state.loaded);
  const commands = useCommandStore((state) => state.commands);
  const theme = useTheme();

  const alertsEnabled = usePreferenceStore((state) => state.alertsEnabled);
  const permission = usePreferenceStore((state) => state.permission);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<ThresholdErrors>({});
  const [refused, setRefused] = useState(false);

  if (draft === null && thresholds) setDraft(toDraft(thresholds));

  const queued = inFlightCommand(commands, 'thresholds');

  function save() {
    if (!draft) return;

    const next = toThresholds(draft);
    if (!next) return setErrors({ tMin: 'Valeur illisible' });

    const found = validate(next);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    applyThresholds(DeviceId, next);
    enqueueThresholds(DeviceId, next);
  }

  async function toggleAlerts(enabled: boolean) {
    const result = await setAlertsEnabled(enabled);
    setRefused(enabled && (result === 'denied' || result === 'undetermined'));
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Réglages</ThemedText>
          </View>

          <AccountSection />

          <View style={styles.separator} />

          {!loaded || !draft ? (
            <ThemedText type="small" themeColor="textSecondary">
              Chargement des seuils…
            </ThemedText>
          ) : (
            <>
              {Fields.map(({ key, label, unit }) => (
                <View key={key} style={styles.field}>
                  <ThemedText type="small" style={styles.label}>
                    {label}
                  </ThemedText>
                  <TextInput
                    value={draft[key]}
                    onChangeText={(text) => setDraft({ ...draft, [key]: text })}
                    keyboardType="numbers-and-punctuation"
                    style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    accessibilityLabel={`${label} en ${unit}`}
                    placeholder="—"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.unit}>
                    {unit}
                  </ThemedText>
                </View>
              ))}

              {Object.entries(errors).map(([key, message]) => (
                <ThemedText key={key} type="small" style={styles.error}>
                  {Fields.find((f) => f.key === key)?.label} : {message}
                </ThemedText>
              ))}

              <Pressable onPress={save} accessibilityRole="button">
                <ThemedView type="backgroundButton" style={styles.saveButton}>
                  <ThemedText type="smallBold">ENREGISTRER</ThemedText>
                </ThemedView>
              </Pressable>

              {/* Queued offline, same file as the LED orders. */}
              {queued && (
                <ThemedText type="small" themeColor="textSecondary">
                  Seuils {queued.status === 'pending' ? 'en attente d’envoi' : 'envoyés'}
                </ThemedText>
              )}

              <ThemedText type="small" themeColor="textSecondary">
                Un champ vide signifie que la borne n’est pas surveillée.
              </ThemedText>

              <View style={styles.separator} />

              <View style={styles.field}>
                <ThemedText type="small" style={styles.label}>
                  Alertes sur ce téléphone
                </ThemedText>
                <Switch
                  value={alertsEnabled}
                  onValueChange={toggleAlerts}
                  disabled={permission === 'unavailable'}
                  accessibilityLabel="Recevoir les alertes sur ce téléphone"
                />
              </View>

              <ThemedText type="small" themeColor="textSecondary">
                Pour être prévenu quand un seuil est franchi, même app fermée (une fois
                connecté), et quand le capteur ne répond plus depuis 3 minutes, app ouverte.
              </ThemedText>

              {permission === 'unavailable' && (
                <ThemedText type="small" themeColor="textSecondary">
                  Indisponible dans Expo Go sur Android : les notifications nécessitent un build
                  de développement. Les alertes restent visibles dans l’app et dans le Journal.
                </ThemedText>
              )}

              {refused && (
                <ThemedText type="small" style={styles.error}>
                  Notifications refusées{permission === 'denied' ? ' dans les réglages du téléphone' : ''}.
                  Les alertes restent visibles dans l’app et dans le Journal.
                </ThemedText>
              )}
            </>
          )}

          {crashTestEnabled && (
            <Pressable onPress={crashForSentryTest} accessibilityRole="button">
              <ThemedView type="backgroundSelected" style={styles.saveButton}>
                <ThemedText type="smallBold">CRASH DE TEST (SENTRY)</ThemedText>
              </ThemedView>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    marginTop: TopInset,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  content: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  header: {
    paddingVertical: Spacing.three,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
  },
  input: {
    minWidth: 80,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    textAlign: 'right',
  },
  unit: {
    width: 32,
  },
  separator: {
    height: 1,
    backgroundColor: '#eaeaea',
    opacity: 0.3,
    marginVertical: Spacing.two,
  },
  error: {
    color: '#ff3b30',
    fontWeight: 'bold',
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
});
