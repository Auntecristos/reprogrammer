import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Type, Space, Radius } from '@/constants/theme';
import useStore from '@/store/useStore';
import { CheckIn } from '@/types';
import { generateUUID } from '@/utils/uuid';
import { handleCheckInResponse } from '@/services/notifications';
import { useEffect, useState, useMemo, useRef } from 'react';

function draftKey(attemptId: string): string {
  return `checkin-draft:${attemptId}`;
}

export default function CheckInScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { behaviorId, attemptId } = useLocalSearchParams();
  const { behaviors, addCheckIn } = useStore();
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [showTriedHint, setShowTriedHint] = useState(false);
  const draftWriteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const behavior = useMemo(
    () => behaviors.find((b) => b.id === (behaviorId as string)),
    [behaviors, behaviorId]
  );

  // Load any saved draft for this attempt on mount.
  useEffect(() => {
    if (typeof attemptId !== 'string') return;
    let cancelled = false;
    AsyncStorage.getItem(draftKey(attemptId))
      .then((stored) => {
        if (!cancelled && stored) setNote(stored);
      })
      .catch(() => {
        // Draft load is best-effort.
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // Debounce-write the draft as the user types.
  // 500ms gives fast typists room to coalesce and surfaces the "Saved"
  // microcopy at a cadence that actually reassures.
  useEffect(() => {
    if (typeof attemptId !== 'string') return;
    if (draftWriteTimeout.current) clearTimeout(draftWriteTimeout.current);
    draftWriteTimeout.current = setTimeout(() => {
      if (note) {
        void AsyncStorage.setItem(draftKey(attemptId), note).then(() => {
          setShowSavedIndicator(true);
          if (savedFadeTimeout.current) clearTimeout(savedFadeTimeout.current);
          savedFadeTimeout.current = setTimeout(
            () => setShowSavedIndicator(false),
            2000
          );
        });
      } else {
        void AsyncStorage.removeItem(draftKey(attemptId));
      }
    }, 500);
    return () => {
      if (draftWriteTimeout.current) clearTimeout(draftWriteTimeout.current);
      if (savedFadeTimeout.current) clearTimeout(savedFadeTimeout.current);
    };
  }, [note, attemptId]);

  const handleResponse = async (result: 'yes' | 'tried' | 'no') => {
    if (!behavior || !behaviorId || !attemptId) return;

    setIsSubmitting(true);

    try {
      const checkIn: CheckIn = {
        id: generateUUID(),
        behaviorId: behavior.id,
        at: Date.now(),
        result,
        note: note || undefined,
      };

      await addCheckIn(checkIn);
      await handleCheckInResponse(behavior.id, attemptId as string, result);

      if (typeof attemptId === 'string') {
        await AsyncStorage.removeItem(draftKey(attemptId));
      }

      router.back();
    } catch (error) {
      console.error('Failed to record check-in:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!behavior) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>State not found</Text>
      </View>
    );
  }

  const isEliminate = behavior.kind === 'eliminate';
  // Consistent labels across kinds — "Caught it / Tried / Missed" reads
  // the same regardless of whether you're adopting or eliminating, and the
  // previous "Snooze" label on Adopt was confused for a notification snooze.
  const yesLabel = 'Caught it';
  const triedLabel = 'Tried';
  const noLabel = 'Missed';
  const messageBody = isEliminate ? `CATCH IT — ${behavior.pingMessage}` : behavior.pingMessage;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.kindPill,
            { backgroundColor: isEliminate ? colors.warningSoft : colors.tintSoft },
          ]}
        >
          <Text
            style={[
              styles.kindPillText,
              { color: isEliminate ? colors.warning : colors.tint },
            ]}
          >
            {isEliminate ? 'ELIMINATE' : 'ADOPT'}
          </Text>
        </View>
        <Text style={[styles.behaviorTitle, { color: colors.text }]}>{behavior.title}</Text>
        <Text style={[styles.message, { color: colors.text }]}>{messageBody}</Text>

        <View style={styles.buttonContainer}>
          <Pressable
            onPress={() => handleResponse('yes')}
            disabled={isSubmitting}
            style={[
              styles.button,
              { backgroundColor: colors.tint, opacity: isSubmitting ? 0.5 : 1 },
            ]}
            accessibilityLabel={yesLabel}
          >
            <Text style={styles.buttonText}>{yesLabel}</Text>
          </Pressable>
          <View style={styles.triedRow}>
            <Pressable
              onPress={() => handleResponse('tried')}
              disabled={isSubmitting}
              style={[
                styles.button,
                styles.triedButton,
                {
                  borderColor: colors.warning,
                  backgroundColor: colors.warningSoft,
                  opacity: isSubmitting ? 0.5 : 1,
                  flex: 1,
                },
              ]}
              accessibilityLabel={triedLabel}
              accessibilityHint="Showing up counts — use when you engaged but didn't fully complete."
            >
              <Text style={[styles.buttonText, { color: colors.warning }]}>{triedLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowTriedHint((v) => !v)}
              style={[
                styles.helpButton,
                { borderColor: colors.warning, backgroundColor: colors.warningSoft },
              ]}
              accessibilityLabel="Why Tried?"
              accessibilityHint="Shows what Tried means for your streak"
            >
              <Text style={[styles.helpButtonText, { color: colors.warning }]}>?</Text>
            </Pressable>
          </View>
          {showTriedHint ? (
            <Text style={[styles.triedHint, { color: colors.textMuted }]}>
              Showing up counts. Tried preserves your streak — use it when you
              engaged but didn&apos;t fully complete.
            </Text>
          ) : null}
          <Pressable
            onPress={() => handleResponse('no')}
            disabled={isSubmitting}
            style={[
              styles.button,
              styles.noButton,
              { borderColor: colors.tint, opacity: isSubmitting ? 0.5 : 1 },
            ]}
            accessibilityLabel={noLabel}
          >
            <Text style={[styles.buttonText, { color: colors.tint }]}>{noLabel}</Text>
          </Pressable>
        </View>

        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.text }]}>Add a note (optional)</Text>
          {showSavedIndicator ? (
            <Text style={[styles.savedIndicator, { color: colors.textMuted }]}>
              Saved
            </Text>
          ) : null}
        </View>
        <TextInput
          style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
          placeholder="How did it go?"
          placeholderTextColor={colors.textMuted}
          value={note}
          onChangeText={setNote}
          multiline
          editable={!isSubmitting}
          accessibilityLabel="Optional note about this check-in"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxxl + Space.sm,
  },
  kindPill: {
    alignSelf: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    marginBottom: Space.md,
  },
  kindPillText: { ...Type.micro },
  behaviorTitle: {
    ...Type.h1,
    textAlign: 'center',
    marginBottom: Space.md,
  },
  message: {
    ...Type.body,
    textAlign: 'center',
    marginBottom: Space.xxxl + Space.sm,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: Space.sm,
    marginBottom: Space.xxxl + Space.sm,
  },
  button: {
    paddingVertical: Space.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  triedButton: {
    borderWidth: 2,
  },
  triedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  helpButton: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButtonText: {
    ...Type.bodyBold,
    fontWeight: '800',
  },
  triedHint: {
    ...Type.caption,
    marginTop: Space.xs,
  },
  noButton: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  buttonText: {
    ...Type.h2,
    color: 'white',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  label: {
    ...Type.bodyBold,
  },
  savedIndicator: {
    ...Type.caption,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Space.md,
    minHeight: 80,
    ...Type.body,
  },
  errorText: {
    textAlign: 'center',
    ...Type.body,
  },
});
