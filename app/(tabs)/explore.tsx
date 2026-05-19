import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BrandLogo } from '@/components/brand-logo';
import useStore from '@/store/useStore';
import { useCallback, useState } from 'react';

/**
 * Profile screen. Reached from the small profile icon on the Dashboard.
 * Hidden from the tab bar — surfaced via `href: null` in (tabs)/_layout.tsx.
 */
export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { behaviors, checkIns, getStreak } = useStore();
  const [, setRefresh] = useState({});

  useFocusEffect(
    useCallback(() => {
      setRefresh({});
    }, [])
  );

  const activeStates = behaviors.filter((b) => !b.hidden);
  const totalStates = behaviors.length;
  const totalCheckIns = checkIns.length;
  const successCount = checkIns.filter((c) => c.result === 'yes').length;
  const successRate =
    totalCheckIns > 0 ? Math.round((successCount / totalCheckIns) * 100) : 0;
  const longestStreak = Math.max(0, ...behaviors.map((b) => getStreak(b.id)));
  const daysActive = new Set(
    checkIns.map((c) => new Date(c.at).toDateString())
  ).size;

  const stats: { value: string | number; label: string }[] = [
    { value: activeStates.length, label: 'Active states' },
    { value: totalCheckIns, label: 'Total check-ins' },
    { value: `${successRate}%`, label: 'Success rate' },
    { value: longestStreak, label: 'Longest streak' },
    { value: totalStates, label: 'Total states' },
    { value: daysActive, label: 'Days active' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
      </View>

      <View style={styles.statsGrid}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[
              styles.statCard,
              { backgroundColor: colors.tintSoft, borderColor: colors.tintMuted },
            ]}
          >
            <Text style={[styles.statValue, { color: colors.tint }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.brandRow}>
          <BrandLogo size={56} variant="tile" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              About Reprogrammer
            </Text>
            <Text style={[styles.tagline, { color: colors.tint }]}>
              Notice · Repeat · Reprogram
            </Text>
          </View>
        </View>
        <Text style={[styles.descriptionText, { color: colors.textMuted }]}>
          Reprogrammer uses spaced repetition to help you become aware of automatic
          behaviors and practice changing them.
        </Text>
      </View>

      <View style={styles.spacing} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  spacing: {
    height: 60,
  },
});
