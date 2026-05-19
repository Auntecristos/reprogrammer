import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { BrandLogo } from '@/components/brand-logo';
import useStore from '@/store/useStore';
import { Behavior } from '@/types';
import { generateUUID } from '@/utils/uuid';
import { scheduleForBehavior } from '@/services/notifications';
import { INITIAL_DIFFICULTY, INITIAL_STABILITY } from '@/services/fsrs';

const templates = [
  {
    title: 'Confident Posture',
    window: { from: '09:00', to: '21:00' },
    pingMessage: 'Sit up straight',
    activeDays: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    title: 'Unreactive Listening',
    window: { from: '09:00', to: '21:00' },
    pingMessage: 'Listen without interrupting',
    activeDays: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    title: 'Poker Face',
    window: { from: '09:00', to: '21:00' },
    pingMessage: 'Keep a neutral expression',
    activeDays: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    title: 'Eye Contact',
    window: { from: '09:00', to: '21:00' },
    pingMessage: 'Make eye contact',
    activeDays: [0, 1, 2, 3, 4, 5, 6],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { addBehavior, setOnboarded } = useStore();

  const addTemplate = async (template: (typeof templates)[0]) => {
    const behavior: Behavior = {
      id: generateUUID(),
      title: template.title,
      pingMessage: template.pingMessage,
      window: template.window,
      activeDays: template.activeDays,
      intervalMinutes: 15,
      stability: INITIAL_STABILITY,
      difficulty: INITIAL_DIFFICULTY,
      lastNoStreak: 0,
      createdAt: Date.now(),
      hidden: false,
      bookmarked: false,
    };

    await addBehavior(behavior);
    await scheduleForBehavior(behavior);
    await setOnboarded(true);
  };

  const skipOnboarding = async () => {
    await setOnboarded(true);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.logoWrap}>
          <BrandLogo size={84} variant="tile" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Reprogrammer</Text>
        <Text style={[styles.subtitle, { color: colors.tint }]}>
          Notice · Repeat · Reprogram
        </Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          Choose a state to practice, or skip to create your own.
        </Text>

        <View style={styles.templates}>
          {templates.map((template) => (
            <Pressable
              key={template.title}
              onPress={() => addTemplate(template)}
              style={[styles.templateCard, { borderColor: colors.tint }]}
            >
              <Text style={[styles.templateTitle, { color: colors.text }]}>
                {template.title}
              </Text>
              <Text style={[styles.templateMessage, { color: colors.text }]}>
                {template.pingMessage}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={skipOnboarding}
          style={[styles.skipButton, { backgroundColor: colors.tint }]}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
  },
  templates: {
    gap: 12,
    marginBottom: 30,
  },
  templateCard: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 16,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  templateMessage: {
    fontSize: 14,
  },
  skipButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  skipButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
