import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface BrandLogoProps {
  size?: number;
  variant?: 'tile' | 'inline';
  animated?: boolean;
}

const MONO_FAMILY = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'Menlo',
});

/**
 * Reprogrammer brand mark: `>R` in monospace with a blinking cursor block.
 * - `tile` variant fills a rounded square (use for app-icon-style placements).
 * - `inline` variant renders glyph + cursor inline (use in headers, splash).
 */
export function BrandLogo({ size = 96, variant = 'tile', animated = true }: BrandLogoProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const isTile = variant === 'tile';
  const glyphColor = isTile ? colors.stateEnabledText : colors.tint;
  const containerBg = isTile ? colors.stateEnabledBg : 'transparent';

  const glyphSize = size * 0.5;
  const cursorWidth = size * 0.1;
  const cursorHeight = glyphSize * 0.75;

  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, opacity]);

  return (
    <View
      style={[
        styles.container,
        isTile && {
          width: size,
          height: size,
          backgroundColor: containerBg,
          borderRadius: size * 0.22,
        },
      ]}
    >
      <Text
        style={[
          styles.glyph,
          {
            color: glyphColor,
            fontSize: glyphSize,
            fontFamily: MONO_FAMILY,
          },
        ]}
      >
        {'>R'}
      </Text>
      <Animated.View
        style={[
          styles.cursor,
          {
            width: cursorWidth,
            height: cursorHeight,
            backgroundColor: glyphColor,
            marginLeft: size * 0.02,
            opacity: animated ? opacity : 1,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glyph: {
    fontWeight: '700',
    letterSpacing: -2,
    lineHeight: undefined,
  },
  cursor: {
    borderRadius: 1,
  },
});
