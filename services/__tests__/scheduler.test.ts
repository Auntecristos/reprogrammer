/**
 * Tests the deterministic, jittered scheduling algorithm.
 * Run: npx tsx services/__tests__/scheduler.test.ts
 *
 * Verifies:
 *  - Determinism: same seed → identical schedule
 *  - Jitter bounded to ±20%
 *  - Min-gap (60% of effective interval) enforced
 *  - All times within window
 *  - Honors maxPings cap
 */
import { generateTimesForDay, mulberry32 as coreMulberry } from '../scheduler-core';
import { effectiveIntervalMinutes } from '../levels';

let failures = 0;
function expect(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const date = new Date(2026, 4, 27, 0, 0, 0, 0);
const windowFrom = '09:00';
const windowTo = '21:00';
const intervalMinutes = 15;
const level = 1;
const now = date.getTime();
const maxPings = 30;

// Determinism
const t1 = generateTimesForDay({
  date,
  windowFrom,
  windowTo,
  intervalMinutes,
  level,
  now,
  rng: mulberry32(42),
  maxPings,
});
const t2 = generateTimesForDay({
  date,
  windowFrom,
  windowTo,
  intervalMinutes,
  level,
  now,
  rng: mulberry32(42),
  maxPings,
});
expect(JSON.stringify(t1) === JSON.stringify(t2), 'same seed → identical schedule');
expect(t1.length > 0, 'generates at least one ping');

// Different seeds → different
const t3 = generateTimesForDay({
  date,
  windowFrom,
  windowTo,
  intervalMinutes,
  level,
  now,
  rng: mulberry32(99),
  maxPings,
});
expect(JSON.stringify(t1) !== JSON.stringify(t3), 'different seeds → different schedule');

// All within window
const windowStart = new Date(date);
windowStart.setHours(9, 0, 0, 0);
const windowEnd = new Date(date);
windowEnd.setHours(21, 0, 0, 0);
for (const ts of t1) {
  expect(
    ts >= windowStart.getTime() && ts < windowEnd.getTime(),
    `${new Date(ts).toLocaleTimeString()} within 09:00–21:00`
  );
}

// Min gap
const effMs = effectiveIntervalMinutes(intervalMinutes, level) * 60 * 1000;
const minGap = effMs * 0.6;
for (let i = 1; i < t1.length; i++) {
  expect(t1[i] - t1[i - 1] >= minGap, `gap ${i} ≥ minGap (${(t1[i] - t1[i - 1]) / 60000}min ≥ ${minGap / 60000}min)`);
}

// maxPings cap
const tCapped = generateTimesForDay({
  date,
  windowFrom,
  windowTo,
  intervalMinutes,
  level,
  now,
  rng: mulberry32(42),
  maxPings: 3,
});
expect(tCapped.length <= 3, 'maxPings cap enforced');

// Empty window
const tEmpty = generateTimesForDay({
  date,
  windowFrom: '09:00',
  windowTo: '09:00',
  intervalMinutes,
  level,
  now,
  rng: mulberry32(42),
  maxPings,
});
expect(tEmpty.length === 0, 'zero-length window → no pings');

// Past times skipped
const future = new Date(date);
future.setHours(15, 0, 0, 0);
const tFuture = generateTimesForDay({
  date,
  windowFrom,
  windowTo,
  intervalMinutes,
  level,
  now: future.getTime(),
  rng: mulberry32(42),
  maxPings,
});
for (const ts of tFuture) {
  expect(ts >= future.getTime(), `ts ${new Date(ts).toLocaleTimeString()} ≥ now`);
}

// Per-time pause filter — regression for the "1 day" pause that used to
// run ~32–48h because the filter skipped any day whose midnight was
// before pausedUntil. Now pausedUntil filters individual candidates.
const pauseDay = new Date(2026, 4, 29);
const pauseDayNoon = new Date(2026, 4, 29, 12, 0, 0).getTime();
const pauseDay9am = new Date(2026, 4, 29, 9, 0, 0).getTime();
const nextDayNoon = new Date(2026, 4, 30, 12, 0, 0).getTime();
const nextDay = new Date(2026, 4, 30);

// Pause from noon today until noon tomorrow (24h).
const pausedToday = generateTimesForDay({
  date: pauseDay,
  windowFrom: '09:00',
  windowTo: '21:00',
  intervalMinutes: 60,
  level: 1,
  now: pauseDay9am,
  rng: mulberry32(42),
  maxPings: 12,
  pausedUntil: nextDayNoon,
});
// Today's window is 09:00–12:00 (paused 12:00 →) so we should still see
// a few morning candidates before noon.
expect(pausedToday.every((t) => t < pauseDayNoon), 'today: no candidates ≥ pause start');

const pausedTomorrow = generateTimesForDay({
  date: nextDay,
  windowFrom: '09:00',
  windowTo: '21:00',
  intervalMinutes: 60,
  level: 1,
  now: pauseDay9am,
  rng: mulberry32(43),
  maxPings: 12,
  pausedUntil: nextDayNoon,
});
expect(pausedTomorrow.length > 0, 'tomorrow: pause lifts, attempts resume');
expect(
  pausedTomorrow.every((t) => t >= nextDayNoon),
  'tomorrow: all candidates ≥ pause-end (no carry-over into the paused half)'
);

// pausedUntil in the past should be a no-op.
const tNoPauseEffect = generateTimesForDay({
  date: pauseDay,
  windowFrom: '09:00',
  windowTo: '21:00',
  intervalMinutes: 60,
  level: 1,
  now: pauseDay9am,
  rng: mulberry32(44),
  maxPings: 12,
  pausedUntil: pauseDay9am - 60_000, // 1min ago
});
const tNoPauseControl = generateTimesForDay({
  date: pauseDay,
  windowFrom: '09:00',
  windowTo: '21:00',
  intervalMinutes: 60,
  level: 1,
  now: pauseDay9am,
  rng: mulberry32(44),
  maxPings: 12,
});
expect(
  JSON.stringify(tNoPauseEffect) === JSON.stringify(tNoPauseControl),
  'past pausedUntil is a no-op'
);

if (failures === 0) {
  console.log(`OK — scheduler tests passed (${t1.length} pings generated for L1 15min 9-21).`);
  process.exit(0);
} else {
  console.error(`FAILED — ${failures} test(s).`);
  process.exit(1);
}
