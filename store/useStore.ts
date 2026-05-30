import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Behavior, CheckIn, ReminderAttempt, AppProfile, BehaviorKind, Stage } from '../types';
import { calculateStreak } from '../services/streak';
import {
  INITIAL_LEVEL,
  INITIAL_LAST_LEVELUP_STREAK,
  LEVEL_MIN,
  LEVEL_MAX,
} from '../services/levels';

const BEHAVIORS_KEY = 'rpg.behaviors.v3';
const BEHAVIORS_V2_KEY = 'rpg.behaviors.v2';
const BEHAVIORS_V1_KEY = 'rpg.behaviors.v1';

const LEGACY_STABILITY_TO_LEVEL: Array<[number, number]> = [
  [6, 1],
  [12, 2],
  [24, 3],
  [48, 4],
];

function stabilityToLevel(stability: number): number {
  for (const [threshold, level] of LEGACY_STABILITY_TO_LEVEL) {
    if (stability < threshold) return level;
  }
  return LEVEL_MAX;
}

interface LegacyBehavior {
  id: string;
  kind?: BehaviorKind;
  title: string;
  pingMessage: string;
  activeDays: number[];
  window: { from: string; to: string };
  frequency?: { pingsPerHour: number };
  level?: number;
  pausedUntil?: number;
  lastLevelUpStreak?: number;
  createdAt: number;
  hidden: boolean;
  bookmarked: boolean;
  behaviorsToEliminate?: string[];
  tags?: string[];
  journal?: string;
  intervalMinutes?: number;
  stability?: number;
  difficulty?: number;
  lastNoStreak?: number;
  practiceType?: Behavior['practiceType'];
  domain?: Behavior['domain'];
  libraryGuideId?: string;
  replacementStateId?: string;
}

function migrateBehavior(b: LegacyBehavior): Behavior {
  const intervalMinutes =
    b.intervalMinutes ??
    Math.max(1, Math.min(60, Math.round(60 / (b.frequency?.pingsPerHour ?? 4))));

  let level: number;
  if (typeof b.level === 'number') {
    level = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, b.level));
  } else if (typeof b.stability === 'number') {
    level = stabilityToLevel(b.stability);
  } else {
    level = INITIAL_LEVEL;
  }

  return {
    id: b.id,
    kind: b.kind ?? 'adopt',
    title: b.title,
    pingMessage: b.pingMessage,
    practiceType: b.practiceType,
    domain: b.domain,
    libraryGuideId: b.libraryGuideId,
    replacementStateId: b.replacementStateId,
    behaviorsToEliminate: b.behaviorsToEliminate,
    tags: b.tags,
    journal: b.journal,
    activeDays: b.activeDays,
    window: b.window,
    intervalMinutes,
    level,
    lastLevelUpStreak: b.lastLevelUpStreak ?? INITIAL_LAST_LEVELUP_STREAK,
    pausedUntil: b.pausedUntil,
    createdAt: b.createdAt,
    hidden: b.hidden,
    bookmarked: b.bookmarked,
  };
}

/**
 * Transient backup of a just-deleted behavior so the dashboard can offer
 * an Undo affordance for ~5s after the deletion. Lives in memory only —
 * persisting it would let "yesterday's delete" resurrect itself today.
 */
export interface PendingUndoDelete {
  kind: 'delete';
  behavior: Behavior;
  attempts: ReminderAttempt[];
  deletedAt: number;
}

/**
 * A just-fired level-up waiting to be celebrated by the modal at root.
 * Memory-only: re-firing on next launch would be a delayed surprise rather
 * than a moment-of-success. Cleared on dismiss.
 */
export interface PendingLevelUp {
  behaviorId: string;
  behaviorTitle: string;
  fromStage: Stage;
  toStage: Stage;
  streak: number;
  triggeredAt: number;
}

