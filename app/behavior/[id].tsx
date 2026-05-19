import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import useStore from '@/store/useStore';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { cancelForBehavior, sendTestNotification } from '@/services/notifications';
import { bucketLevel } from '@/services/fsrs';

export default function BehaviorDetailScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { id } = useLocalSearchParams();
  const { behaviors, checkIns, getStreak, deleteBehavior, updateBehavior } = useStore();
  const [, setRefresh] = useState({});

  useFocusEffect(
    useCallback(() => {
      setRefresh({});
    }, [])
  );

  const behavior = behaviors.find(b => b.id === id as string);
  const behaviorCheckIns = (behavior
    ? checkIns.filter(c => c.behaviorId === behavior.id).sort((a, b) => b.at - a.at)
    : []
  ).slice(0, 20);

  if (!behavior) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>
          State not found
        </Text>
      </View>
    );
  }

  const streak = getStreak(behavior.id);

  const handleEdit = () => {
    router.push({ pathname: '/create', params: { id: behavior.id } });
  };

  const handleDelete = () => {
    Alert.alert('Delete State', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          await cancelForBehavior(behavior.id);
          await deleteBehavior(behavior.id);
          router.back();
        },
        style: 'destructive',
      },
    ]);
  };

  const handleToggleBookmark = async () => {
    await updateBehavior({
      ...behavior,
      bookmarked: !behavior.bookmarked,
    });
  };

  const handleArchive = async () => {
    await updateBehavior({
      ...behavior,
      hidden: true,
    });
    router.back();
  };

  const handleTestNotification = async () => {
    try {
      await sendTestNotification(behavior);
      Alert.alert('Test Notification Sent', 'Check your notifications in 1 second');
    } catch (error) {
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {behavior.title}
            </Text>
          </View>
          <Pressable
            onPress={handleTestNotification}
            style={[styles.testButton, { backgroundColor: colors.tint }]}
          >
            <Text style={styles.testButtonText}>Test</Text>
          </Pressable>
        </View>
        <Text style={[styles.message, { color: colors.text }]}>
          {behavior.pingMessage}
        </Text>
      </View>

      <View style={[styles.streakCard, { backgroundColor: colors.successSoft }]}>
        <Text style={[styles.streakLabel, { color: colors.stateEnabledText }]}>
          Current Streak
        </Text>
        <View style={styles.streakRow}>
          <IconSymbol name="flame.fill" size={40} color={colors.warning} />
          <Text style={[styles.streakValue, { color: colors.stateEnabledText }]}>
            {streak}
          </Text>
        </View>
        <Text style={[styles.streakDays, { color: colors.stateEnabledText }]}>days</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Details
        </Text>
        <View style={[styles.detailItem, { borderBottomColor: colors.text + '20' }]}>
          <Text style={[styles.detailLabel, { color: colors.text }]}>Time Window</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {behavior.window.from === '00:00' && behavior.window.to === '23:59'
              ? 'All day'
              : `${behavior.window.from} – ${behavior.window.to}`}
          </Text>
        </View>
        <View style={[styles.detailItem, { borderBottomColor: colors.text + '20' }]}>
          <Text style={[styles.detailLabel, { color: colors.text }]}>Interval</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            every {behavior.intervalMinutes} min
          </Text>
        </View>
        <View style={[styles.detailItem, { borderBottomColor: colors.text + '20' }]}>
          <Text style={[styles.detailLabel, { color: colors.text }]}>Level</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            L{bucketLevel(behavior.stability)} · stability {behavior.stability.toFixed(1)}h
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Recent Check-ins
        </Text>
        {behaviorCheckIns.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No check-ins yet
          </Text>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={behaviorCheckIns}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const date = new Date(item.at);
              const timeStr = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const dateStr = date.toLocaleDateString();

              return (
                <View
                  style={[
                    styles.checkInItem,
                    {
                      backgroundColor:
                        item.result === 'yes'
                          ? colors.tint + '20'
                          : colors.text + '20',
                      borderLeftColor:
                        item.result === 'yes' ? colors.tint : colors.text,
                    },
                  ]}
                >
                  <View style={styles.checkInHeader}>
                    <Text
                      style={[
                        styles.checkInResult,
                        {
                          color: item.result === 'yes' ? colors.tint : colors.text,
                        },
                      ]}
                    >
                      {item.result === 'yes' ? '✓ Yes' : '✗ No'}
                    </Text>
                    <Text style={[styles.checkInTime, { color: colors.text }]}>
                      {dateStr} {timeStr}
                    </Text>
                  </View>
                  {item.note && (
                    <Text style={[styles.checkInNote, { color: colors.text }]}>
                      {item.note}
                    </Text>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>

      <View style={styles.iconActionRow}>
        <IconActionButton
          label="Edit"
          icon="pencil"
          onPress={handleEdit}
          variant="primary"
          colors={colors}
        />
        <IconActionButton
          label={behavior.bookmarked ? 'Bookmarked' : 'Bookmark'}
          icon={behavior.bookmarked ? 'bookmark.fill' : 'bookmark'}
          onPress={handleToggleBookmark}
          variant="ghost"
          iconColor={behavior.bookmarked ? colors.warning : colors.textMuted}
          colors={colors}
        />
        <IconActionButton
          label="Archive"
          icon="archivebox.fill"
          onPress={handleArchive}
          variant="neutral"
          colors={colors}
        />
        <IconActionButton
          label="Delete"
          icon="trash.fill"
          onPress={handleDelete}
          variant="danger"
          colors={colors}
        />
      </View>
    </ScrollView>
  );
}

type IconButtonVariant = 'primary' | 'ghost' | 'neutral' | 'danger';

function IconActionButton({
  label,
  icon,
  onPress,
  variant,
  iconColor,
  colors,
}: {
  label: string;
  icon: Parameters<typeof IconSymbol>[0]['name'];
  onPress: () => void;
  variant: IconButtonVariant;
  iconColor?: string;
  colors: typeof Colors.light;
}) {
  const styleByVariant = {
    primary: { backgroundColor: colors.tint, borderColor: colors.tint, borderWidth: 0 },
    ghost: { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1.5 },
    neutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted, borderWidth: 0 },
    danger: { backgroundColor: colors.danger, borderColor: colors.danger, borderWidth: 0 },
  }[variant];

  const defaultIconColor =
    variant === 'primary' || variant === 'danger'
      ? colors.textOnBrand
      : colors.text;

  return (
    <View style={styles.iconActionItem}>
      <Pressable
        onPress={onPress}
        style={[styles.iconActionButton, styleByVariant]}
        accessibilityLabel={label}
      >
        <IconSymbol name={icon} size={20} color={iconColor ?? defaultIconColor} />
      </Pressable>
      <Text style={[styles.iconActionLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  testButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  testButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    marginBottom: 8,
  },
  streakCard: {
    margin: 20,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  streakLabel: {
    fontSize: 14,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakValue: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 50,
  },
  streakDays: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  checkInItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  checkInHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  checkInResult: {
    fontWeight: '600',
    fontSize: 14,
  },
  checkInTime: {
    fontSize: 12,
  },
  checkInNote: {
    fontSize: 12,
    marginTop: 4,
  },
  iconActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  iconActionItem: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  iconActionButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20,
  },
});
