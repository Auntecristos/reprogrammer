import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * iOS-style floating pill tab bar — frosted-glass, fully rounded, three
 * evenly-spaced tabs. Labels stay neutral; only the icon color changes
 * when active.
 */
function FloatingTabBarBackground() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <BlurView
      tint={isDark ? 'dark' : 'light'}
      intensity={60}
      style={StyleSheet.absoluteFill}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? 'rgba(20, 20, 20, 0.55)'
              : 'rgba(255, 255, 255, 0.55)',
          },
        ]}
      />
    </BlurView>
  );
}

const TAB_BAR_WIDTH = 340;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isDark = colorScheme === 'dark';

  const horizontalOffset = Math.max(16, (windowWidth - TAB_BAR_WIDTH) / 2);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '400',
          color: colors.tabIconDefault,
        },
        tabBarItemStyle: {
          paddingTop: 6,
          paddingBottom: 4,
        },
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: () => <FloatingTabBarBackground />,
        tabBarStyle: {
          position: 'absolute',
          left: horizontalOffset,
          right: horizontalOffset,
          bottom: Math.max(insets.bottom, 14),
          height: 64,
          borderRadius: 999,
          borderTopWidth: 0,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isDark
            ? 'rgba(255, 255, 255, 0.08)'
            : 'rgba(255, 255, 255, 0.55)',
          paddingHorizontal: 40,
          overflow: 'hidden',
          elevation: 8,
          shadowColor: '#141414',
          shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="square.grid.2x2.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="states"
        options={{
          title: 'States',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="square.stack.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="book.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
