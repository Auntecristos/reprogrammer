import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Type, Space, Radius } from '@/constants/theme';
import useStore from '@/store/useStore';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { cancelForBehavior, rescheduleAll, sendTestNotification } from '@/services/notifications';
import { endOfLocalDay } from '@/services/scheduler-core';
import { deriveStage, stageLabel } from '@/services/levels';
import { domainLabel } from '@/services/library-content';
import { useContentModals } from '@/components/library/content-modals-provider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CalendarHeatmap } from '@/components/calendar-heatmap';

function formatPausedUntil(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BehaviorDetailScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { id } = useLocalSearchParams();
  const {
    behaviors,
    checkIns,
    getStreak,
    deleteBehavior,
    updateBehavior,
    updateCheckIn,
    getReminderAttempts,
    setPendingUndo,
  } = useStore();
  const { openGuide } = useContentModals();
  const [, setRefresh] = useState({});

  useFocusEffect(
    useCallback(() => {
      setRefresh({});
    }, [])
  );

  const behavior = behaviors.find(b => b.id === id as string);
  const behaviorCheckIns = (behavior
    ? checkIns.filter(c => c.behaviorId === behavior.id).sort((a, b) => b.at - a.at)
    : []
  ).slice(0, 20);

  if (!behavior) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>
          State not found
        </Text>
      </View>
    );
  }

  const streak = getStreak(behavior.id);

  const handleEdit = () => {
    router.push({ pathname: '/create', params: { id: behavior.id } });
  };

  const handleDelete = () => {
    Alert.alert('Delete State', 'You can undo this for 5 seconds.', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          // Snapshot the behavior + its attempts BEFORE deletion so the
          // dashboard's Undo banner can restore it cleanly.
          const attemptsBackup = getReminderAttempts(behavior.id);
          await cancelForBehavior(behavior.id);
          await deleteBehavior(behavior.id);
          setPendingUndo({
            kind: 'delete',
            behavior,
            attempts: attemptsBackup,
            deletedAt: Date.now(),
          });
          router.back();
        },
        style: 'destructive',
      },
    ]);
  };

  const handleToggleBookmark = async () => {
    await updateBehavior({
      ...behavior,
      bookmarked: !behavior.bookmarked,
    });
  };

  const handleArchive = async () => {
    await updateBehavior({
      ...behavior,
      hidden: true,
    });
    router.back();
  };

  const handleTestNotification = async () => {
    try {
      await sendTestNotification(behavior);
      Alert.alert('Test Notification Sent', 'Check your notifications in 1 second');
    } catch (error) {
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  /**
   * Long-press a check-in row to change its result. Useful when the user
   * tapped the wrong button on a notification action ("Missed" instead of
   * "Caught it") and the streak got broken.
   */
  const handleCheckInLongPress = (checkInId: string, currentResult: 'yes' | 'tried' | 'no') => {
    const options: { label: string; value: 'yes' | 'tried' | 'no' }[] = [
      { label: 'Caught it', value: 'yes' },
      { label: 'Tried', value: 'tried' },
      { label: 'Missed', value: 'no' },
    ];
    Alert.alert(
      'Change check-in result',
      'This recomputes your streak.',
      [
        ...options
          .filter((o) => o.value !== currentResult)
          .map((o) => ({
            text: o.label,
            onPress: () => updateCheckIn(checkInId, o.value),
          })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const isPaused = behavior.pausedUntil != null && behavior.pausedUntil > Date.now();

  const pauseUntil = (resumeAt: number) =>
    Promise.all([
      updateBehavior({ ...behavior, pausedUntil: resumeAt }),
      cancelForBehavior(behavior.id),
    ]);

  const DAY_MS = 24 * 60 * 60 * 1000;

  const handlePausePress = () => {
    if (isPaused) {
      Alert.alert(
        'Resume now?',
        `${behavior.title} is paused until ${formatPausedUntil(behavior.pausedUntil!)}.`,
        [
          { text: 'Stay paused', style: 'cancel' },
          {
            text: 'Resume now',
            onPress: () =>
              Promise.all([
                updateBehavior({ ...behavior, pausedUntil: undefined }),
                rescheduleAll({ force: true }),
              ]),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Pause this state',
      'Reminders stop; your streak and history stay. Pick a length — you can resume any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Until tonight', onPress: () => pauseUntil(endOfLocalDay()) },
        { text: '1 day', onPress: () => pauseUntil(Date.now() + DAY_MS) },
        { text: '3 days', onPress: () => pauseUntil(Date.now() + 3 * DAY_MS) },
        { text: '1 week', onPress: () => pauseUntil(Date.now() + 7 * DAY_MS) },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            {behavior.domain ? (
              <Text
                style={[styles.domainEyebrow, { color: colors.textMuted }]}
                accessibilityLabel={`Domain: ${domainLabel(behavior.domain)}`}
              >
                {domainLabel(behavior.domain).toUpperCase()}
              </Text>
            ) : null}
            <Text style={[styles.title, { color: colors.text }]}>
              {behavior.title}
            </Text>
          </View>
          {__DEV__ && (
            <Pressable
              onPress={handleTestNotification}
              style={[styles.testButton, { borderColor: colors.border }]}
              accessibilityLabel="Send test notification"
            >
              <Text
                style={[styles.testButtonText, { color: colors.textMuted }]}
              >
                Test
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={[styles.message, { color: colors.text }]}>
          {behavior.pingMessage}
        </Text>
        {isPaused ? (
          <View
            style={[
              styles.pausedChip,
              { backgroundColor: colors.warningSoft, borderColor: colors.warning },
            ]}
          >
            <IconSymbol name="pause.fill" size={12} color={colors.warning} />
            <Text style={[styles.pausedChipText, { color: colors.warning }]}>
              Paused until {formatPausedUntil(behavior.pausedUntil!)}
            </Text>
          </View>
        ) : null}
        {behavior.libraryGuideId ? (
          <Pressable
            onPress={() => openGuide(behavior.libraryGuideId!)}
            style={styles.guideLink}
            accessibilityLabel="Read the guide"
          >
            <IconSymbol name="book.fill" size={14} color={colors.tint} />
            <Text style={[styles.guideLinkText, { color: colors.tint }]}>
              Read the guide
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.streakCard, { backgroundColor: colors.tint }]}>
        <Text style={[styles.streakLabel, { color: colors.textOnBrand }]}>
          {stageLabel(deriveStage(behavior.level, streak))}
        </Text>
        <Text style={[styles.streakValue, { color: colors.textOnBrand }]}>
          {streak}
        </Text>
        <Text style={[styles.streakDays, { color: colors.textOnBrand }]}>
          day streak
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Last 8 weeks
        </Text>
        <CalendarHeatmap
          behaviorId={behavior.id}
          checkIns={checkIns}
          activeDays={behavior.activeDays}
          colors={colors}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Details
        </Text>
        <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
          <Text style={[styles.detailLabel, { color: colors.text }]}>Time Window</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {behavior.window.from === '00:00' && behavior.window.to === '23:59'
              ? 'All day'
              : `${behavior.window.from} – ${behavior.window.to}`}
          </Text>
        </View>
        <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
          <Text style={[styles.detailLabel, { color: colors.text }]}>Interval</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            every {behavior.intervalMinutes} min
          </Text>
        </View>
        <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
          <Text style={[styles.detailLabel, { color: colors.text }]}>Level</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            L{behavior.level} · {stageLabel(deriveStage(behavior.level, streak))}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Recent Check-ins
        </Text>
        {behaviorCheckIns.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No check-ins yet
          </Text>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={behaviorCheckIns}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const date = new Date(item.at);
              const timeStr = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const dateStr = date.toLocaleDateString();

              const isEliminate = behavior.kind === 'eliminate';
              const resultStyle = {
                yes: {
                  bg: colors.successSoft,
                  stripe: colors.success,
                  labelColor: colors.success,
                  glyph: isEliminate ? '✓ Caught it' : '✓ Practiced',
                },
                tried: {
                  bg: colors.warningSoft,
                  stripe: colors.warning,
                  labelColor: colors.warning,
                  glyph: isEliminate ? '◐ Struggled' : '◐ Showed up',
                },
                no: {
                  bg: colors.surfaceMuted,
                  stripe: colors.textMuted,
                  labelColor: colors.text,
                  glyph: '× Skipped',
                },
              }[item.result];

              return (
                <Pressable
                  onLongPress={() => handleCheckInLongPress(item.id, item.result)}
                  delayLongPress={400}
                  accessibilityLabel={`Check-in: ${resultStyle.glyph}, ${dateStr} ${timeStr}`}
                  accessibilityHint="Long-press to change the result"
                  style={[
                    styles.checkInItem,
                    {
                      backgroundColor: resultStyle.bg,
                      borderLeftColor: resultStyle.stripe,
                    },
                  ]}
                >
                  <View style={styles.checkInHeader}>
                    <Text
                      style={[
                        styles.checkInResult,
                        { color: resultStyle.labelColor },
                      ]}
                    >
                      {resultStyle.glyph}
                    </Text>
                    <Text style={[styles.checkInTime, { color: colors.text }]}>
                      {dateStr} {timeStr}
                    </Text>
                  </View>
                  {item.note && (
                    <Text style={[styles.checkInNote, { color: colors.text }]}>
                      {item.note}
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>

      <View style={styles.actionButtons}>
        {/* Primary actions — frequently used, non-destructive */}
        <Pressable
          onPress={handleEdit}
          style={[styles.actionButton, { backgroundColor: colors.tint }]}
          accessibilityLabel="Edit state"
        >
          <Text
            style={[styles.actionButtonText, { color: colors.textOnBrand }]}
          >
            Edit
          </Text>
        </Pressable>
        <Pressable
          onPress={handleToggleBookmark}
          style={[
            styles.actionButton,
            {
              borderColor: colors.tint,
              borderWidth: 1,
              backgroundColor: 'transparent',
            },
          ]}
          accessibilityLabel={
            behavior.bookmarked ? 'Remove bookmark' : 'Bookmark state'
          }
        >
          <Text style={[styles.actionButtonText, { color: colors.tint }]}>
            {behavior.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
          </Text>
        </Pressable>
        <Pressable
          onPress={handlePausePress}
          style={[
            styles.actionButton,
            {
              borderColor: colors.warning,
              borderWidth: 1,
              backgroundColor: isPaused ? colors.warningSoft : 'transparent',
            },
          ]}
          accessibilityLabel={isPaused ? 'Resume state' : 'Pause state'}
          accessibilityHint={
            isPaused
              ? 'Resume reminders for this state'
              : 'Stop reminders temporarily without losing your streak'
          }
        >
          <Text style={[styles.actionButtonText, { color: colors.warning }]}>
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </Text>
        </Pressable>

        {/* Visual separator before destructive group */}
        <View style={styles.actionDivider} />

        {/* Destructive / archival actions — separated by spacing */}
        <Pressable
          onPress={handleArchive}
          style={[styles.actionButton, { backgroundColor: colors.surfaceMuted }]}
          accessibilityLabel="Archive state"
        >
          <Text style={[styles.actionButtonText, { color: colors.text }]}>
            Archive
          </Text>
        </Pressable>
        <Pressable
          onPress={handleDelete}
          style={[styles.actionButton, { backgroundColor: colors.danger }]}
          accessibilityLabel="Delete state"
          accessibilityHint="Permanently removes this state and all its history"
        >
          <Text style={[styles.actionButtonText, { color: colors.textOnBrand }]}>
            Delete
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: Space.xl,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    marginBottom: Space.sm,
  },
  domainEyebrow: {
    ...Type.micro,
    marginBottom: Space.xs,
  },
  title: { ...Type.h1 },
  testButton: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  testButtonText: { ...Type.caption, fontWeight: '600' },
  message: { ...Type.body, marginBottom: Space.sm },
  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.sm,
  },
  guideLinkText: {
    ...Type.bodyBold,
  },
  pausedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    marginTop: Space.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  pausedChipText: { ...Type.caption, fontWeight: '600' },
  streakCard: {
    margin: Space.xl,
    padding: Space.xxl,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  streakLabel: {
    ...Type.body,
    marginBottom: Space.xs,
  },
  streakValue: {
    ...Type.display,
  },
  streakDays: {
    ...Type.body,
  },
  section: {
    paddingHorizontal: Space.xl,
    marginBottom: Space.xl,
  },
  sectionTitle: {
    ...Type.h2,
    marginBottom: Space.md,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: 1,
  },
  detailLabel: { ...Type.body },
  detailValue: { ...Type.bodyBold },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Space.xl,
    ...Type.body,
  },
  checkInItem: {
    padding: Space.md,
    borderRadius: Radius.sm,
    marginBottom: Space.sm,
    borderLeftWidth: 4,
  },
  checkInHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  checkInResult: { ...Type.bodyBold },
  checkInTime: { ...Type.caption },
  checkInNote: { ...Type.caption, marginTop: Space.xs },
  actionButtons: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  actionDivider: {
    height: Space.xl,
  },
  actionButton: {
    padding: Space.md,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  actionButtonText: {
    ...Type.bodyBold,
  },
  errorText: {
    textAlign: 'center',
    ...Type.body,
    marginTop: Space.xl,
  },
});
