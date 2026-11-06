import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const noSubscription = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * `useSyncExternalStore` answers false during the static render and true once hydrated on the
 * client, without the extra render a setState in an effect would cost.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