interface StoreState {
  behaviors: Behavior[];
  checkIns: CheckIn[];
  reminderAttempts: ReminderAttempt[];
  appProfile: AppProfile;
  isHydrated: boolean;
  pendingUndo: PendingUndoDelete | null;
  pendingLevelUp: PendingLevelUp | null;

  hydrate: () => Promise<void>;
  addBehavior: (behavior: Behavior) => Promise<void>;
  updateBehavior: (behavior: Behavior) => Promise<void>;
  deleteBehavior: (id: string) => Promise<void>;
  addCheckIn: (checkIn: CheckIn) => Promise<void>;
  /** Mutate a previously recorded check-in's result (e.g. user fat-fingered No). */
  updateCheckIn: (id: string, result: 'yes' | 'tried' | 'no') => Promise<void>;
  getStreak: (behaviorId: string) => number;
  setOnboarded: (value: boolean) => Promise<void>;
  updateAppProfile: (partial: Partial<AppProfile>) => Promise<void>;
  addReminderAttempt: (attempt: ReminderAttempt) => Promise<void>;
  updateReminderAttempt: (attempt: ReminderAttempt) => Promise<void>;
  getReminderAttempts: (behaviorId: string) => ReminderAttempt[];
  /** Stash a just-deleted behavior so the Undo banner can resurface it. */
  setPendingUndo: (p: PendingUndoDelete | null) => void;
  /**
   * Restore the queued deletion: re-add the behavior, re-add its attempts,
   * clear the queue. Returns the restored behavior so callers can
   * reschedule notifications (we don't import services/notifications here
   * to avoid a cycle).
   */
  restorePendingUndo: () => Promise<Behavior | null>;
  /** Queue a level-up celebration; the root modal listens and renders. */
  setPendingLevelUp: (p: PendingLevelUp | null) => void;
}

