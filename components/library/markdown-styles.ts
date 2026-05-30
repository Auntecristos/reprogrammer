import { StyleSheet } from 'react-native';
import {
  Type,
  Space,
  Radius,
  type ThemeColors,
} from '@/constants/theme';

/**
 * Long-form magazine body. Slightly taller line-height than `Type.body`
 * because guide content is meant to be READ — UI surfaces use `Type.body`
 * (15/22), guide bodies use this (16/26).
 */
const GUIDE_BODY = { fontSize: 16, lineHeight: 26, fontWeight: '400' as const };

export function createMarkdownStyles(colors: ThemeColors) {
  return StyleSheet.create({
    body: {
      color: colors.text,
      ...GUIDE_BODY,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: Space.md,
    },
    heading1: {
      ...Type.display2,
      color: colors.text,
      marginTop: Space.lg,
      marginBottom: Space.sm,
    },
    heading2: {
      ...Type.h2,
      color: colors.text,
      marginTop: Space.xl,
      marginBottom: Space.sm,
    },
    heading3: {
      ...Type.bodyBold,
      color: colors.text,
      marginTop: Space.lg,
      marginBottom: Space.xs,
    },
    strong: {
      fontWeight: '700',
      color: colors.text,
    },
    em: {
      fontStyle: 'italic',
      color: colors.text,
    },
    link: {
      color: colors.tint,
      textDecorationLine: 'underline',
    },
    /**
     * Pullquote — `> *italic body*` in source. The italicized phrase inside
     * gets the editorial treatment: tintMuted left border, larger size,
     * subtle background. The em inside takes over for italic; this block
     * sets the frame.
     */
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.tintMuted,
      backgroundColor: colors.tintSoft,
      paddingLeft: Space.lg,
      paddingRight: Space.md,
      paddingVertical: Space.md,
      marginVertical: Space.lg,
      borderRadius: Radius.sm,
      // The pull-quote body itself reads a hair larger than guide body.
      fontSize: 17,
      lineHeight: 28,
      fontStyle: 'italic',
      color: colors.text,
    },
    bullet_list: {
      marginVertical: Space.sm,
    },
    ordered_list: {
      marginVertical: Space.sm,
    },
    list_item: {
      flexDirection: 'row',
      marginBottom: Space.xs,
    },
    bullet_list_icon: {
      color: colors.tint,
      marginRight: Space.sm,
      lineHeight: 22,
    },
    ordered_list_icon: {
      color: colors.tint,
      marginRight: Space.sm,
      lineHeight: 22,
      fontWeight: '600',
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: Space.lg,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.sm,
      marginVertical: Space.md,
    },
    thead: {
      backgroundColor: colors.surfaceMuted,
    },
    th: {
      padding: Space.sm,
      fontWeight: '700',
      color: colors.text,
    },
    tr: {
      borderBottomWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
    },
    td: {
      padding: Space.sm,
      color: colors.text,
      ...Type.caption,
    },
    code_inline: {
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
      paddingHorizontal: Space.xs,
      paddingVertical: 1,
      borderRadius: Radius.sm,
      fontFamily: 'Menlo',
      ...Type.caption,
    },
    code_block: {
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
      padding: Space.sm,
      borderRadius: Radius.sm,
      fontFamily: 'Menlo',
      ...Type.caption,
      marginVertical: Space.sm,
    },
    fence: {
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
      padding: Space.sm,
      borderRadius: Radius.sm,
      fontFamily: 'Menlo',
      ...Type.caption,
      marginVertical: Space.sm,
    },
  });
}
