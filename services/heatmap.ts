/**
 * Pure derivation for the calendar heat-map on the behavior detail screen.
 * Separated from the React component so it's unit-testable in Node (no
 * react-native imports in this file).
 *
 * Cell state mirrors `calculateStreak`'s best-of-day rule: yes beats
 * tried, tried beats no. Inactive weekdays (not in `behavior.activeDays`)
 * render in a quieter tone so the user can read "I'm strongest on
 * weekends" without confusing "didn't ping" with "skipped".
 */

import { CheckIn } from '../types';
import { addDays, startOfDay } from 'date-fns';

export type HeatmapCellResult = 'yes' | 'tried' | 'no' | null;

export interface HeatmapCell {
  /** Start-of-day timestamp for this cell, in local time. */
  dateMs: number;
  /** 0-6 from `Date.getDay()`; lets the component label rows. */
  weekday: number;
  /** False for dates after `now` (right edge of the grid in the current week). */
  isFuture: boolean;
  /** False for weekdays the behavior doesn't run on (e.g. weekend-only habit). */
  isActive: boolean;
  /** Best-of-day result from the check-ins; null if nothing logged. */
  result: HeatmapCellResult;
}

const DAYS_PER_WEEK = 7;

/**
 * Builds a `weeksToShow * 7` array, oldest first, that the component
 * lays out column-major (one column per week). The most recent column
 * ends with today; days beyond today in the current week are returned
 * as `isFuture: true` so the component can render them as blanks.
 */
export function computeHeatmapCells(
  behaviorId: string,
  checkIns: CheckIn[],
  activeDays: number[],
  now: number,
  weeksToShow: number = 8
): HeatmapCell[] {
  const todayStart = startOfDay(now).getTime();
  // Right-most column ends on today's weekday. We want full weeks in the
  // grid, so step back (weeksToShow - 1) weeks plus offset to Sunday of
  // that oldest week.
  const todayWeekday = new Date(todayStart).getDay();
  const firstCellStart = startOfDay(
    addDays(todayStart, -((weeksToShow - 1) * DAYS_PER_WEEK + todayWeekday))
  ).getTime();

  const behaviorCheckIns = checkIns.filter((ci) => ci.behaviorId === behaviorId);
  const activeDaySet = new Set(activeDays);
  const cells: HeatmapCell[] = [];

  for (let i = 0; i < weeksToShow * DAYS_PER_WEEK; i++) {
    const dateMs = startOfDay(addDays(firstCellStart, i)).getTime();
    const dayEnd = startOfDay(addDays(dateMs, 1)).getTime();
    const weekday = new Date(dateMs).getDay();
    const isFuture = dateMs > todayStart;
    const isActive = activeDaySet.has(weekday);

    let result: HeatmapCellResult = null;
    if (!isFuture) {
      const todays = behaviorCheckIns.filter(
        (ci) => ci.at >= dateMs && ci.at < dayEnd
      );
      if (todays.some((c) => c.result === 'yes')) result = 'yes';
      else if (todays.some((c) => c.result === 'tried')) result = 'tried';
      else if (todays.some((c) => c.result === 'no')) result = 'no';
    }

    cells.push({ dateMs, weekday, isFuture, isActive, result });
  }

  return cells;
}

export function countResults(cells: HeatmapCell[]): {
  yes: number;
  tried: number;
  no: number;
} {
  let yes = 0;
  let tried = 0;
  let no = 0;
  for (const c of cells) {
    if (c.result === 'yes') yes++;
    else if (c.result === 'tried') tried++;
    else if (c.result === 'no') no++;
  }
  return { yes, tried, no };
}
