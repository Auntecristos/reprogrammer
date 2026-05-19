import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, type ThemeColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import useStore from '@/store/useStore';
import { useCallback, useState } from 'react';
import type { Behavior } from '@/types';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function todayWeekday(): number {
  return new Date().getDay(); // 0 = Sunday
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { behaviors, checkIns, reminderAttempts, getStreak } = useStore();
  const router = useRouter();
  const [, setRefresh] = useState({});

  useFocusEffect(
    useCallback(() => {
      setRefresh({});
    }, [])
  );

  const activeBehaviors = behaviors.filter((b) => !b.hidden);
  const todayStart = startOfTodayMs();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;
  const today = todayWeekday();

  // Today's progress across all active states (for the header).
  const todaysCheckInsCount = checkIns.filter(
    (c) => c.at >= todayStart && c.at < todayEnd && c.result === 'yes'
  ).length;
  const todaysAttemptsCount = reminderAttempts.filter(
    (a) => a.scheduledFor >= todayStart && a.scheduledFor < todayEnd && a.phase === 'initial'
  ).length;

  const handleCreate = () => router.push('/create');
  const handleOpenState = (id: string) => router.push(`/behavior/${id}`);
  const handleOpenProfile = () => router.push('/explore');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top bar: profile · today · add */}
      <View style={styles.topBar}>
        <Pressable
          onPress={handleOpenProfile}
          style={[styles.profileButton, { backgroundColor: colors.surfaceMuted }]}
          accessibilityLabel="Open profile"
        >
          <IconSymbol name="person.fill" size={20} color={colors.textMuted} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={[styles.dateText, { color: colors.text }]}>{formatToday()}</Text>
          {todaysAttemptsCount > 0 ? (
            <Text style={[styles.progressText, { color: colors.textMuted }]}>
              {todaysCheckInsCount} of {todaysAttemptsCount} practiced today
            </Text>
          ) : (
            <Text style={[styles.progressText, { color: colors.textMuted }]}>
              {activeBehaviors.length} active{' '}
              {activeBehaviors.length === 1 ? 'state' : 'states'}
            </Text>
          )}
        </View>

        <Pressable
          onPress={handleCreate}
          style={[styles.addButton, { backgroundColor: colors.tint }]}
          accessibilityLabel="Add state"
        >
          <IconSymbol name="plus" size={22} color={colors.textOnBrand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.gridScroll}>
        <View style={styles.grid}>
          {activeBehaviors.map((b) => (
            <StateTile
              key={b.id}
              behavior={b}
              today={today}
              streak={getStreak(b.id)}
              colors={colors}
              onPress={() => handleOpenState(b.id)}
            />
          ))}

          {/* Empty "+" tile to add a state directly from the grid */}
          <Pressable
            onPress={handleCreate}
            style={[
              styles.tile,
              styles.emptyTile,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            accessibilityLabel="Add a new state"
          >
            <IconSymbol name="plus" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyLabel, { color: colors.textMuted }]}>Add state</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

interface TileProps {
  behavior: Behavior;
  today: number;
  streak: number;
  colors: ThemeColors;
  onPress: () => void;
}

function StateTile({ behavior, today, streak, colors, onPress }: TileProps) {
  const isPaused = behavior.pausedUntil != null && behavior.pausedUntil > Date.now();
  const isActiveToday = behavior.activeDays.includes(today);
  const isEnabled = !isPaused && isActiveToday;

  const textColor = isEnabled ? colors.stateEnabledText : colors.stateDisabledText;
  const tags = (behavior.tags ?? []).slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tile,
        {
          backgroundColor: isEnabled ? colors.stateEnabledBg : colors.stateDisabledBg,
          overflow: 'hidden',
        },
      ]}
    >
      {!isEnabled && <DiagonalStripes color={colors.stateDisabledStripe} />}

      <View style={styles.tileContent}>
        <View style={styles.tileHead}>
          <View style={styles.tileTopRow}>
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={[styles.tileTitle, { color: textColor }]}
            >
              {behavior.title}
            </Text>
            {streak > 0 && (
              <View style={styles.streakBadge}>
                <IconSymbol name="flame.fill" size={12} color={colors.warning} />
                <Text style={[styles.streakNumber, { color: colors.warning }]}>{streak}</Text>
              </View>
            )}
          </View>

          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagChip,
                    { backgroundColor: hexToAlpha(textColor, 0.18) },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.tagText, { color: textColor }]}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.tileFoot}>
          <Text style={[styles.tileWindow, { color: textColor }]}>
            {behavior.window.from} – {behavior.window.to}
          </Text>

          <View style={styles.daysRow}>
            {DAY_LABELS.map((label, idx) => {
              const isActive = behavior.activeDays.includes(idx);
              return (
                <Text
                  key={idx}
                  style={[
                    styles.dayLabel,
                    {
                      color: isActive ? textColor : colors.textMuted,
                      opacity: isActive ? 1 : 0.4,
                      fontWeight: isActive ? '700' : '400',
                    },
                  ]}
                >
                  {label}
                </Text>
              );
            })}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Edge-to-edge diagonal stripe overlay (4px bars, 14px pitch, -45deg).
 * Renders enough bars to cover the full diagonal of the tile so every
 * corner is striped — matches the repeating-linear-gradient in the design.
 */
function DiagonalStripes({ color }: { color: string }) {
  const bars = Array.from({ length: 28 });
  return (
    <View pointerEvents="none" style={styles.stripesContainer}>
      {bars.map((_, i) => (
        <View
          key={i}
          style={[
            styles.stripeBar,
            { top: i * 14 - 120, backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * Apply an alpha channel to a hex color so chip backgrounds can derive from
 * the text color (matches the design's translucent tag pattern).
 */
function hexToAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const v = cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TILE_GAP = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 12,
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridScroll: {
    padding: 16,
    paddingTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    width: `${(100 - 4) / 2}%`, // two columns with gap
    aspectRatio: 1,
    borderRadius: 20,
    padding: 14,
    justifyContent: 'space-between',
  },
  tileContent: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  tileHead: {
    gap: 6,
  },
  tileFoot: {
    marginTop: 'auto',
  },
  tileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  tileTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 19,
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '100%',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingTop: 2,
  },
  streakNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  tileWindow: {
    fontSize: 12,
    opacity: 0.85,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayLabel: {
    fontSize: 11,
    width: 14,
    textAlign: 'center',
  },
  emptyTile: {
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  emptyLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  stripesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  stripeBar: {
    position: 'absolute',
    left: -120,
    width: 480,
    height: 4,
    opacity: 0.55,
    transform: [{ rotate: '-45deg' }],
  },
});
