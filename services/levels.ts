import { Behavior, Stage } from '../types';

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 5;
export const INITIAL_LEVEL = 1;
export const INITIAL_LAST_LEVELUP_STREAK = 0;

export const LEVEL_MULTIPLIERS = [1.0, 1.5, 2.5, 4.0, 6.0] as const;
export const EFFECTIVE_INTERVAL_CAP_MIN = 120;
export const PER_BEHAVIOR_DAILY_CAP = 30;
export const MIN_INTERVAL_FLOOR_MIN = 5;

export const INTERVAL_PRESETS = [1, 2, 5, 10, 15, 20, 30, 45, 60] as const;

export const LEVEL_UP_STREAK_THRESHOLD = 7;
export const LAPSE_NO_THRESHOLD = 3;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function levelMultiplier(level: number): number {
  const idx = clamp(level, LEVEL_MIN, LEVEL_MAX) - 1;
  return LEVEL_MULTIPLIERS[idx] ?? LEVEL_MULTIPLIERS[LEVEL_MULTIPLIERS.length - 1];
}

export function effectiveIntervalMinutes(intervalMinutes: number, level: number): number {
  const base = Math.max(MIN_INTERVAL_FLOOR_MIN, intervalMinutes);
  const eff = base * levelMultiplier(level);
  return Math.min(EFFECTIVE_INTERVAL_CAP_MIN, eff);
}

export function perBehaviorDailyCap(
  intervalMinutes: number,
  level: number,
  windowHours: number
): number {
  const effMin = effectiveIntervalMinutes(intervalMinutes, level);
  const target = Math.floor((windowHours * 60) / effMin);
  return Math.max(1, Math.min(PER_BEHAVIOR_DAILY_CAP, target));
}

export function shouldLevelUp(streak: number, lastLevelUpStreak: number): boolean {
  return (
    streak >= LEVEL_UP_STREAK_THRESHOLD &&
    streak - lastLevelUpStreak >= LEVEL_UP_STREAK_THRESHOLD
  );
}

export function applyLevelUp(b: Behavior, streak: number): Behavior {
  return {
    ...b,
    level: Math.min(LEVEL_MAX, b.level + 1),
    lastLevelUpStreak: streak,
  };
}

export function applyLapse(b: Behavior): Behavior {
  return {
    ...b,
    level: Math.max(LEVEL_MIN, b.level - 1),
    lastLevelUpStreak: 0,
  };
}

/**
 * The `AppProfile` patch the dashboard relies on to show the relapse banner.
 * Pulled out as a pure helper so it can be unit-tested in Node — the call
 * site in `handleCheckInResponse` lives in services/notifications.ts which
 * pulls in `expo-notifications` and isn't tx-runnable without a mock layer.
 * If a future tweak adds another field, this is the one place that needs
 * to change.
 */
export interface LapseProfilePatch {
  lastLapseAt: number;
  lastLapseBehaviorId: string;
  lastLapseAcknowledged: false;
}

export function buildLapseProfilePatch(
  behaviorId: string,
  now: number = Date.now()
): LapseProfilePatch {
  return {
    lastLapseAt: now,
    lastLapseBehaviorId: behaviorId,
    lastLapseAcknowledged: false,
  };
}

export function deriveStage(level: number, streak: number): Stage {
  if (level >= 4 || streak >= 28) return 'habitual';
  if (level >= 2 || streak >= 7) return 'in_progress';
  return 'starting';
}

export function stageLabel(stage: Stage): string {
  if (stage === 'habitual') return 'Habitual';
  if (stage === 'in_progress') return 'In Progress';
  return 'Starting';
}

/**
 * The before/after stage labels for a just-fired level-up. Used by the
 * level-up celebration modal. `currentLevel` is the behavior's level
 * before `applyLevelUp` runs; `streak` is today's streak (the value that
 * triggered the level-up). Pre-stage uses `streak - 1` so the "from" side
 * reflects yesterday's effective stage rather than today's — otherwise
 * the streak-driven branch of deriveStage would make from == to at the
 * common streak-7 case.
 */
export interface LevelUpTransition {
  fromStage: Stage;
  toStage: Stage;
}

export function levelUpTransition(
  currentLevel: number,
  streak: number
): LevelUpTransition {
  const yesterdayStreak = Math.max(0, streak - 1);
  const fromStage = deriveStage(currentLevel, yesterdayStreak);
  const nextLevel = Math.min(LEVEL_MAX, currentLevel + 1);
  const toStage = deriveStage(nextLevel, streak);
  return { fromStage, toStage };
}
