/**
 * Lightweight self-test for the level-based scheduler. Run with:
 *   npx ts-node services/__tests__/levels.test.ts
 *
 * Verifies:
 *  - Level multipliers applied correctly
 *  - Effective interval respects floor and cap
 *  - Level-up gate triggers on streak ≥ 7 AND (streak - lastLevelUpStreak) ≥ 7
 *  - Lapse decrements level, never below 1
 *  - Stage derivation matches spec
 */
import {
  levelMultiplier,
  effectiveIntervalMinutes,
  perBehaviorDailyCap,
  shouldLevelUp,
  applyLevelUp,
  applyLapse,
  deriveStage,
  levelUpTransition,
  LEVEL_MULTIPLIERS,
  EFFECTIVE_INTERVAL_CAP_MIN,
  MIN_INTERVAL_FLOOR_MIN,
} from '../levels';
import { Behavior } from '../../types';

let failures = 0;
function expect(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
}

// Level multipliers
expect(levelMultiplier(1) === 1.0, 'level 1 multiplier = 1.0');
expect(levelMultiplier(3) === 2.5, 'level 3 multiplier = 2.5');
expect(levelMultiplier(5) === 6.0, 'level 5 multiplier = 6.0');
expect(levelMultiplier(99) === 6.0, 'level 99 clamps to 5');
expect(levelMultiplier(0) === 1.0, 'level 0 clamps to 1');

// Effective interval
expect(effectiveIntervalMinutes(15, 1) === 15, 'L1 × 15min = 15');
expect(effectiveIntervalMinutes(15, 3) === 37.5, 'L3 × 15min = 37.5');
expect(effectiveIntervalMinutes(15, 5) === 90, 'L5 × 15min = 90');
expect(effectiveIntervalMinutes(60, 5) === EFFECTIVE_INTERVAL_CAP_MIN, 'caps at 120');
expect(effectiveIntervalMinutes(1, 1) === MIN_INTERVAL_FLOOR_MIN, 'enforces 5min floor');

// Daily cap
expect(perBehaviorDailyCap(15, 1, 12) === 30, '12h window, L1, 15m → cap 30');
expect(perBehaviorDailyCap(15, 5, 12) === 8, '12h window, L5, 15m → 720/90 = 8');
expect(perBehaviorDailyCap(15, 1, 0.1) === 1, 'tiny window → min 1');

// Level-up
expect(shouldLevelUp(7, 0) === true, 'streak=7, last=0 → level up');
expect(shouldLevelUp(6, 0) === false, 'streak=6 → no level up');
expect(shouldLevelUp(14, 7) === true, 'streak=14, last=7 → level up');
expect(shouldLevelUp(13, 7) === false, 'streak=13, last=7 → no level up');

// applyLevelUp
const b: Behavior = {
  id: 'x',
  kind: 'adopt',
  title: 't',
  pingMessage: 't',
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  window: { from: '09:00', to: '21:00' },
  intervalMinutes: 15,
  level: 1,
  lastLevelUpStreak: 0,
  createdAt: 0,
  hidden: false,
  bookmarked: false,
};
const lvlUp = applyLevelUp(b, 7);
expect(lvlUp.level === 2, 'level 1 → 2');
expect(lvlUp.lastLevelUpStreak === 7, 'lastLevelUpStreak updated');

const maxed = applyLevelUp({ ...b, level: 5 }, 35);
expect(maxed.level === 5, 'level caps at 5');

// applyLapse
expect(applyLapse({ ...b, level: 3 }).level === 2, 'L3 → L2 on lapse');
expect(applyLapse({ ...b, level: 1 }).level === 1, 'L1 stays at 1 (floor)');

// Stage
expect(deriveStage(1, 0) === 'starting', 'L1, streak 0 → starting');
expect(deriveStage(2, 0) === 'in_progress', 'L2 → in_progress');
expect(deriveStage(1, 7) === 'in_progress', 'streak 7 → in_progress');
expect(deriveStage(4, 0) === 'habitual', 'L4 → habitual');
expect(deriveStage(1, 28) === 'habitual', 'streak 28 → habitual');

// levelUpTransition — pre-side uses yesterday's streak so the streak-7
// case shows a real "starting → in_progress" instead of collapsing.
const t1 = levelUpTransition(1, 7);
expect(
  t1.fromStage === 'starting' && t1.toStage === 'in_progress',
  'L1, streak 7 → starting → in_progress (streak-driven boundary)'
);

const t2 = levelUpTransition(2, 14);
expect(
  t2.fromStage === 'in_progress' && t2.toStage === 'in_progress',
  'L2, streak 14 → in_progress → in_progress (mid-stage level-up)'
);

const t3 = levelUpTransition(3, 21);
expect(
  t3.fromStage === 'in_progress' && t3.toStage === 'habitual',
  'L3, streak 21 → in_progress → habitual (level-driven boundary)'
);

const t4 = levelUpTransition(4, 28);
expect(
  t4.fromStage === 'habitual' && t4.toStage === 'habitual',
  'L4, streak 28 → habitual → habitual (top-stage level-up)'
);

const tCap = levelUpTransition(5, 35);
expect(
  tCap.toStage === 'habitual',
  'level caps at 5 — next level still derives habitual, no overflow'
);

const tEdge = levelUpTransition(1, 1);
expect(
  tEdge.fromStage === 'starting',
  'streak 1 — yesterdayStreak clamps at 0, fromStage = starting'
);

if (failures === 0) {
  console.log('OK — all level/scheduler tests passed.');
  process.exit(0);
} else {
  console.error(`FAILED — ${failures} test(s) failed.`);
  process.exit(1);
}
