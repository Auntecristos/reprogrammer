import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import useStore from '@/store/useStore';
import {
  handleNotificationAction,
  requestNotificationPermission,
  rescheduleAll,
  setupNotificationCategory,
} from '@/services/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const isHydrated = useStore((state) => state.isHydrated);
  const appProfile = useStore((state) => state.appProfile);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    const setup = async () => {
      await useStore.getState().hydrate();
      await requestNotificationPermission();
      await setupNotificationCategory();

      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification) => {
          console.log('Notification received:', notification);
          rescheduleAll();
        }
      );

      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const { behaviorId, attemptId, phase } = response.notification.request.content.data as {
            behaviorId?: string;
            attemptId?: string;
            phase?: string;
          };
          const actionId = response.actionIdentifier;

          if (!behaviorId || !attemptId) return;

          if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
            router.push({
              pathname: '/checkin',
              params: { behaviorId, attemptId, phase: phase || 'initial' },
            });
          } else {
            handleNotificationAction(behaviorId, attemptId, actionId);
          }
        }
      );

      await rescheduleAll({ force: true });
    };

    setup();

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        rescheduleAll();
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      sub.remove();
    };
  }, [router]);

  if (!isHydrated) {
    return null;
  }

  if (!appProfile.hasOnboarded) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="checkin"
          options={{ presentation: 'modal', headerShown: true, title: 'Check In' }}
        />
        <Stack.Screen
          name="create"
          options={{ presentation: 'modal', headerShown: true, title: 'Create State' }}
        />
        <Stack.Screen name="behavior/[id]" options={{ headerShown: true, title: 'State' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
