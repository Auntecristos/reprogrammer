import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Behavior, ReminderAttempt } from '../types';
import { addDays, addMinutes, startOfDay } from 'date-fns';
import { generateUUID } from '../utils/uuid';
import useStore from '../store/useStore';
import { calculateStreak, consecutiveNoCount } from './streak';
import {
  perBehaviorDailyCap,
  shouldLevelUp,
  applyLevelUp,
  applyLapse,
  levelUpTransition,
  LAPSE_NO_THRESHOLD,
} from './levels';
import {
  generateTimesForDay,
  setLocalTimeOnDate,
  endOfLocalDay,
  dateKey,
  hashSeed,
  mulberry32,
  SCHEDULE_LEAD_MS,
} from './scheduler-core';

export { generateTimesForDay } from './scheduler-core';

const MAX_SCHEDULED = 60;
const RESCHEDULE_THROTTLE_MS = 60 * 1000;
const DAYS_HORIZON = 7;
const ANDROID_CHANNEL_ID = 'reprogrammer-checkin';

let lastRescheduleAt = 0;
let categoryRegistered = false;
let channelRegistered = false;

export const CHECKIN_CATEGORY = 'behavior_checkin';
export const ACTION_YES = 'CHECKIN_YES';
export const ACTION_NO = 'CHECKIN_NO';
export const ACTION_OFF = 'CHECKIN_OFF';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupNotificationCategory(): Promise<void> {
  if (!categoryRegistered) {
    // Action labels mirror the in-app check-in screen — Caught it / Missed
    // / Pause today — so users see the same words whether they respond from
    // the notification or open the app.
    await Notifications.setNotificationCategoryAsync(CHECKIN_CATEGORY, [
      {
        identifier: ACTION_YES,
        buttonTitle: 'Caught it',
        options: { opensAppToForeground: false },
      },
      {
        identifier: ACTION_NO,
        buttonTitle: 'Missed',
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: ACTION_OFF,
        buttonTitle: 'Pause today',
        options: { opensAppToForeground: false },
      },
    ]);
    categoryRegistered = true;
  }
  if (Platform.OS === 'android' && !channelRegistered) {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Check-ins',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    channelRegistered = true;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

interface Candidate {
  behavior: Behavior;
  timestamp: number;
}

function buildCandidatesForBehavior(
  behavior: Behavior,
  now: number,
  daysHorizon: number,
  quietHours?: { from: string; to: string }
): Candidate[] {
  const results: Candidate[] = [];
  const baseDate = new Date(now);
  const windowFromMin =
    setLocalTimeOnDate(baseDate, behavior.window.from) - startOfDay(baseDate).getTime();
  const windowToMin =
    setLocalTimeOnDate(baseDate, behavior.window.to) - startOfDay(baseDate).getTime();
  const windowMs = Math.max(0, windowToMin - windowFromMin);
  const windowHours = windowMs / (60 * 60 * 1000);
  const dailyCap = perBehaviorDailyCap(behavior.intervalMinutes, behavior.level, windowHours);

  for (let dayOffset = 0; dayOffset < daysHorizon; dayOffset++) {
    const date = addDays(startOfDay(now), dayOffset);
    if (!behavior.activeDays.includes(date.getDay())) continue;

    const rng = mulberry32(hashSeed(behavior.id, dateKey(date)));
    const times = generateTimesForDay({
      date,
      windowFrom: behavior.window.from,
      windowTo: behavior.window.to,
      intervalMinutes: behavior.intervalMinutes,
      level: behavior.level,
      now,
      rng,
      maxPings: dailyCap,
      quietHours,
      pausedUntil: behavior.pausedUntil,
    });
    for (const ts of times) {
      results.push({ behavior, timestamp: ts });
    }
  }
  return results;
}

async function scheduleCandidate(c: Candidate): Promise<void> {
  if (c.timestamp <= Date.now() + SCHEDULE_LEAD_MS) return;
  const store = useStore.getState();
  const attemptId = generateUUID();

  const body =
    c.behavior.kind === 'eliminate'
      ? `CATCH IT — ${c.behavior.pingMessage}`
      : c.behavior.pingMessage;

  try {
    const content: Notifications.NotificationContentInput = {
      title: c.behavior.title,
      body,
      sound: true,
      vibrate: [0, 250, 250, 250],
      categoryIdentifier: CHECKIN_CATEGORY,
      data: {
        behaviorId: c.behavior.id,
        attemptId,
        phase: 'initial',
      },
    };
    if (Platform.OS === 'android') {
      (content as any).channelId = ANDROID_CHANNEL_ID;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: 'date', date: new Date(c.timestamp) } as any,
    });

    const attempt: ReminderAttempt = {
      id: attemptId,
      behaviorId: c.behavior.id,
      scheduledFor: c.timestamp,
      phase: 'initial',
      status: 'scheduled',
      noCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notificationId,
    };
    await store.addReminderAttempt(attempt);
  } catch (error) {
    console.error('[SCHEDULER] Failed to schedule notification:', error);
  }
}

