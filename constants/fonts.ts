/**
 * Font configuration for Reprogrammer
 *
 * Inter: Modern, accessible typeface optimized for screens.
 * Pairs perfectly with the calm neon-green mental-health theme.
 *
 * Variable font includes all weights: 100–900
 * Usage: fontFamily in StyleSheet, fontWeight for weight variation
 */

export const FontFamily = {
  primary: 'Inter',
  fallback: 'system-ui',
} as const;

export const FontWeights = {
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const FontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
} as const;

export const LineHeights = {
  tight: 1.2,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;
