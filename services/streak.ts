import { CheckIn } from '../types';
import { startOfDay, subDays, addDays } from 'date-fns';

/**
 * Streak day-counts that trigger a celebration burst on the dashboard tile.
 * 3 = first hard-won repeat, 7 = level-up boundary, 14 = "doing the thing,"
 * 30 = monthly habit. Beyond 30 we deliberately quiet down — the goal is
 * to fade celebrations into background as the practice becomes identity.
 */
export const STREAK_MILESTONES = [3, 7, 14, 30] as const;

export function isStreakMilestone(streak: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(streak);
}

export function calculateStreak(behaviorId: string, checkIns: CheckIn[]): number {
  const behaviorCheckIns = checkIns.filter((ci) => ci.behaviorId === behaviorId);
  if (behaviorCheckIns.length === 0) return 0;

  let streak = 0;
  let currentDate = startOfDay(Date.now()).getTime();

  // Bounded walk-back: at most 365 days to prevent pathological loops.
  for (let i = 0; i < 365; i++) {
    const dayEnd = startOfDay(addDays(currentDate, 1)).getTime();
    const todays = behaviorCheckIns.filter(
      (ci) => ci.at >= currentDate && ci.at < dayEnd
    );

    if (todays.length === 0) {
      // No check-in this day. Allow a 1-day grace: if there's a check-in
      // yesterday, jump back to it; otherwise the streak ends.
      const yesterdayStart = startOfDay(subDays(currentDate, 1)).getTime();
      const hasYesterdayCheckIn = behaviorCheckIns.some(
        (ci) => ci.at >= yesterdayStart && ci.at < currentDate
      );
      if (!hasYesterdayCheckIn) break;
      currentDate = yesterdayStart;
      continue;
    }

    // Best-of-day wins: yes > tried > no.
    if (todays.some((ci) => ci.result === 'yes')) {
      streak++;
    } else if (!todays.some((ci) => ci.result === 'tried')) {
      // All 'no' on this day — streak ends.
      break;
    }
    // 'yes' advances and walks back; 'tried' preserves and walks back.
    currentDate = startOfDay(subDays(currentDate, 1)).getTime();
  }

  return streak;
}

/**
 * Counts consecutive "no" check-ins on the most recent calendar day for a
 * behavior. Used to detect lapse (3 consecutive nos → pause until EoD).
 *
 * `tried` and `yes` both interrupt the no-streak.
 */
export function consecutiveNoCount(behaviorId: string, checkIns: CheckIn[]): number {
  const todayStart = startOfDay(Date.now()).getTime();
  const todayEnd = startOfDay(addDays(todayStart, 1)).getTime();
  const todays = checkIns
    .filter((ci) => ci.behaviorId === behaviorId && ci.at >= todayStart && ci.at < todayEnd)
    .sort((a, b) => b.at - a.at);

  let count = 0;
  for (const ci of todays) {
    if (ci.result === 'no') count++;
    else break;
  }
  return count;
}
