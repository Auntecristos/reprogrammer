import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Pressable that participates in Reanimated style updates (for tile press). */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Colors,
  Type,
  Space,
  Radius,
  type ThemeColors,
} from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import useStore from '@/store/useStore';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Behavior } from '@/types';
import { deriveStage, stageLabel } from '@/services/levels';
import { useContentModals } from '@/components/library/content-modals-provider';
import { cancelForBehavior, rescheduleAll, scheduleForBehavior } from '@/services/notifications';
import { endOfLocalDay } from '@/services/scheduler-core';
import { StreakConfetti } from '@/components/streak-confetti';
import { isStreakMilestone } from '@/services/streak';

const RELAPSE_BANNER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayWeekday(): number {
  return new Date().getDay(); // 0 = Sunday
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatToday(): string {
  // Pin to en-US Gregorian so the dashboard date doesn't drift with system locale
  // (Hijri-configured sims previously showed "Friday, 12 Dhu'l-H.").
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const {
    behaviors,
    checkIns,
    reminderAttempts,
    appProfile,
    updateAppProfile,
    updateBehavior,
    deleteBehavior,
    getStreak,
  } = useStore();
  const router = useRouter();
  const { openGuide } = useContentModals();
  const [, setRefresh] = useState({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pendingUndo = useStore((state) => state.pendingUndo);
  const setPendingUndo = useStore((state) => state.setPendingUndo);
  const restorePendingUndo = useStore((state) => state.restorePendingUndo);

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
  // 'tried' counts as engagement — showing up is the practice.
  const todaysCheckInsCount = checkIns.filter(
    (c) =>
      c.at >= todayStart &&
      c.at < todayEnd &&
      (c.result === 'yes' || c.result === 'tried')
  ).length;
  const todaysAttempts = reminderAttempts.filter(
    (a) => a.scheduledFor >= todayStart && a.scheduledFor < todayEnd && a.phase === 'initial'
  );
  const todaysAttemptsCount = todaysAttempts.length;
  const nowMs = Date.now();
  const todaysRemaining = Math.max(0, todaysAttemptsCount - todaysCheckInsCount);
  // A remaining attempt is "pending" if it hasn't fired yet; "missed" if it
  // has fired (scheduledFor <= now) and the user hasn't checked it in.
  const todaysPending = todaysAttempts.filter(
    (a) => a.scheduledFor > nowMs
  ).length;
  const todaysMissed = Math.max(0, todaysRemaining - todaysPending);
  const allCaughtUp =
    todaysAttemptsCount > 0 && todaysCheckInsCount >= todaysAttemptsCount;

  const handleCreate = () => router.push('/create');
  const handleOpenProfile = () => router.push('/(tabs)/profile');

  // --- Select-mode handlers ---

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTilePress = (id: string) => {
    if (selectMode) {
      toggleSelected(id);
      return;
    }
    router.push(`/behavior/${id}`);
  };

  const handleTileLongPress = (id: string) => {
    if (selectMode) return;
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };

  const selectedBehaviors = activeBehaviors.filter((b) => selectedIds.has(b.id));
  const anySelectedPaused = selectedBehaviors.some(
    (b) => b.pausedUntil != null && b.pausedUntil > Date.now()
  );

  const bulkPauseUntil = async (resumeAt: number) => {
    await Promise.all(
      selectedBehaviors.map((b) =>
        Promise.all([
          updateBehavior({ ...b, pausedUntil: resumeAt }),
          cancelForBehavior(b.id),
        ])
      )
    );
    exitSelectMode();
  };

  const handleBulkPause = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      `Pause ${count} ${count === 1 ? 'state' : 'states'}`,
      'Reminders stop; streaks and history stay. Pick a length.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Until tonight', onPress: () => bulkPauseUntil(endOfLocalDay()) },
        { text: '1 day', onPress: () => bulkPauseUntil(Date.now() + DAY_MS) },
        { text: '3 days', onPress: () => bulkPauseUntil(Date.now() + 3 * DAY_MS) },
        { text: '1 week', onPress: () => bulkPauseUntil(Date.now() + 7 * DAY_MS) },
      ]
    );
  };

  const handleBulkResume = async () => {
    if (selectedIds.size === 0) return;
    await Promise.all(
      selectedBehaviors
        .filter((b) => b.pausedUntil != null)
        .map((b) => updateBehavior({ ...b, pausedUntil: undefined }))
    );
    await rescheduleAll({ force: true });
    exitSelectMode();
  };

  const handleBulkArchive = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      `Archive ${count} ${count === 1 ? 'state' : 'states'}?`,
      'Archived states are hidden but keep their history. You can restore them later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            await Promise.all(
              selectedBehaviors.map((b) =>
                Promise.all([
                  updateBehavior({ ...b, hidden: true }),
                  cancelForBehavior(b.id),
                ])
              )
            );
            exitSelectMode();
          },
        },
      ]
    );
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      `Delete ${count} ${count === 1 ? 'state' : 'states'}?`,
      'This cannot be undone. Check-in history for these states will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Promise.all(
              selectedBehaviors.map(async (b) => {
                await cancelForBehavior(b.id);
                await deleteBehavior(b.id);
              })
            );
            exitSelectMode();
          },
        },
      ]
    );
  };

  const lapseSnoozedRecently =
    appProfile.lastLapseSnoozedAt != null &&
    Date.now() - appProfile.lastLapseSnoozedAt < RELAPSE_BANNER_TTL_MS;
  const showRelapseBanner =
    appProfile.lastLapseAt != null &&
    appProfile.lastLapseAcknowledged !== true &&
    !lapseSnoozedRecently &&
    Date.now() - appProfile.lastLapseAt < RELAPSE_BANNER_TTL_MS;

  const handleOpenRelapseGuide = () => {
    openGuide('guide-relapse-and-restart');
    void updateAppProfile({ lastLapseAcknowledged: true });
  };

  const handleDismissRelapseBanner = () => {
    void updateAppProfile({ lastLapseAcknowledged: true });
  };

  const handleSnoozeRelapseBanner = () => {
    void updateAppProfile({ lastLapseSnoozedAt: Date.now() });
  };

  // Undo banner: auto-clear ~5s after delete. We also re-render at that
  // moment so the banner falls off without waiting for another store
  // mutation. The "+ 100" is a small buffer to ensure the deadline has
  // truly passed when the timer fires.
  const UNDO_TTL_MS = 5000;
  useEffect(() => {
    if (!pendingUndo) return;
    const elapsed = Date.now() - pendingUndo.deletedAt;
    const remaining = Math.max(0, UNDO_TTL_MS - elapsed);
    const timer = setTimeout(() => {
      setPendingUndo(null);
    }, remaining + 100);
    return () => clearTimeout(timer);
  }, [pendingUndo, setPendingUndo]);

  const showUndoBanner =
    pendingUndo != null &&
    Date.now() - pendingUndo.deletedAt < UNDO_TTL_MS;

  const handleUndoDelete = async () => {
    const restored = await restorePendingUndo();
    if (restored) {
      // The behavior is back in the store; rebuild its notifications so
      // reminders fire as if nothing happened.
      await scheduleForBehavior(restored);
    }
  };

  const handleDismissUndoBanner = () => {
    setPendingUndo(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top bar: profile · today · add — or, in select mode: cancel · N selected */}
      <View style={[styles.topBar, { paddingTop: insets.top + Space.md }]}>
        {selectMode ? (
          <>
            <Pressable
              onPress={exitSelectMode}
              style={[styles.profileButton, { backgroundColor: colors.surfaceMuted }]}
              accessibilityLabel="Cancel selection"
            >
              <IconSymbol name="xmark" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={[styles.dateText, { color: colors.text }]}>
                {selectedIds.size} selected
              </Text>
              <Text style={[styles.progressText, { color: colors.textMuted }]}>
                Tap tiles to add or remove
              </Text>
            </View>
            {/* Spacer to balance the left button so the header stays centered. */}
            <View style={styles.addButton} />
          </>
        ) : (
          <>
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
                  {todaysCheckInsCount} of {todaysAttemptsCount} today
                  {todaysMissed > 0 ? ` (${todaysMissed} missed)` : ''}
                  {todaysMissed === 0 && todaysPending > 0
                    ? ` (${todaysPending} pending)`
                    : ''}
                </Text>
              ) : (
                <Text style={[styles.progressText, { color: colors.textMuted }]}>
                  {activeBehaviors.length} active{' '}
                  {activeBehaviors.length === 1 ? 'state' : 'states'}
                </Text>
              )}
            </View>
            {activeBehaviors.length >= 2 ? (
              <Pressable
                onPress={() => setSelectMode(true)}
                style={[
                  styles.headerSecondaryButton,
                  { backgroundColor: colors.surfaceMuted },
                ]}
                accessibilityLabel="Select states for bulk actions"
                accessibilityHint="Tap to enter selection mode. Long-press a tile also works."
              >
                <IconSymbol name="checkmark" size={18} color={colors.text} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleCreate}
              style={[styles.addButton, { backgroundColor: colors.tint }]}
              accessibilityLabel="Add state"
            >
              <IconSymbol name="plus" size={22} color={colors.textOnBrand} />
            </Pressable>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.gridScroll}>
        {showUndoBanner && pendingUndo ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            style={[
              styles.undoBanner,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.undoBannerBody}>
              <Text style={[styles.undoBannerTitle, { color: colors.text }]}>
                Deleted &ldquo;{pendingUndo.behavior.title}&rdquo;
              </Text>
              <Text style={[styles.undoBannerSub, { color: colors.textMuted }]}>
                5 seconds to bring it back.
              </Text>
            </View>
            <Pressable
              onPress={handleUndoDelete}
              style={[styles.undoBannerCta, { backgroundColor: colors.tint }]}
              accessibilityLabel="Undo delete"
            >
              <Text
                style={[styles.undoBannerCtaText, { color: colors.textOnBrand }]}
              >
                Undo
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDismissUndoBanner}
              style={styles.undoBannerDismiss}
              hitSlop={8}
              accessibilityLabel="Dismiss undo banner"
            >
              <IconSymbol name="xmark" size={16} color={colors.textMuted} />
            </Pressable>
          </Animated.View>
        ) : null}
        {allCaughtUp ? (
          <AllCaughtUpCard colors={colors} />
        ) : null}
        {appProfile.notificationsDenied ? (
          <View
            style={[
              styles.permissionBanner,
              {
                backgroundColor: colors.dangerSoft,
                borderColor: colors.danger,
              },
            ]}
          >
            <View style={styles.permissionBannerBody}>
              <Text style={[styles.relapseBannerTitle, { color: colors.text }]}>
                Notifications are off.
              </Text>
              <Text
                style={[styles.relapseBannerSub, { color: colors.textMuted }]}
              >
                Reprogrammer can&apos;t remind you without them. Enable in system settings.
              </Text>
            </View>
            <Pressable
              onPress={() => void Linking.openSettings()}
              style={[
                styles.permissionBannerCta,
                { backgroundColor: colors.danger },
              ]}
              accessibilityLabel="Open notification settings"
            >
              <Text
                style={[styles.permissionBannerCtaText, { color: colors.textOnBrand }]}
              >
                Open Settings
              </Text>
            </Pressable>
          </View>
        ) : null}
        {showRelapseBanner ? (
          <View
            style={[
              styles.relapseBanner,
              {
                backgroundColor: colors.warningSoft,
                borderColor: colors.warning,
              },
            ]}
          >
            <Pressable
              onPress={handleOpenRelapseGuide}
              style={styles.relapseBannerBody}
              accessibilityLabel="Open the When You Slip guide"
              accessibilityHint="Compassionate restart practice after a missed day"
            >
              <Text style={[styles.relapseBannerTitle, { color: colors.text }]}>
                Yesterday was hard.
              </Text>
              <Text
                style={[styles.relapseBannerSub, { color: colors.textMuted }]}
              >
                A short read on how to come back without making it bigger than it is.
              </Text>
            </Pressable>
            <View style={styles.relapseBannerActions}>
              <Pressable
                onPress={handleSnoozeRelapseBanner}
                style={styles.relapseBannerSnooze}
                hitSlop={8}
                accessibilityLabel="Hide this banner for a week"
              >
                <Text
                  style={[styles.relapseBannerSnoozeText, { color: colors.textMuted }]}
                >
                  Hide
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDismissRelapseBanner}
                style={styles.relapseBannerDismiss}
                hitSlop={8}
                accessibilityLabel="Dismiss restart prompt"
              >
                <IconSymbol name="xmark" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        ) : null}
        {activeBehaviors.length === 0 ? (
          <View
            style={[
              styles.emptyDashboard,
              { borderColor: colors.border },
            ]}
          >
            <Text style={[styles.emptyHeadline, { color: colors.text }]}>
              No states yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              States are the behaviors you choose to practice. Browse the catalog or
              create one from scratch.
            </Text>
            <View style={styles.emptyCtaRow}>
              <Pressable
                onPress={() => router.push('/(tabs)/library')}
                style={[
                  styles.emptyCta,
                  styles.emptyCtaSecondary,
                  { borderColor: colors.tint },
                ]}
                accessibilityLabel="Browse states catalog"
              >
                <Text
                  style={[styles.emptyCtaText, { color: colors.tint }]}
                >
                  Browse states
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                style={[
                  styles.emptyCta,
                  { backgroundColor: colors.tint },
                ]}
                accessibilityLabel="Create state from scratch"
              >
                <Text
                  style={[styles.emptyCtaText, { color: colors.textOnBrand }]}
                >
                  Create from scratch
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.grid}>
            {activeBehaviors.map((b) => (
              <StateTile
                key={b.id}
                behavior={b}
                today={today}
                streak={getStreak(b.id)}
                colors={colors}
                selectMode={selectMode}
                isSelected={selectedIds.has(b.id)}
                onPress={() => handleTilePress(b.id)}
                onLongPress={() => handleTileLongPress(b.id)}
              />
            ))}

            {/* Empty "+" tile to add a state directly from the grid. Hidden
                during selection — the top-bar Create button is also gone there. */}
            {!selectMode && (
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
                <Text style={[styles.emptyLabel, { color: colors.textMuted }]}>
                  Add state
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {selectMode ? (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              // Sit above the floating tab bar; insets.bottom is already
              // absorbed by the tab bar so we add a fixed clearance.
              bottom: 60 + insets.bottom,
              paddingBottom: Space.sm,
            },
          ]}
        >
          <BulkActionButton
            label="Pause"
            icon="pause.fill"
            color={colors.warning}
            disabled={selectedIds.size === 0}
            onPress={handleBulkPause}
          />
          <BulkActionButton
            label="Resume"
            icon="play.fill"
            color={colors.tint}
            disabled={selectedIds.size === 0 || !anySelectedPaused}
            onPress={handleBulkResume}
          />
          <BulkActionButton
            label="Archive"
            icon="archivebox.fill"
            color={colors.textMuted}
            disabled={selectedIds.size === 0}
            onPress={handleBulkArchive}
          />
          <BulkActionButton
            label="Delete"
            icon="trash.fill"
            color={colors.danger}
            disabled={selectedIds.size === 0}
            onPress={handleBulkDelete}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Calm success card shown on Today when every scheduled attempt has a
 * check-in. Entrance: 200ms fade-in + a single 600ms scale-pulse so the
 * card feels alive without becoming an interrupting animation.
 */
function AllCaughtUpCard({ colors }: { colors: ThemeColors }) {
  const scale = useSharedValue(1);
  // Kick off a one-shot pulse on mount. withSequence runs the scale up then
  // back to rest; no looping. The FadeIn props on the Animated.View handle
  // the opacity entry independently.
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.04, { duration: 280 }),
      withTiming(1, { duration: 320 })
    );
  }, [scale]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        styles.allCaughtUpCard,
        pulseStyle,
        {
          backgroundColor: colors.tintSoft,
          borderColor: colors.tintCelebrate,
        },
      ]}
      accessibilityLabel="All caught up for today"
    >
      <IconSymbol name="flame.fill" size={24} color={colors.tintCelebrate} />
      <View style={styles.allCaughtUpBody}>
        <Text style={[styles.allCaughtUpTitle, { color: colors.text }]}>
          All caught up today.
        </Text>
        <Text style={[styles.allCaughtUpSub, { color: colors.textMuted }]}>
          Every state checked in. The day did its work.
        </Text>
      </View>
    </Animated.View>
  );
}

