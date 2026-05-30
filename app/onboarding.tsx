import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Type, Space, Radius } from '@/constants/theme';
import useStore from '@/store/useStore';
import { Behavior } from '@/types';
import { generateUUID } from '@/utils/uuid';
import { scheduleForBehavior } from '@/services/notifications';
import { INITIAL_LEVEL, INITIAL_LAST_LEVELUP_STREAK } from '@/services/levels';
import { featuredTemplates, LIBRARY_GUIDES } from '@/services/library-content';
import { ONBOARDING_RULES } from '@/services/ground-rules';
import { useContentModals } from '@/components/library/content-modals-provider';

type Step = 'splash' | 'rules' | 'templates';

const templates = featuredTemplates();

export default function OnboardingScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { addBehavior, setOnboarded, updateAppProfile } = useStore();
  const { openGuide } = useContentModals();
  const [step, setStep] = useState<Step>('splash');
  // Brief loader between picking a template and the guide modal opening
  // so the research-grounded read doesn't feel like "another popup."
  // Shows the guide title + estimated read time for ~600ms.
  const [pendingGuide, setPendingGuide] = useState<{
    title: string;
    minutes: number;
  } | null>(null);
  const reduceMotion = useReducedMotion();

  // The rules / templates screens need to clear the status bar; the splash
  // is centered so it doesn't.
  const contentPaddingTop = insets.top + Space.xxl;

  const addTemplate = async (template: (typeof templates)[0]) => {
    const behavior: Behavior = {
      id: generateUUID(),
      kind: 'adopt',
      title: template.title,
      pingMessage: template.pingMessage,
      practiceType: template.practiceType,
      domain: template.domain,
      libraryGuideId: template.libraryGuideId,
      window: template.window,
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      intervalMinutes: template.intervalMinutes,
      level: INITIAL_LEVEL,
      lastLevelUpStreak: INITIAL_LAST_LEVELUP_STREAK,
      createdAt: Date.now(),
      hidden: false,
      bookmarked: false,
    };
    await addBehavior(behavior);
    await scheduleForBehavior(behavior);
    // First-visit coachmark lands on the dashboard once a behavior exists.
    // Cleared as soon as the user taps any tile.
    await updateAppProfile({ showFirstTilePrompt: true });
    await setOnboarded(true);
    // Open the paired guide over the dashboard so onboarding ends in a
    // research-grounded read, not a chore-list. Falls back silently if the
    // chosen template has no guide attached. Reduce Motion skips the brief
    // intro loader and opens the guide straight away.
    if (template.libraryGuideId) {
      const guide = LIBRARY_GUIDES.find((g) => g.id === template.libraryGuideId);
      if (!guide || reduceMotion) {
        openGuide(template.libraryGuideId);
        return;
      }
      setPendingGuide({ title: guide.title, minutes: guide.estimatedMinutes });
      setTimeout(() => {
        openGuide(template.libraryGuideId!);
        setPendingGuide(null);
      }, 600);
    }
  };

  const skipOnboarding = async () => {
    // Skip leaves the user on the empty dashboard, which already has its
    // own CTAs — no first-tile coachmark to show. We still set the flag so
    // that if they later create a behavior, the prompt lands once.
    await updateAppProfile({ showFirstTilePrompt: true });
    await setOnboarded(true);
  };

  if (step === 'splash') {
    return (
      <View
        style={[
          styles.splashContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.splashTitle, { color: colors.text }]}>Reprogrammer</Text>
        <Text style={[styles.splashTagline, { color: colors.tint }]}>
          NOTICE · REPEAT · REPROGRAM
        </Text>
        <Pressable
          onPress={() => setStep('rules')}
          style={[styles.cta, { backgroundColor: colors.tint }]}
        >
          <Text style={[styles.ctaText, { color: colors.textOnBrand }]}>Begin</Text>
        </Pressable>
      </View>
    );
  }

  if (step === 'rules') {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.content, { paddingTop: contentPaddingTop }]}>
          <Text style={[styles.title, { color: colors.text }]}>Before you start</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            Three rules that decide whether this works for you.
          </Text>

          {ONBOARDING_RULES.map((rule, idx) => (
            <View
              key={rule.id}
              style={[
                styles.ruleCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.ruleHeader}>
                <View style={[styles.ruleNumber, { backgroundColor: colors.tint }]}>
                  <Text style={[styles.ruleNumberText, { color: colors.textOnBrand }]}>
                    {idx + 1}
                  </Text>
                </View>
                <Text style={[styles.ruleTitle, { color: colors.text }]}>{rule.title}</Text>
              </View>
              <Text style={[styles.ruleBody, { color: colors.text }]}>{rule.body}</Text>
              <Text style={[styles.ruleCitation, { color: colors.textMuted }]}>
                {rule.citation}
              </Text>
            </View>
          ))}

          <Pressable
            onPress={() => setStep('templates')}
            style={[styles.cta, { backgroundColor: colors.tint, marginTop: Space.md }]}
          >
            <Text style={[styles.ctaText, { color: colors.textOnBrand }]}>I understand</Text>
          </Pressable>
          {/* Visible escape hatch for users who don't want to commit to the
              three rules. The Phase-3-deferred goal was: never force-quit
              to leave a screen. Skip lands them on the dashboard's
              empty-state which already has Browse / Create CTAs. */}
          <Pressable
            onPress={skipOnboarding}
            style={styles.inlineSkip}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding and go to the dashboard"
          >
            <Text style={[styles.inlineSkipText, { color: colors.textMuted }]}>
              Skip onboarding
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.content, { paddingTop: contentPaddingTop }]}>
          <Text style={[styles.title, { color: colors.text }]}>Pick a state to start</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            One state. Get it to automatic before adding another.
          </Text>

        <View style={styles.templates}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              onPress={() => addTemplate(template)}
              style={[styles.templateCard, { borderColor: colors.tint }]}
            >
              <Text style={[styles.templateTitle, { color: colors.text }]}>
                {template.title}
              </Text>
              <Text style={[styles.templateMessage, { color: colors.textMuted }]}>
                {template.pingMessage}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={skipOnboarding}
          style={[styles.skipButton, { backgroundColor: colors.surfaceMuted }]}
        >
          <Text style={[styles.skipButtonText, { color: colors.text }]}>
            Skip — I&apos;ll create my own
          </Text>
        </Pressable>
      </View>
      </ScrollView>
      {pendingGuide ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(220)}
          style={[
            styles.guideHandoff,
            {
              backgroundColor: colors.background,
              borderColor: colors.tintMuted,
            },
          ]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Reading ${pendingGuide.title}, about ${pendingGuide.minutes} minutes.`}
        >
          <Text style={[styles.guideHandoffEyebrow, { color: colors.tint }]}>
            Reading
          </Text>
          <Text
            style={[styles.guideHandoffTitle, { color: colors.text }]}
            numberOfLines={2}
          >
            {pendingGuide.title}
          </Text>
          <Text
            style={[styles.guideHandoffMinutes, { color: colors.textMuted }]}
          >
            About {pendingGuide.minutes} min
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
    gap: Space.lg,
  },
  // Splash hero — the only place we use the editorial display-2 token.
  splashTitle: {
    ...Type.display2,
    fontSize: 40, // splash hero stays larger than guide titles
    fontWeight: '800',
  },
  splashTagline: {
    ...Type.caption,
    fontWeight: '700',
    letterSpacing: 2, // the tagline's spaced-out branding effect
    marginBottom: Space.xxl,
  },
  container: {
    flex: 1,
  },
  // paddingTop is applied dynamically (safe-area + Space.xxl) at the JSX site
  content: {
    padding: Space.xl,
    paddingBottom: Space.xxxl + Space.sm,
  },
  title: {
    ...Type.display2,
    marginBottom: Space.xs + Space.xxs, // = 6, the small bump under the title
  },
  description: {
    ...Type.body,
    marginBottom: Space.xl,
  },
  ruleCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Space.md + Space.xxs, // = 14; sits between md (12) and lg (16)
    marginBottom: Space.sm + Space.xxs, // = 10
    gap: Space.sm,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + Space.xxs, // = 10
  },
  ruleNumber: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lives inside a 24pt circle badge; the caption-1px override keeps the
  // numeral centered without overflowing the chip.
  ruleNumberText: {
    ...Type.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  ruleTitle: {
    ...Type.bodyBold,
    fontWeight: '700',
    flex: 1,
  },
  ruleBody: {
    ...Type.body,
  },
  ruleCitation: {
    ...Type.micro,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  templates: {
    gap: Space.md,
    marginBottom: Space.xxl,
  },
  templateCard: {
    borderWidth: 2,
    borderRadius: Radius.md,
    padding: Space.md + Space.xxs, // = 14
    gap: Space.xs,
  },
  templateTitle: {
    ...Type.bodyBold,
    fontWeight: '700',
  },
  templateMessage: {
    ...Type.caption,
  },
  cta: {
    paddingVertical: Space.md + Space.xxs, // = 14
    paddingHorizontal: Space.xxl,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Space.sm,
  },
  ctaText: {
    ...Type.bodyBold,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: Space.md,
    borderRadius: Radius.xs,
    alignItems: 'center',
  },
  skipButtonText: {
    ...Type.body,
    fontWeight: '500',
  },
  inlineSkip: {
    alignSelf: 'center',
    paddingVertical: Space.md,
    marginTop: Space.sm,
  },
  inlineSkipText: {
    ...Type.body,
    textDecorationLine: 'underline',
  },
  guideHandoff: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '40%',
    padding: Space.xxl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Space.sm,
    alignItems: 'center',
  },
  guideHandoffEyebrow: {
    ...Type.micro,
    textTransform: 'uppercase',
  },
  guideHandoffTitle: {
    ...Type.display2,
    textAlign: 'center',
  },
  guideHandoffMinutes: {
    ...Type.caption,
  },
});
