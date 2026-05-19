import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import useStore from '@/store/useStore';
import { Behavior } from '@/types';
import { generateUUID } from '@/utils/uuid';
import { cancelForBehavior, scheduleForBehavior } from '@/services/notifications';
import {
  INITIAL_DIFFICULTY,
  INITIAL_STABILITY,
  INTERVAL_PRESETS,
  effectiveIntervalMinutes,
} from '@/services/fsrs';
import { useState, useMemo } from 'react';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToHHmm(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

function formatTimeForDisplay(hhmm: string): { time: string; period: string } {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return {
    time: `${hour12}:${m.toString().padStart(2, '0')}`,
    period,
  };
}

export default function CreateScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { id } = useLocalSearchParams();
  const { behaviors, addBehavior, updateBehavior } = useStore();

  const editingBehavior = useMemo(
    () => (id ? behaviors.find(b => b.id === id as string) : null),
    [id, behaviors]
  );

  const [title, setTitle] = useState(editingBehavior?.title || '');
  const [startTime, setStartTime] = useState(editingBehavior?.window.from || '09:00');
  const [endTime, setEndTime] = useState(editingBehavior?.window.to || '21:00');
  const [pickerOpen, setPickerOpen] = useState<'start' | 'end' | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(
    editingBehavior?.intervalMinutes ?? 15
  );
  const [activeDays, setActiveDays] = useState<number[]>(
    editingBehavior?.activeDays || [0, 1, 2, 3, 4, 5, 6]
  );

  const startDisplay = formatTimeForDisplay(startTime);
  const endDisplay = formatTimeForDisplay(endTime);

  const toggleDay = (day: number) => {
    setActiveDays((prev) =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const previewText = useMemo(() => {
    const startMin = hhmmToMinutes(startTime);
    const endMin = hhmmToMinutes(endTime);
    const durationMin = endMin - startMin;
    if (durationMin <= 0 || intervalMinutes <= 0) return 'Invalid time window';
    const stability = editingBehavior?.stability ?? INITIAL_STABILITY;
    const effMin = effectiveIntervalMinutes(intervalMinutes, stability);
    const totalPings = Math.max(1, Math.floor(durationMin / effMin));
    let spacingLabel: string;
    if (effMin >= 60) {
      const h = Math.floor(effMin / 60);
      const m = Math.round(effMin % 60);
      spacingLabel = m > 0 ? `${h}h ${m}m` : `${h}h`;
    } else {
      spacingLabel = `${Math.round(effMin)} min`;
    }
    const tail = effMin !== intervalMinutes ? ` (adapted from ${intervalMinutes}m)` : '';
    return `~${totalPings} pings today, ~every ${spacingLabel}${tail}`;
  }, [startTime, endTime, intervalMinutes, editingBehavior?.stability]);

  const handleTimeChange = (which: 'start' | 'end') => (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (Platform.OS === 'android') {
      setPickerOpen(null);
    }
    if (event.type === 'dismissed' || !selected) return;
    const value = dateToHHmm(selected);
    if (which === 'start') setStartTime(value);
    else setEndTime(value);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Label required', 'Please enter a state label');
      return;
    }

    if (hhmmToMinutes(endTime) <= hhmmToMinutes(startTime)) {
      Alert.alert('Invalid time window', 'The end time must be after the start time.');
      return;
    }

    if (activeDays.length === 0) {
      Alert.alert('No active days', 'Pick at least one day for this state.');
      return;
    }

    if (editingBehavior) {
      const updated: Behavior = {
        ...editingBehavior,
        title,
        pingMessage: title,
        window: { from: startTime, to: endTime },
        intervalMinutes,
        activeDays,
      };
      await cancelForBehavior(editingBehavior.id);
      await updateBehavior(updated);
      await scheduleForBehavior(updated);
    } else {
      const behavior: Behavior = {
        id: generateUUID(),
        title,
        pingMessage: title,
        window: { from: startTime, to: endTime },
        intervalMinutes,
        activeDays,
        stability: INITIAL_STABILITY,
        difficulty: INITIAL_DIFFICULTY,
        lastNoStreak: 0,
        createdAt: Date.now(),
        hidden: false,
        bookmarked: false,
      };
      await addBehavior(behavior);
      await scheduleForBehavior(behavior);
    }

    router.replace('/');
  };

  const handleCancel = () => router.back();

  const renderTimeChip = (
    which: 'start' | 'end',
    display: { time: string; period: string }
  ) => {
    const isOpen = pickerOpen === which;
    return (
      <Pressable
        onPress={() => setPickerOpen(isOpen ? null : which)}
        style={[
          styles.timeChip,
          {
            backgroundColor: isOpen ? colors.stateEnabledBg : colors.background,
            borderColor: colors.tintMuted,
          },
        ]}
      >
        <Text
          style={[
            styles.timeChipText,
            { color: isOpen ? colors.stateEnabledText : colors.text },
          ]}
        >
          {display.time}
        </Text>
        <Text
          style={[
            styles.timeChipPeriod,
            { color: isOpen ? colors.stateEnabledText : colors.textMuted },
          ]}
        >
          {display.period}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.timeBlock}>
          <View style={styles.timeColumn}>
            <Text style={[styles.timeColumnLabel, { color: colors.text + 'AA' }]}>From</Text>
            {renderTimeChip('start', startDisplay)}
          </View>
          <Text style={[styles.timeArrow, { color: colors.text + '66' }]}>→</Text>
          <View style={styles.timeColumn}>
            <Text style={[styles.timeColumnLabel, { color: colors.text + 'AA' }]}>To</Text>
            {renderTimeChip('end', endDisplay)}
          </View>
        </View>

        {pickerOpen === 'start' && (
          <View style={styles.pickerWrapper}>
            <DateTimePicker
              value={hhmmToDate(startTime)}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange('start')}
            />
          </View>
        )}
        {pickerOpen === 'end' && (
          <View style={styles.pickerWrapper}>
            <DateTimePicker
              value={hhmmToDate(endTime)}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange('end')}
            />
          </View>
        )}

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Repeat:</Text>
          <View style={styles.dayPills}>
            {DAY_LETTERS.map((letter, index) => {
              const active = activeDays.includes(index);
              return (
                <Pressable
                  key={index}
                  onPress={() => toggleDay(index)}
                  style={[
                    styles.dayPill,
                    {
                      backgroundColor: active ? colors.tintSoft : 'transparent',
                      borderColor: active ? colors.tintMuted : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayPillLetter,
                      { color: active ? colors.stateEnabledText : colors.textMuted },
                    ]}
                  >
                    {letter}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Label:</Text>
          <TextInput
            style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.text + '15' }]}
            placeholder="State"
            placeholderTextColor={colors.text + '66'}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Every:</Text>
          <View style={styles.intervalChips}>
            {INTERVAL_PRESETS.map((mins) => {
              const active = intervalMinutes === mins;
              return (
                <Pressable
                  key={mins}
                  onPress={() => setIntervalMinutes(mins)}
                  style={[
                    styles.intervalChip,
                    {
                      backgroundColor: active ? colors.tintSoft : 'transparent',
                      borderColor: active ? colors.tintMuted : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.intervalChipText,
                      { color: active ? colors.stateEnabledText : colors.textMuted },
                    ]}
                  >
                    {mins}m
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={[styles.previewText, { color: colors.textMuted }]}>{previewText}</Text>

        <View style={styles.buttonRow}>
          <Pressable
            onPress={handleCancel}
            style={[styles.actionButton, { backgroundColor: colors.surfaceMuted }]}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            style={[styles.actionButton, { backgroundColor: colors.tint }]}
          >
            <Text style={[styles.actionButtonText, { color: colors.textOnBrand }]}>
              Save
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 20,
  },
  timeBlock: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 16,
    marginTop: 8,
  },
  timeColumn: {
    alignItems: 'center',
    gap: 6,
  },
  timeColumnLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  timeChip: {
    minWidth: 120,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
  },
  timeChipText: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
  },
  timeChipPeriod: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 1,
  },
  timeArrow: {
    fontSize: 24,
    fontWeight: '600',
    paddingBottom: 18,
  },
  pickerWrapper: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    width: 76,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  dayPills: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  dayPill: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayPillLetter: {
    fontSize: 14,
    fontWeight: '700',
  },
  fieldInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  intervalChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  intervalChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  intervalChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: -4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
