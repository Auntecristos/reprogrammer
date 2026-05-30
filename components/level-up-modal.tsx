/**
 * Full-screen celebration for a just-fired level-up. Driven by the
 * `pendingLevelUp` store slot — `handleCheckInResponse` queues it, this
 * modal renders, user dismisses, slot clears.
 *
 * Visual arc: eyebrow ("Level up") fades in first, the stage transition
 * lands next, body copy resolves last, CTA appears at the end — total
 * ~1.2s, staggered so each line gets a beat. Reduce Motion collapses
 * all of that to a static render. A Success haptic fires once on mount
 * so the moment registers physically as well as visually.
 */

import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useStore from '@/store/useStore';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Space, Type, type ThemeColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { stageLabel } from '@/services/levels';
import type { Stage } from '@/types';

export function LevelUpModal() {
  const pending = useStore((s) => s.pendingLevelUp);
  const clear = useStore((s) => s.setPendingLevelUp);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const visible = pending != null;

  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  }, [visible]);

  if (!pending) return null;

  const { behaviorTitle, fromStage, toStage } = pending;
  const stageChanged = fromStage !== toStage;
  const dismiss = () => clear(null);

  // FadeIn delays compose the 1.2s arc. When reduceMotion is on, each
  // line just appears — no entering animation at all.
  const fade = (delay: number) =>
    reduceMotion ? undefined : FadeIn.duration(280).delay(delay);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={dismiss}
    >
      <View
        style={[
          styles.scrim,
          { backgroundColor: colors.background },
        ]}
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
      >
        <View
          style={[
            styles.card,
            {
              paddingTop: insets.top + Space.xxxl,
              paddingBottom: insets.bottom + Space.xxxl,
            },
          ]}
        >
          <Animated.View entering={fade(0)} style={styles.eyebrowRow}>
            <IconSymbol
              name="sparkles"
              size={18}
              color={colors.tintCelebrate}
            />
            <Text style={[styles.eyebrow, { color: colors.tintCelebrate }]}>
              Level up
            </Text>
          </Animated.View>

          <Animated.View entering={fade(200)} style={styles.titleBlock}>
            {stageChanged ? (
              <StageTransition
                fromStage={fromStage}
                toStage={toStage}
                colors={colors}
                reduceMotion={reduceMotion}
              />
            ) : (
              <Text style={[styles.stageHero, { color: colors.text }]}>
                {stageLabel(toStage)}
              </Text>
            )}
          </Animated.View>

          <Animated.Text
            entering={fade(600)}
            style={[styles.title, { color: colors.text }]}
            numberOfLines={2}
          >
            {behaviorTitle}
          </Animated.Text>

          <Animated.Text
            entering={fade(800)}
            style={[styles.body, { color: colors.textMuted }]}
          >
            Reminders will space out a bit. The work is starting to stick.
          </Animated.Text>

          <Animated.View entering={fade(1000)} style={styles.ctaWrap}>
            <Pressable
              onPress={dismiss}
              style={[styles.cta, { backgroundColor: colors.tint }]}
              accessibilityLabel="Dismiss level up celebration"
              accessibilityRole="button"
            >
              <Text style={[styles.ctaText, { color: colors.textOnBrand }]}>
                Keep going
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

interface StageTransitionProps {
  fromStage: Stage;
  toStage: Stage;
  colors: ThemeColors;
  reduceMotion: boolean;
}

function StageTransition({
  fromStage,
  toStage,
  colors,
  reduceMotion,
}: StageTransitionProps) {
  return (
    <View style={styles.transitionRow}>
      <Text style={[styles.stageSmall, { color: colors.textMuted }]}>
        {stageLabel(fromStage)}
      </Text>
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(220).delay(360)}
      >
        <IconSymbol
          name="arrow.right"
          size={20}
          color={colors.textMuted}
        />
      </Animated.View>
      <Animated.Text
        entering={reduceMotion ? undefined : FadeIn.duration(280).delay(480)}
        style={[styles.stageHero, { color: colors.text }]}
      >
        {stageLabel(toStage)}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
  },
  card: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xxl,
    gap: Space.lg,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  eyebrow: {
    ...Type.micro,
    textTransform: 'uppercase',
  },
  titleBlock: {
    alignItems: 'center',
  },
  transitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  stageSmall: {
    ...Type.h2,
    fontWeight: '500',
  },
  stageHero: {
    ...Type.display,
    textAlign: 'center',
  },
  title: {
    ...Type.h2,
    textAlign: 'center',
    marginTop: Space.sm,
  },
  body: {
    ...Type.body,
    textAlign: 'center',
    maxWidth: 320,
  },
  ctaWrap: {
    marginTop: Space.xl,
  },
  cta: {
    paddingHorizontal: Space.xxl,
    paddingVertical: Space.md,
    borderRadius: Radius.pill,
    minWidth: 200,
    alignItems: 'center',
  },
  ctaText: {
    ...Type.bodyBold,
  },
});
