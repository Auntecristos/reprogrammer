/**
 * One-shot particle burst played from a tile's center when a streak crosses
 * a milestone (3 / 7 / 14 / 30 days). Calm-by-default app — the burst is
 * the moment we let the brand green out of its cage.
 *
 * - 12 particles fanned around the tile center, each with light angle jitter
 * - 800ms total duration, single play, then unmounts implicitly by key change
 * - Skipped entirely when "Reduce Motion" is on (vestibular safety)
 * - Pointer-events: none, so the burst never intercepts tile taps
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const PARTICLE_COUNT = 12;
const BURST_DURATION_MS = 800;

interface Particle {
  angle: number;
  distance: number;
  color: string;
  size: number;
}

interface ConfettiColors {
  tintCelebrate: string;
  warning: string;
  tint: string;
}

interface StreakConfettiProps {
  /**
   * Increment to fire a new burst. Stays mounted between bursts; particles
   * re-key off this value, so each new burst gets fresh shared values.
   * A value of 0 renders nothing (initial idle state).
   */
  triggerKey: number;
  colors: ConfettiColors;
}

function makeParticles(colors: ConfettiColors): Particle[] {
  const palette = [colors.tintCelebrate, colors.warning, colors.tint];
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    // Evenly-spaced angles with a small jitter so the burst looks organic
    // without holes or clumps.
    const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * 0.4;
    return {
      angle: baseAngle + jitter,
      distance: 36 + Math.random() * 28,
      color: palette[i % palette.length],
      size: 4 + Math.floor(Math.random() * 3),
    };
  });
}

export function StreakConfetti({ triggerKey, colors }: StreakConfettiProps) {
  const reduceMotion = useReducedMotion();
  // Pull primitives so the memo deps are stable strings rather than the
  // surrounding `colors` object (which can re-identify on each render).
  const { tintCelebrate, warning, tint } = colors;
  const particles = useMemo(
    () => makeParticles({ tintCelebrate, warning, tint }),
    [tintCelebrate, warning, tint],
  );

  if (reduceMotion || triggerKey === 0) return null;

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {particles.map((p, i) => (
        <ConfettiParticle key={`${triggerKey}-${i}`} particle={p} />
      ))}
    </View>
  );
}

function ConfettiParticle({ particle }: { particle: Particle }) {
  const progress = useSharedValue(0);
  const { angle, distance, color, size } = particle;

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: BURST_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    return () => {
      cancelAnimation(progress);
    };
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const tx = Math.cos(angle) * distance * t;
    const ty = Math.sin(angle) * distance * t;
    const sc = interpolate(t, [0, 0.15, 1], [0, 1, 0.6], 'clamp');
    const opacity = interpolate(t, [0, 0.7, 1], [1, 1, 0], 'clamp');
    // Explicit `ViewStyle['transform']` keeps each element from widening into
    // a union with `?: undefined` keys, which then fails the strict
    // single-key transform-element typing.
    const transform: ViewStyle['transform'] = [
      { translateX: tx },
      { translateY: ty },
      { scale: sc },
    ];
    return { opacity, transform };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    borderRadius: 999,
  },
});
