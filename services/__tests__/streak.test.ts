/**
 * Lightweight self-test for streak calculation. Run with:
 *   npx ts-node services/__tests__/streak.test.ts
 *
 * Verifies:
 *  - Basic counting of consecutive 'yes' days
 *  - 'no' breaks the streak
 *  - 'tried' is streak-preserving but not streak-advancing
 *  - 1-day gap allowed; 2-day gap breaks
 *  - Best-of-day wins when a day has multiple check-ins
 *  - consecutiveNoCount: only 'no' counts; 'yes' or 'tried' interrupt
 */
import { startOfDay, subDays } from 'date-fns';
import {
  STREAK_MILESTONES,
  calculateStreak,
  consecutiveNoCount,
  isStreakMilestone,
} from '../streak';
import { CheckIn } from '../../types';

let failures = 0;
function expect(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
}

const B = 'b1';
const today = startOfDay(Date.now()).getTime();
// `daysAgo` selects the day; `hour` (0–23, default 12) selects time-of-day so
// tests with multiple same-day check-ins can specify a chronological order.
const day = (n: number, hour = 12) =>
  startOfDay(subDays(today, n)).getTime() + hour * 60 * 60 * 1000;
const ci = (
  daysAgo: number,
  result: 'yes' | 'tried' | 'no',
  opts: { hour?: number; behaviorId?: string } = {}
): CheckIn => ({
  id: `${opts.behaviorId ?? B}-${daysAgo}-${opts.hour ?? 12}-${result}-${Math.random()}`,
  behaviorId: opts.behaviorId ?? B,
  at: day(daysAgo, opts.hour),
  result,
});

// --- calculateStreak ---

expect(calculateStreak(B, []) === 0, 'empty check-ins → 0');

expect(calculateStreak(B, [ci(0, 'yes')]) === 1, 'today yes → 1');

expect(
  calculateStreak(B, [ci(0, 'yes'), ci(1, 'yes'), ci(2, 'yes')]) === 3,
  'three consecutive yes → 3'
);

expect(calculateStreak(B, [ci(0, 'no')]) === 0, 'today no → 0');

expect(
  calculateStreak(B, [ci(0, 'yes'), ci(1, 'no')]) === 1,
  'today yes + yesterday no → 1 (no breaks the chain at yesterday)'
);

expect(
  calculateStreak(B, [ci(0, 'yes'), ci(2, 'yes')]) === 2,
  '1-day gap allowed: today yes, 2 days ago yes, nothing yesterday → 2'
);

expect(
  calculateStreak(B, [ci(0, 'yes'), ci(3, 'yes')]) === 1,
  '2-day gap breaks: today yes, 3 days ago yes → 1'
);

// 'tried' behavior
expect(
  calculateStreak(B, [ci(0, 'yes'), ci(1, 'tried'), ci(2, 'yes')]) === 2,
  'tried preserves chain but does not increment: yes/tried/yes → 2'
);

expect(
  calculateStreak(B, [ci(0, 'tried')]) === 0,
  'today tried only → 0 (no yes ever)'
);

expect(
  calculateStreak(B, [ci(0, 'tried'), ci(1, 'yes')]) === 1,
  'today tried + yesterday yes → 1 (tried preserves; yesterday yes counts)'
);

expect(
  calculateStreak(B, [ci(0, 'tried'), ci(1, 'no')]) === 0,
  'today tried + yesterday no → 0 (no breaks chain)'
);

// Best-of-day: a day with both yes and no still counts as a yes day
expect(
  calculateStreak(B, [ci(0, 'no', { hour: 9 }), ci(0, 'yes', { hour: 14 })]) === 1,
  'best-of-day: today has both no and yes → counts as yes'
);

// tried + yes same day → yes wins
expect(
  calculateStreak(B, [
    ci(0, 'tried', { hour: 9 }),
    ci(0, 'yes', { hour: 14 }),
    ci(1, 'yes'),
  ]) === 2,
  'best-of-day: today has tried and yes → counts as yes'
);

// --- consecutiveNoCount ---

expect(consecutiveNoCount(B, []) === 0, 'no check-ins → 0 nos');

expect(consecutiveNoCount(B, [ci(0, 'no')]) === 1, 'one no today → 1');

expect(
  consecutiveNoCount(B, [
    ci(0, 'no', { hour: 10 }),
    ci(0, 'no', { hour: 14 }),
  ]) === 2,
  'two nos today → 2'
);

expect(
  consecutiveNoCount(B, [
    ci(0, 'no', { hour: 9 }),
    ci(0, 'no', { hour: 13 }),
    ci(0, 'no', { hour: 17 }),
  ]) === 3,
  'three nos today → 3 (lapse threshold)'
);

// Order: earliest yes, then two nos. After sort desc → no, no, yes → 2 nos.
expect(
  consecutiveNoCount(B, [
    ci(0, 'yes', { hour: 8 }),
    ci(0, 'no', { hour: 12 }),
    ci(0, 'no', { hour: 16 }),
  ]) === 2,
  'most-recent yes interrupts: yes (8h), no (12h), no (16h) → 2'
);

// tried interrupts the no-run for lapse detection
expect(
  consecutiveNoCount(B, [
    ci(0, 'tried', { hour: 8 }),
    ci(0, 'no', { hour: 12 }),
    ci(0, 'no', { hour: 16 }),
  ]) === 2,
  'tried interrupts: tried (8h), no (12h), no (16h) → 2'
);

// Cross-behavior isolation
expect(
  consecutiveNoCount(B, [
    ci(0, 'no', { behaviorId: 'other' }),
    ci(0, 'no', { behaviorId: 'other' }),
  ]) === 0,
  'other behaviors do not contribute to no-count'
);

// --- isStreakMilestone ---

expect(isStreakMilestone(0) === false, '0 is not a milestone');
expect(isStreakMilestone(1) === false, '1 is not a milestone');
expect(isStreakMilestone(2) === false, '2 is not a milestone');
expect(isStreakMilestone(3) === true, '3 is the first milestone');
expect(isStreakMilestone(7) === true, '7 is a milestone (level-up boundary)');
expect(isStreakMilestone(14) === true, '14 is a milestone');
expect(isStreakMilestone(30) === true, '30 is a milestone');
expect(isStreakMilestone(8) === false, '8 is not a milestone');
expect(isStreakMilestone(31) === false, '31 is not a milestone (no celebration past 30)');
expect(isStreakMilestone(100) === false, 'large streaks are quiet');

expect(
  STREAK_MILESTONES.length === 4 &&
    STREAK_MILESTONES[0] === 3 &&
    STREAK_MILESTONES[STREAK_MILESTONES.length - 1] === 30,
  'STREAK_MILESTONES exposes the canonical [3,7,14,30] list'
);

// --- summary ---
if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('All streak tests passed.');