interface BulkActionButtonProps {
  label: string;
  icon: ComponentProps<typeof IconSymbol>['name'];
  color: string;
  disabled: boolean;
  onPress: () => void;
}

function BulkActionButton({
  label,
  icon,
  color,
  disabled,
  onPress,
}: BulkActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.bulkAction, { opacity: disabled ? 0.35 : 1 }]}
      accessibilityLabel={`${label} selected states`}
      accessibilityState={{ disabled }}
    >
      <IconSymbol name={icon} size={22} color={color} />
      <Text style={[styles.bulkActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

interface TileProps {
  behavior: Behavior;
  today: number;
  streak: number;
  colors: ThemeColors;
  selectMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function StateTile({
  behavior,
  today,
  streak,
  colors,
  selectMode,
  isSelected,
  onPress,
  onLongPress,
}: TileProps) {
  const isPaused = behavior.pausedUntil != null && behavior.pausedUntil > Date.now();
  const isActiveToday = behavior.activeDays.includes(today);
  const isEnabled = !isPaused && isActiveToday;
  const stage = deriveStage(behavior.level, streak);
  const textColor = isEnabled ? colors.stateEnabledText : colors.stateDisabledText;
  const accentColor =
    behavior.kind === 'eliminate' ? colors.warning : colors.tint;

  const labelSuffix = selectMode
    ? isSelected
      ? ', selected'
      : ', not selected'
    : '';

  // Press feedback: tile scales 1.0 → 0.97 on press-in, springs back on
  // press-out. Runs on the UI thread via Reanimated; cancels cleanly if
  // the gesture turns into a long-press without releasing.
  const pressScale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  // Streak milestone confetti: when streak crosses upward into a milestone
  // (3 / 7 / 14 / 30), bump triggerKey to fire a one-shot burst. A ref tracks
  // the previous value so re-renders that don't change streak (theme flips,
  // sibling tile updates) never re-fire. On first mount we seed the ref with
  // the current streak — a tile that mounts already at 7 stays quiet.
  const [burstKey, setBurstKey] = useState(0);
  const prevStreakRef = useRef(streak);
  useEffect(() => {
    const prev = prevStreakRef.current;
    if (streak > prev && isStreakMilestone(streak)) {
      setBurstKey((k) => k + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
    prevStreakRef.current = streak;
  }, [streak]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        pressScale.value = withTiming(0.97, { duration: 90 });
      }}
      onPressOut={() => {
        pressScale.value = withTiming(1, { duration: 140 });
      }}
      delayLongPress={350}
      style={[
        styles.tile,
        pressStyle,
        {
          backgroundColor: isEnabled ? colors.stateEnabledBg : colors.stateDisabledBg,
          overflow: 'hidden',
        },
        isSelected && {
          borderWidth: 3,
          borderColor: colors.tint,
        },
      ]}
      accessibilityLabel={`${behavior.title}, ${
        behavior.kind === 'eliminate' ? 'Eliminate' : 'Adopt'
      }, ${isPaused ? 'Paused' : stageLabel(stage)}, ${
        streak > 0 ? `${streak} day streak` : 'no current streak'
      }${labelSuffix}`}
      accessibilityHint={
        selectMode ? 'Toggles selection' : 'Opens state details. Long-press to select.'
      }
    >
      {!isEnabled && <DiagonalStripes color={colors.stateDisabledStripe} />}

      {/* 3pt kind accent bar (left edge) */}
      <View
        pointerEvents="none"
        style={[styles.kindAccent, { backgroundColor: accentColor }]}
      />

      <View style={styles.tileContent}>
        <View style={styles.tileTopRow}>
          <Text
            numberOfLines={2}
            style={[styles.tileTitle, { color: textColor }]}
          >
            {behavior.title}
          </Text>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <IconSymbol name="flame.fill" size={12} color={colors.warning} />
              <Text style={[styles.streakNumber, { color: colors.warning }]}>
                {streak}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tileFooter}>
          <Text style={[styles.stageText, { color: textColor }]}>
            {isPaused ? 'Paused' : stageLabel(stage)}
          </Text>
          <Text style={[styles.tileWindow, { color: textColor }]}>
            {behavior.window.from === '00:00' && behavior.window.to === '23:59'
              ? 'All day'
              : `${behavior.window.from}–${behavior.window.to}`}
          </Text>
        </View>
      </View>

      <StreakConfetti
        triggerKey={burstKey}
        colors={{
          tintCelebrate: colors.tintCelebrate,
          warning: colors.warning,
          tint: colors.tint,
        }}
      />

      {selectMode ? (
        <View
          pointerEvents="none"
          style={[
            styles.selectBadge,
            {
              backgroundColor: isSelected ? colors.tint : colors.background,
              borderColor: isSelected ? colors.tint : colors.border,
            },
          ]}
        >
          {isSelected ? (
            <IconSymbol name="checkmark" size={14} color={colors.textOnBrand} />
          ) : null}
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

/**
 * Renders a diagonal-stripe overlay for paused/inactive state tiles.
 * Uses lightweight rotated View bars so we don't depend on SVG or images.
 */
function DiagonalStripes({ color }: { color: string }) {
  const bars = Array.from({ length: 14 });
  return (
    <View pointerEvents="none" style={styles.stripesContainer}>
      {bars.map((_, i) => (
        <View
          key={i}
          style={[
            styles.stripeBar,
            {
              top: i * 18 - 80,
              backgroundColor: color,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
    gap: Space.md,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Smaller secondary button slotted between the date and the + button. */
  headerSecondaryButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
  },
  dateText: {
    ...Type.bodyBold,
  },
  progressText: {
    ...Type.caption,
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridScroll: {
    padding: Space.lg,
    paddingTop: Space.sm,
  },
  relapseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  permissionBanner: {
    gap: Space.sm,
    padding: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  permissionBannerBody: {
    gap: Space.xs,
  },
  permissionBannerCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
  },
  permissionBannerCtaText: { ...Type.bodyBold },
  relapseBannerBody: {
    flex: 1,
    gap: Space.xs,
  },
  relapseBannerTitle: { ...Type.bodyBold },
  relapseBannerSub: { ...Type.caption },
  relapseBannerDismiss: {
    padding: Space.xs,
  },
  relapseBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  relapseBannerSnooze: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  relapseBannerSnoozeText: {
    ...Type.caption,
    fontWeight: '600',
  },
  /**
   * Undo-delete banner. Quiet visual chrome (surface, not danger) — the
   * tone is "the action succeeded, here's the reversal" rather than "are
   * you sure." 5-second TTL handled by the parent's useEffect.
   */
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  undoBannerBody: { flex: 1, gap: Space.xxs },
  undoBannerTitle: { ...Type.bodyBold },
  undoBannerSub: { ...Type.caption },
  undoBannerCta: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
  },
  undoBannerCtaText: { ...Type.bodyBold },
  undoBannerDismiss: {
    padding: Space.xs,
  },
  /** Calm success card shown when every state for today has been checked in. */
  allCaughtUpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  allCaughtUpBody: { flex: 1, gap: Space.xxs },
  allCaughtUpTitle: { ...Type.bodyBold },
  allCaughtUpSub: { ...Type.caption },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  tile: {
    width: `${(100 - 4) / 2}%`, // two columns with gap
    aspectRatio: 1,
    borderRadius: Radius.lg,
    padding: Space.md,
    paddingLeft: Space.md + 6, // room for kind accent bar
    justifyContent: 'space-between',
  },
  kindAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    zIndex: 1,
  },
  tileContent: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  tileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  tileTitle: {
    ...Type.bodyBold,
    flex: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  streakNumber: {
    ...Type.caption,
    fontWeight: '700',
  },
  tileFooter: {
    gap: Space.xs,
  },
  stageText: {
    ...Type.caption,
    fontWeight: '600',
  },
  tileWindow: {
    ...Type.micro,
    opacity: 0.85,
  },
  emptyTile: {
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs,
    paddingLeft: Space.md, // override tile's paddingLeft hack
  },
  emptyLabel: {
    ...Type.caption,
    fontWeight: '500',
  },
  emptyDashboard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxl,
    marginTop: Space.xxl,
    gap: Space.sm,
    alignItems: 'center',
  },
  emptyHeadline: {
    ...Type.h2,
  },
  emptyBody: {
    ...Type.body,
    textAlign: 'center',
  },
  emptyCtaRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  emptyCta: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    minWidth: 130,
    alignItems: 'center',
  },
  emptyCtaSecondary: {
    borderWidth: 1,
  },
  emptyCtaText: {
    ...Type.bodyBold,
  },
  stripesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  stripeBar: {
    position: 'absolute',
    left: -60,
    width: 300,
    height: 6,
    opacity: 0.25,
    transform: [{ rotate: '-45deg' }],
  },
  selectBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    borderTopWidth: 1,
  },
  bulkAction: {
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minWidth: 64,
  },
  bulkActionLabel: { ...Type.caption, fontWeight: '600' },
});
