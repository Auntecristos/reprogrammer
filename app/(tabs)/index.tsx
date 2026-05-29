import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useCallback, useState, type ComponentProps } from 'react';
import { Alert } from 'react-native';
import type { Behavior } from '@/types';
import { deriveStage, stageLabel } from '@/services/levels';
import { useContentModals } from '@/components/library/content-modals-provider';
import { cancelForBehavior, rescheduleAll } from '@/services/notifications';
import { endOfLocalDay } from '@/services/scheduler-core';

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
  const todaysAttemptsCount = reminderAttempts.filter(
    (a) => a.scheduledFor >= todayStart && a.scheduledFor < todayEnd && a.phase === 'initial'
  ).length;

  const handleCreate = () => router.push('/create');
  const handleOpenProfile = () => router.push('/explore');

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

  const showRelapseBanner =
    appProfile.lastLapseAt != null &&
    appProfile.lastLapseAcknowledged !== true &&
    Date.now() - appProfile.lastLapseAt < RELAPSE_BANNER_TTL_MS;

  const handleOpenRelapseGuide = () => {
    openGuide('guide-relapse-and-restart');
    void updateAppProfile({ lastLapseAcknowledged: true });
  };

  const handleDismissRelapseBanner = () => {
    void updateAppProfile({ lastLapseAcknowledged: true });
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
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.gridScroll}>
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
            <Pressable
              onPress={handleDismissRelapseBanner}
              style={styles.relapseBannerDismiss}
              hitSlop={8}
              accessibilityLabel="Dismiss restart prompt"
            >
              <IconSymbol name="xmark" size={16} color={colors.textMuted} />
            </Pressable>
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
                onPress={() => router.push('/(tabs)/states')}
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

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[
        styles.tile,
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
    </Pressable>
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
    borderRadius: 22,
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
    borderRadius: 11,
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
