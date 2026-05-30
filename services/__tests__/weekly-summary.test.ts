/**
 * Tests for the Profile "This week" derivation. Run with:
 *   npx tsx services/__tests__/weekly-summary.test.ts
 *
 * Verifies:
 *  - Window is a rolling 7 days ending today (anchor = startOfDay(now-6))
 *  - Check-ins older than the window aren't counted
 *  - caught / tried only count results matching their bucket
 *  - untouched counts non-hidden behaviors with zero check-ins this week
 *  - hidden behaviors don't count toward untouched
 */
import { addDays, startOfDay } from 'date-fns';
import { computeWeeklySummary } from '../weekly-summary';
import { Behavior, CheckIn } from '../../types';

let failures = 0;
function expect(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
}

const NOW = new Date(2026, 4, 27, 12, 0, 0).getTime();
const dayMs = (daysAgo: number) =>
  startOfDay(addDays(NOW, -daysAgo)).getTime() + 12 * 60 * 60 * 1000;

const behavior = (id: string, hidden: boolean = false): Behavior => ({
  id,
  kind: 'adopt',
  title: id,
  pingMessage: 'x',
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  window: { from: '09:00', to: '21:00' },
  intervalMinutes: 15,
  level: 1,
  lastLevelUpStreak: 0,
  createdAt: 0,
  hidden,
  bookmarked: false,
});

const ci = (
  behaviorId: string,
  daysAgo: number,
  result: 'yes' | 'tried' | 'no'
): CheckIn => ({
  id: `${behaviorId}-${daysAgo}-${result}-${Math.random()}`,
  behaviorId,
  at: dayMs(daysAgo),
  result,
});

// --- empty inputs ---

const empty = computeWeeklySummary([], [], NOW);
expect(
  empty.checkIns === 0 && empty.caught === 0 && empty.tried === 0,
  'empty inputs → all zero'
);
expect(empty.untouched === 0, 'no behaviors → untouched is 0');

// --- window edge ---

const justInside = computeWeeklySummary(
  [behavior('b1')],
  [ci('b1', 6, 'yes')],
  NOW
);
expect(
  justInside.checkIns === 1 && justInside.caught === 1,
  '6 days ago → inside the 7-day window'
);

const justOutside = computeWeeklySummary(
  [behavior('b1')],
  [ci('b1', 7, 'yes')],
  NOW
);
expect(
  justOutside.checkIns === 0,
  '7 days ago → outside the 7-day window'
);

// --- buckets ---

const mixed = computeWeeklySummary(
  [behavior('b1')],
  [
    ci('b1', 0, 'yes'),
    ci('b1', 1, 'yes'),
    ci('b1', 2, 'tried'),
    ci('b1', 3, 'no'),
    ci('b1', 4, 'yes'),
  ],
  NOW
);
expect(
  mixed.checkIns === 5,
  'total counts every check-in regardless of result'
);
expect(mixed.caught === 3, 'caught counts only result === yes');
expect(mixed.tried === 1, 'tried counts only result === tried');

// --- untouched ---

const allTouched = computeWeeklySummary(
  [behavior('b1'), behavior('b2'), behavior('b3')],
  [ci('b1', 0, 'yes'), ci('b2', 1, 'tried'), ci('b3', 4, 'no')],
  NOW
);
expect(
  allTouched.untouched === 0,
  'every behavior has at least one check-in → untouched = 0'
);

const someTouched = computeWeeklySummary(
  [behavior('b1'), behavior('b2'), behavior('b3')],
  [ci('b1', 0, 'yes')],
  NOW
);
expect(
  someTouched.untouched === 2,
  'b2 + b3 untouched this week → untouched = 2'
);

const hiddenTouched = computeWeeklySummary(
  [behavior('b1', true), behavior('b2')],
  [],
  NOW
);
expect(
  hiddenTouched.untouched === 1,
  'hidden behaviors do not contribute to untouched'
);

const oldCheckInDoesntSaveYou = computeWeeklySummary(
  [behavior('b1')],
  [ci('b1', 10, 'yes')],
  NOW
);
expect(
  oldCheckInDoesntSaveYou.untouched === 1,
  'a 10-day-old check-in does NOT keep a behavior off the untouched list'
);

if (failures === 0) {
  console.log('All weekly-summary tests passed.');
  process.exit(0);
} else {
  console.error(`FAILED — ${failures} test(s) failed.`);
  process.exit(1);
}