const useStore = create<StoreState>((set, get) => ({
  behaviors: [],
  checkIns: [],
  reminderAttempts: [],
  appProfile: { hasOnboarded: false },
  isHydrated: false,
  pendingUndo: null,
  pendingLevelUp: null,

  hydrate: async () => {
    try {
      const [v3Data, v2Data, v1Data, checkInsData, reminderAttemptsData, appProfileData] =
        await Promise.all([
          AsyncStorage.getItem(BEHAVIORS_KEY),
          AsyncStorage.getItem(BEHAVIORS_V2_KEY),
          AsyncStorage.getItem(BEHAVIORS_V1_KEY),
          AsyncStorage.getItem('rpg.checkins.v1'),
          AsyncStorage.getItem('rpg.reminderAttempts.v1'),
          AsyncStorage.getItem('rpg.app.v1'),
        ]);

      let behaviors: Behavior[];
      if (v3Data) {
        behaviors = JSON.parse(v3Data);
      } else if (v2Data || v1Data) {
        const legacy: LegacyBehavior[] = JSON.parse(v2Data ?? v1Data ?? '[]');
        behaviors = legacy.map(migrateBehavior);
        await AsyncStorage.setItem(BEHAVIORS_KEY, JSON.stringify(behaviors));
      } else {
        behaviors = [];
      }

      set({
        behaviors,
        checkIns: checkInsData ? JSON.parse(checkInsData) : [],
        reminderAttempts: reminderAttemptsData ? JSON.parse(reminderAttemptsData) : [],
        appProfile: appProfileData ? JSON.parse(appProfileData) : { hasOnboarded: false },
        isHydrated: true,
      });
    } catch (error) {
      console.error('Failed to hydrate store:', error);
      set({ isHydrated: true });
    }
  },

  addBehavior: async (behavior: Behavior) => {
    const state = get();
    const updated = [...state.behaviors, behavior];
    set({ behaviors: updated });
    await AsyncStorage.setItem(BEHAVIORS_KEY, JSON.stringify(updated));
  },

  updateBehavior: async (behavior: Behavior) => {
    const state = get();
    const updated = state.behaviors.map((b) => (b.id === behavior.id ? behavior : b));
    set({ behaviors: updated });
    await AsyncStorage.setItem(BEHAVIORS_KEY, JSON.stringify(updated));
  },

  deleteBehavior: async (id: string) => {
    const state = get();
    const updated = state.behaviors.filter((b) => b.id !== id);
    const checkInsUpdated = state.checkIns.filter((c) => c.behaviorId !== id);
    const attemptsUpdated = state.reminderAttempts.filter((a) => a.behaviorId !== id);
    set({
      behaviors: updated,
      checkIns: checkInsUpdated,
      reminderAttempts: attemptsUpdated,
    });
    await AsyncStorage.setItem(BEHAVIORS_KEY, JSON.stringify(updated));
    await AsyncStorage.setItem('rpg.checkins.v1', JSON.stringify(checkInsUpdated));
    await AsyncStorage.setItem('rpg.reminderAttempts.v1', JSON.stringify(attemptsUpdated));
  },

  addCheckIn: async (checkIn: CheckIn) => {
    const state = get();
    const updated = [...state.checkIns, checkIn];
    set({ checkIns: updated });
    await AsyncStorage.setItem('rpg.checkins.v1', JSON.stringify(updated));
  },

  updateCheckIn: async (id, result) => {
    const state = get();
    const updated = state.checkIns.map((c) => (c.id === id ? { ...c, result } : c));
    set({ checkIns: updated });
    await AsyncStorage.setItem('rpg.checkins.v1', JSON.stringify(updated));
  },

  getStreak: (behaviorId: string) => {
    const state = get();
    return calculateStreak(behaviorId, state.checkIns);
  },

  setOnboarded: async (value: boolean) => {
    const state = get();
    const updated = { ...state.appProfile, hasOnboarded: value };
    set({ appProfile: updated });
    await AsyncStorage.setItem('rpg.app.v1', JSON.stringify(updated));
  },

  updateAppProfile: async (partial: Partial<AppProfile>) => {
    const state = get();
    const updated = { ...state.appProfile, ...partial };
    set({ appProfile: updated });
    await AsyncStorage.setItem('rpg.app.v1', JSON.stringify(updated));
  },

  addReminderAttempt: async (attempt: ReminderAttempt) => {
    const state = get();
    const updated = [...state.reminderAttempts, attempt];
    set({ reminderAttempts: updated });
    await AsyncStorage.setItem('rpg.reminderAttempts.v1', JSON.stringify(updated));
  },

  updateReminderAttempt: async (attempt: ReminderAttempt) => {
    const state = get();
    const updated = state.reminderAttempts.map((ra) =>
      ra.id === attempt.id ? attempt : ra
    );
    set({ reminderAttempts: updated });
    await AsyncStorage.setItem('rpg.reminderAttempts.v1', JSON.stringify(updated));
  },

  getReminderAttempts: (behaviorId: string) => {
    const state = get();
    return state.reminderAttempts.filter((ra) => ra.behaviorId === behaviorId);
  },

  setPendingUndo: (p) => {
    set({ pendingUndo: p });
  },

  setPendingLevelUp: (p) => {
    set({ pendingLevelUp: p });
  },

  restorePendingUndo: async () => {
    const state = get();
    const pending = state.pendingUndo;
    if (!pending) return null;
    // Re-add the behavior + its attempts. We avoid calling the public
    // addBehavior / addReminderAttempt methods because they each touch
    // AsyncStorage once; one consolidated write is faster and safer.
    const updatedBehaviors = [...state.behaviors, pending.behavior];
    const updatedAttempts = [...state.reminderAttempts, ...pending.attempts];
    set({
      behaviors: updatedBehaviors,
      reminderAttempts: updatedAttempts,
      pendingUndo: null,
    });
    await Promise.all([
      AsyncStorage.setItem(BEHAVIORS_KEY, JSON.stringify(updatedBehaviors)),
      AsyncStorage.setItem('rpg.reminderAttempts.v1', JSON.stringify(updatedAttempts)),
    ]);
    return pending.behavior;
  },
}));

export default useStore;
