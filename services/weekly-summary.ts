/**
 * Pure derivation for the "This week" card on Profile.
 *
 * Window is a rolling 7 days ending at start-of-day of `now` plus today.
 * I.e. on a Wed, the window is last-Thu 00:00 through today end-of-day.
 * Rolling instead of Sun-to-now so the card always reads a full week —
 * Mondays don't show a sad-looking single-day summary.
 */

import { Behavior, CheckIn } from '../types';
import { addDays, startOfDay } from 'date-fns';

export interface WeeklySummary {
  /** Total check-ins (any result) inside the 7-day window. */
  checkIns: number;
  /** Subset of `checkIns` with result === 'yes'. */
  caught: number;
  /** Subset with result === 'tried'. */
  tried: number;
  /** Active (non-hidden) behaviors with zero check-ins this week. */
  untouched: number;
}

const WINDOW_DAYS = 7;

export function computeWeeklySummary(
  behaviors: Behavior[],
  checkIns: CheckIn[],
  now: number = Date.now()
): WeeklySummary {
  const windowStart = startOfDay(addDays(now, -(WINDOW_DAYS - 1))).getTime();
  const recent = checkIns.filter((c) => c.at >= windowStart);
  const caught = recent.filter((c) => c.result === 'yes').length;
  const tried = recent.filter((c) => c.result === 'tried').length;

  const activeIds = behaviors
    .filter((b) => !b.hidden)
    .map((b) => b.id);
  const touched = new Set(recent.map((c) => c.behaviorId));
  const untouched = activeIds.filter((id) => !touched.has(id)).length;

  return {
    checkIns: recent.length,
    caught,
    tried,
    untouched,
  };
}
