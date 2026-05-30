/**
 * Tests for the calendar heat-map cell derivation. Run with:
 *   npx tsx services/__tests__/heatmap.test.ts
 *
 * Verifies:
 *  - Grid shape: weeksToShow * 7 cells, oldest first
 *  - Today is in the rightmost column, and future days in that column are
 *    flagged isFuture=true so the component can blank them out
 *  - Inactive weekdays are flagged isActive=false (independent of result)
 *  - Best-of-day result picks yes over tried over no
 *  - Cross-behavior check-ins are not counted in this behavior's row
 */
import { startOfDay, addDays } from 'date-fns';
import { computeHeatmapCells, countResults } from '../heatmap';
import { CheckIn } from '../../types';

let failures = 0;
function expect(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
}

const B = 'b1';

// Pin "now" to a known moment — Wed 2026-05-27 at noon — so future-cell
// calculations are deterministic regardless of when the test runs.
const NOW = new Date(2026, 4, 27, 12, 0, 0).getTime();
const todayStart = startOfDay(NOW).getTime();
const allDays = [0, 1, 2, 3, 4, 5, 6];
const weekdaysOnly = [1, 2, 3, 4, 5];

const ci = (
  daysAgo: number,
  result: 'yes' | 'tried' | 'no',
  opts: { behaviorId?: string } = {}
): CheckIn => ({
  id: `${opts.behaviorId ?? B}-${daysAgo}-${result}-${Math.random()}`,
  behaviorId: opts.behaviorId ?? B,
  at: startOfDay(addDays(NOW, -daysAgo)).getTime() + 12 * 60 * 60 * 1000,
  result,
});

// --- shape ---

const cellsAllDays = computeHeatmapCells(B, [], allDays, NOW, 8);
expect(cellsAllDays.length === 56, '8 weeks × 7 days = 56 cells');
expect(
  cellsAllDays[55].dateMs >= cellsAllDays[0].dateMs,
  'cells are ordered oldest first'
);
expect(
  cellsAllDays[cellsAllDays.length - 1 - (6 - new Date(todayStart).getDay())]
    .dateMs === todayStart,
  'the row matching today’s weekday in the last column is today'
);

// --- future flag ---

const futureCells = cellsAllDays.filter((c) => c.isFuture);
const todayCell = cellsAllDays.find((c) => c.dateMs === todayStart);
expect(todayCell !== undefined && !todayCell.isFuture, 'today is not future');
expect(
  futureCells.every((c) => c.dateMs > todayStart),
  'all isFuture cells sit after today’s start-of-day'
);
expect(
  futureCells.length === 6 - new Date(todayStart).getDay(),
  'future cells fill out the remaining days of the current week (Wed today → Thu/Fri/Sat = 3 cells)'
);

// --- active days ---

const cellsWeekdays = computeHeatmapCells(B, [], weekdaysOnly, NOW, 8);
const sundayCell = cellsWeekdays.find((c) => c.weekday === 0);
const tuesdayCell = cellsWeekdays.find((c) => c.weekday === 2);
expect(
  sundayCell !== undefined && sundayCell.isActive === false,
  'weekday-only behavior marks Sundays as isActive=false'
);
expect(
  tuesdayCell !== undefined && tuesdayCell.isActive === true,
  'weekday-only behavior marks Tuesdays as isActive=true'
);

// --- result derivation, best-of-day ---

const yesOnly = computeHeatmapCells(B, [ci(0, 'yes')], allDays, NOW, 8);
const todayInYesOnly = yesOnly.find((c) => c.dateMs === todayStart);
expect(todayInYesOnly?.result === 'yes', 'today logs yes');

const triedOnly = computeHeatmapCells(B, [ci(1, 'tried')], allDays, NOW, 8);
const yesterdayInTriedOnly = triedOnly.find(
  (c) => c.dateMs === startOfDay(addDays(NOW, -1)).getTime()
);
expect(yesterdayInTriedOnly?.result === 'tried', 'yesterday logs tried');

const noOnly = computeHeatmapCells(B, [ci(2, 'no')], allDays, NOW, 8);
const twoDaysAgoInNoOnly = noOnly.find(
  (c) => c.dateMs === startOfDay(addDays(NOW, -2)).getTime()
);
expect(twoDaysAgoInNoOnly?.result === 'no', 'two days ago logs no');

const mixed = computeHeatmapCells(
  B,
  [ci(0, 'no'), ci(0, 'tried'), ci(0, 'yes')],
  allDays,
  NOW,
  8
);
const mixedToday = mixed.find((c) => c.dateMs === todayStart);
expect(
  mixedToday?.result === 'yes',
  'best-of-day picks yes when yes / tried / no all logged'
);

const triedVsNo = computeHeatmapCells(
  B,
  [ci(0, 'no'), ci(0, 'tried')],
  allDays,
  NOW,
  8
);
const triedVsNoToday = triedVsNo.find((c) => c.dateMs === todayStart);
expect(
  triedVsNoToday?.result === 'tried',
  'best-of-day picks tried when tried / no logged'
);

// --- cross-behavior isolation ---

const crossBehavior = computeHeatmapCells(
  B,
  [ci(0, 'yes', { behaviorId: 'other' })],
  allDays,
  NOW,
  8
);
const crossToday = crossBehavior.find((c) => c.dateMs === todayStart);
expect(
  crossToday?.result === null,
  'other behaviors’ check-ins are not counted in this row'
);

// --- countResults ---

const counted = countResults(
  computeHeatmapCells(
    B,
    [ci(0, 'yes'), ci(1, 'tried'), ci(2, 'no'), ci(5, 'yes')],
    allDays,
    NOW,
    8
  )
);
expect(
  counted.yes === 2 && counted.tried === 1 && counted.no === 1,
  'countResults sums yes / tried / no across the visible window'
);

if (failures === 0) {
  console.log('All heatmap tests passed.');
  process.exit(0);
} else {
  console.error(`FAILED — ${failures} test(s) failed.`);
  process.exit(1);
}