export async function scheduleForBehavior(behavior: Behavior): Promise<void> {
  await rescheduleAll({ force: true });
}

export async function rescheduleAll(options?: { force?: boolean }): Promise<void> {
  const now = Date.now();
  if (!options?.force && now - lastRescheduleAt < RESCHEDULE_THROTTLE_MS) return;
  lastRescheduleAt = now;

  const store = useStore.getState();
  await cancelAllScheduled();

  const active = store.behaviors.filter((b) => !b.hidden);
  if (active.length === 0) return;

  const quietHours = store.appProfile.quietHours;
  const all: Candidate[] = [];
  for (const b of active) {
    all.push(...buildCandidatesForBehavior(b, now, DAYS_HORIZON, quietHours));
  }
  all.sort((a, b) => a.timestamp - b.timestamp);
  const toSchedule = all.slice(0, MAX_SCHEDULED);
  for (const c of toSchedule) {
    await scheduleCandidate(c);
  }
}

async function cancelAllScheduled(): Promise<void> {
  const store = useStore.getState();
  const open = store.reminderAttempts.filter((a) => a.status === 'scheduled');
  for (const attempt of open) {
    if (attempt.notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(attempt.notificationId);
      } catch {
        // already fired or invalid; safe to ignore
      }
    }
    await store.updateReminderAttempt({
      ...attempt,
      status: 'disabled',
      updatedAt: Date.now(),
    });
  }
}

export async function cancelForBehavior(behaviorId: string): Promise<void> {
  const store = useStore.getState();
  const attempts = store.reminderAttempts.filter(
    (a) => a.behaviorId === behaviorId && a.status === 'scheduled'
  );
  for (const attempt of attempts) {
    if (attempt.notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(attempt.notificationId);
      } catch {
        // already fired
      }
    }
    await store.updateReminderAttempt({
      ...attempt,
      status: 'disabled',
      updatedAt: Date.now(),
    });
  }
}

export async function sendTestNotification(behavior: Behavior): Promise<void> {
  const store = useStore.getState();
  const attemptId = generateUUID();

  const content: Notifications.NotificationContentInput = {
    title: behavior.title,
    body: behavior.pingMessage,
    sound: true,
    vibrate: [0, 250, 250, 250],
    categoryIdentifier: CHECKIN_CATEGORY,
    data: { behaviorId: behavior.id, attemptId, phase: 'initial' },
  };
  if (Platform.OS === 'android') {
    (content as any).channelId = ANDROID_CHANNEL_ID;
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content,
    trigger: { type: 'timeInterval', seconds: 1, repeats: false } as any,
  });

  const attempt: ReminderAttempt = {
    id: attemptId,
    behaviorId: behavior.id,
    scheduledFor: Date.now() + 1000,
    phase: 'initial',
    status: 'scheduled',
    noCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notificationId,
  };
  await store.addReminderAttempt(attempt);
}

