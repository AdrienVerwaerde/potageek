import { JournalRow } from '@/components/journal-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopInset } from '@/constants/theme';
import { useCommandStore } from '@/stores/command-store';
import { useJournalStore } from '@/stores/journal-store';
import { toJournalEntries } from '@/utils/journal';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LastEventsCount = 5;

export default function HomeScreen() {
  const events = useJournalStore((state) => state.events);
  const commands = useCommandStore((state) => state.commands);
  const connections = useJournalStore((state) => state.connections);

  const lastEvents = useMemo(
    () => toJournalEntries(events, commands, connections).slice(0, LastEventsCount),
    [events, commands, connections]
  );

  return (
    // Transparent: the app background photo shows through from the root layout.
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.heroSection}>
          <Image
            source={require('@/assets/images/icon.jpg')}
            style={{ width: 200, height: 200, borderRadius: 50 }}
          />
          <ThemedText type="subtitle">
            Potageek
          </ThemedText>
        </View>

        <View style={styles.lastEvents}>
          <ThemedText type="small" themeColor="textSecondary">
            Derniers relevés
          </ThemedText>
          {lastEvents.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Pas d’informations pour l’instant.
            </ThemedText>
          ) : (
            lastEvents.map((entry, index) => (
              <JournalRow key={entry.key} entry={entry} striped={index % 2 === 0} />
            ))
          )}

          <Link href="/dashboard" asChild>
            <Pressable style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.seeMoreButton}>
                <ThemedText type="small" style={{ color: '#eaeaea' }}>
                  CONTRÔLE DU CAPTEUR
                </ThemedText>
              </ThemedView>
            </Pressable>
          </Link>
        </View>
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
    // Margin, not padding: SafeAreaView owns its padding for the status bar.
    marginTop: TopInset,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  lastEvents: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: Spacing.two,
  },
  seeMoreButton: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: '#fe7f30',
  },
  pressed: {
    opacity: 0.7,
  },
});
