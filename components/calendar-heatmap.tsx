/**
 * 8-week activity calendar for the behavior detail screen.
 *
 * Column-major grid: rightmost column is the current week (today is the
 * last filled cell), oldest week sits at the left. Each row is a weekday
 * Sun → Sat so users can read patterns at a glance ("I'm strongest on
 * weekends" / "Wednesdays are where I lapse").
 *
 * Color rule, calm-by-default:
 *   yes      → tintCelebrate    (the only place neon green shows up at scale)
 *   tried    → tintMuted        (honors the practice without a celebration)
 *   no       → border           (visible but not red — misses are not punished)
 *   empty    → surfaceMuted     (no check-in, no judgement)
 *   inactive → surface (lighter than empty, sits under the row visually)
 *   future   → fully transparent (right edge of the current week)
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  computeHeatmapCells,
  countResults,
  type HeatmapCell,
} from '@/services/heatmap';
import type { CheckIn } from '@/types';
import { Space, Type, type ThemeColors } from '@/constants/theme';

const WEEKS_TO_SHOW = 8;
const CELL_SIZE = 14;
const CELL_GAP = 3;
const ROW_LABEL_WIDTH = 18;

// Initial-letter row labels (S M T W T F S) keep the chrome tiny without
// making the weekday ambiguous — the row position carries the rest.
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

interface CalendarHeatmapProps {
  behaviorId: string;
  checkIns: CheckIn[];
  activeDays: number[];
  colors: ThemeColors;
  now?: number;
}

export function CalendarHeatmap({
  behaviorId,
  checkIns,
  activeDays,
  colors,
  now,
}: CalendarHeatmapProps) {
  const cells = useMemo(
    () =>
      computeHeatmapCells(
        behaviorId,
        checkIns,
        activeDays,
        now ?? Date.now(),
        WEEKS_TO_SHOW
      ),
    [behaviorId, checkIns, activeDays, now]
  );
  const counts = useMemo(() => countResults(cells), [cells]);

  // Re-pivot cells into columns (one column per week) for layout. The
  // helper hands us cells sorted oldest-first within each week of 7.
  const columns: HeatmapCell[][] = [];
  for (let w = 0; w < WEEKS_TO_SHOW; w++) {
    columns.push(cells.slice(w * 7, (w + 1) * 7));
  }

  const a11yLabel = `Activity over the last ${WEEKS_TO_SHOW} weeks: ${counts.yes} caught, ${counts.tried} tried, ${counts.no} missed.`;

  return (
    <View accessibilityLabel={a11yLabel}>
      <View style={styles.gridRow}>
        <View style={{ width: ROW_LABEL_WIDTH, gap: CELL_GAP }}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Text
              key={i}
              style={[
                styles.weekdayLabel,
                { color: colors.textMuted, height: CELL_SIZE },
              ]}
            >
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.columns}>
          {columns.map((col, ci) => (
            <View key={ci} style={styles.column}>
              {col.map((cell) => (
                <View
                  key={cell.dateMs}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: cellColor(cell, colors),
                    },
                  ]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ))}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryItem, { color: colors.textMuted }]}>
          {counts.yes} caught
        </Text>
        <Text style={[styles.summaryItem, { color: colors.textMuted }]}>
          {counts.tried} tried
        </Text>
        <Text style={[styles.summaryItem, { color: colors.textMuted }]}>
          {counts.no} missed
        </Text>
      </View>
    </View>
  );
}

function cellColor(cell: HeatmapCell, colors: ThemeColors): string {
  if (cell.isFuture) return 'transparent';
  if (cell.result === 'yes') return colors.tintCelebrate;
  if (cell.result === 'tried') return colors.tintMuted;
  if (cell.result === 'no') return colors.border;
  // No check-in. Inactive days get a fainter wash so the row reads as
  // "not scheduled" rather than "missed".
  return cell.isActive ? colors.surfaceMuted : colors.surface;
}

const styles = StyleSheet.create({
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: CELL_GAP,
  },
  weekdayLabel: {
    ...Type.micro,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: CELL_SIZE,
  },
  columns: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  column: {
    gap: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.md,
  },
  summaryItem: {
    ...Type.caption,
  },
});