export async function handleNotificationAction(
  behaviorId: string,
  attemptId: string,
  actionId: string
): Promise<void> {
  const store = useStore.getState();
  const behavior = store.behaviors.find((b) => b.id === behaviorId);
  if (!behavior) return;

  if (actionId === ACTION_OFF) {
    await store.updateBehavior({ ...behavior, pausedUntil: endOfLocalDay() });
    await cancelForBehavior(behaviorId);
    return;
  }

  const result: 'yes' | 'no' | null =
    actionId === ACTION_YES ? 'yes' : actionId === ACTION_NO ? 'no' : null;
  if (!result) return;

  const checkIn = {
    id: generateUUID(),
    behaviorId,
    at: Date.now(),
    result,
  };
  await store.addCheckIn(checkIn);
  await handleCheckInResponse(behaviorId, attemptId, result);
}

export async function handleCheckInResponse(
  behaviorId: string,
  attemptId: string,
  result: 'yes' | 'tried' | 'no'
): Promise<void> {
  const store = useStore.getState();
  const attempt = store.reminderAttempts.find((a) => a.id === attemptId);
  const behavior = store.behaviors.find((b) => b.id === behaviorId);
  if (!behavior) return;

  if (attempt && (attempt.status === 'resolved' || attempt.status === 'disabled')) {
    // idempotency: don't double-process a fired-then-cancelled attempt
    return;
  }

  if (result === 'yes' || result === 'tried') {
    if (attempt) {
      await store.updateReminderAttempt({
        ...attempt,
        status: 'resolved',
        updatedAt: Date.now(),
      });
    }
    // Only a clean 'yes' day can trigger level-up.
    if (result === 'yes') {
      const streak = calculateStreak(behaviorId, store.checkIns);
      if (shouldLevelUp(streak, behavior.lastLevelUpStreak)) {
        const { fromStage, toStage } = levelUpTransition(behavior.level, streak);
        await store.updateBehavior(applyLevelUp(behavior, streak));
        await rescheduleAll({ force: true });
        // Queue the celebration — the root LevelUpModal renders on the next
        // store tick, regardless of which screen the user is on (in-app
        // check-in modal, notification action from background, etc.).
        store.setPendingLevelUp({
          behaviorId,
          behaviorTitle: behavior.title,
          fromStage,
          toStage,
          streak,
          triggeredAt: Date.now(),
        });
      }
    }
    return;
  }

  // result === 'no'
  if (!attempt) return;
  const noCount = attempt.noCount + 1;

  await store.updateReminderAttempt({
    ...attempt,
    status: 'skipped',
    noCount,
    updatedAt: Date.now(),
  });

  const consecutiveNos = consecutiveNoCount(behaviorId, store.checkIns);
  if (consecutiveNos >= LAPSE_NO_THRESHOLD) {
    await store.updateBehavior({
      ...applyLapse(behavior),
      pausedUntil: endOfLocalDay(),
    });
    await cancelForBehavior(behaviorId);
    // Surface the compassionate restart banner on next dashboard render.
    await store.updateAppProfile({
      lastLapseAt: Date.now(),
      lastLapseAcknowledged: false,
    });
    return;
  }

  if (noCount < 2) {
    const nextPhase: 'snooze15' | 'snooze30' = noCount === 1 ? 'snooze15' : 'snooze30';
    const snoozeMinutes = nextPhase === 'snooze15' ? 15 : 30;
    const snoozeTime = addMinutes(Date.now(), snoozeMinutes);
    const newAttemptId = generateUUID();

    const content: Notifications.NotificationContentInput = {
      title: behavior.title,
      body:
        behavior.kind === 'eliminate'
          ? `CATCH IT — ${behavior.pingMessage}`
          : behavior.pingMessage,
      sound: true,
      vibrate: [0, 250, 250, 250],
      categoryIdentifier: CHECKIN_CATEGORY,
      data: { behaviorId, attemptId: newAttemptId, phase: nextPhase },
    };
    if (Platform.OS === 'android') {
      (content as any).channelId = ANDROID_CHANNEL_ID;
    }

    const newNotificationId = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: 'date', date: snoozeTime } as any,
    });

    const newAttempt: ReminderAttempt = {
      id: newAttemptId,
      behaviorId,
      scheduledFor: snoozeTime.getTime(),
      phase: nextPhase,
      status: 'scheduled',
      noCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notificationId: newNotificationId,
    };
    await store.addReminderAttempt(newAttempt);
  }
}
