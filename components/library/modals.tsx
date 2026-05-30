import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  domainLabel,
  type LibraryGuide,
  type LibraryPackage,
  type AdoptTemplate,
  type EliminateTemplate,
  LIBRARY_GUIDES,
} from '@/services/library-content';
import { Type, Space, Radius, type ThemeColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  transformWikiLinks,
  decodeWikiHref,
  resolveWikiLabel,
  type ContentTarget,
} from './content-link-resolver';
import { createMarkdownStyles } from './markdown-styles';

interface ModalHeaderProps {
  canBack: boolean;
  colors: ThemeColors;
  onBack: () => void;
  onClose: () => void;
}

function ModalHeader({ canBack, colors, onBack, onClose }: ModalHeaderProps) {
  return (
    <View style={styles.modalHeader}>
      {canBack ? (
        <Pressable
          onPress={onBack}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityLabel="Back to previous"
        >
          <IconSymbol name="chevron.left" size={22} color={colors.tint} />
        </Pressable>
      ) : (
        <View style={styles.headerButton} />
      )}
      <Pressable
        onPress={onClose}
        style={styles.headerButton}
        hitSlop={8}
        accessibilityLabel="Close"
      >
        <IconSymbol name="xmark" size={20} color={colors.tint} />
      </Pressable>
    </View>
  );
}

interface MarkdownBodyProps {
  body: string;
  colors: ThemeColors;
  onOpenTarget: (target: NonNullable<ContentTarget>) => void;
}

function MarkdownBody({ body, colors, onOpenTarget }: MarkdownBodyProps) {
  const mdStyles = createMarkdownStyles(colors);
  return (
    <Markdown
      style={mdStyles}
      onLinkPress={(url: string) => {
        const wikiLabel = decodeWikiHref(url);
        if (wikiLabel) {
          const resolved = resolveWikiLabel(wikiLabel);
          if (resolved) {
            onOpenTarget(resolved);
            return false;
          }
          return false;
        }
        return true;
      }}
    >
      {transformWikiLinks(body)}
    </Markdown>
  );
}

interface GuideViewProps {
  guide: LibraryGuide;
  colors: ThemeColors;
  onOpenTarget: (target: NonNullable<ContentTarget>) => void;
}

export function GuideView({ guide, colors, onOpenTarget }: GuideViewProps) {
  return (
    <ScrollView contentContainerStyle={styles.modalContent}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>{guide.title}</Text>
      <Text style={[styles.modalMeta, { color: colors.textMuted }]}>
        {domainLabel(guide.domain)} · {guide.estimatedMinutes} min read
      </Text>
      <View style={{ marginTop: 12 }}>
        <MarkdownBody body={guide.body} colors={colors} onOpenTarget={onOpenTarget} />
      </View>
    </ScrollView>
  );
}

interface AdoptViewProps {
  template: AdoptTemplate;
  added: boolean;
  colors: ThemeColors;
  onOpenTarget: (target: NonNullable<ContentTarget>) => void;
  onAdd: () => void;
}

export function AdoptView({
  template,
  added,
  colors,
  onOpenTarget,
  onAdd,
}: AdoptViewProps) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.modalContent}>
        <View
          style={[
            styles.kindBadge,
            { backgroundColor: colors.tintSoft, borderColor: colors.tintMuted },
          ]}
        >
          <Text style={[styles.kindBadgeText, { color: colors.textMuted }]}>
            Adopt
          </Text>
        </View>

        <Text style={[styles.modalTitle, { color: colors.text }]}>
          {template.title}
        </Text>
        <Text style={[styles.modalMeta, { color: colors.textMuted }]}>
          {domainLabel(template.domain)}
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          Reminder message
        </Text>
        <Text style={[styles.bodyLine, { color: colors.text }]}>
          {template.pingMessage}
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          Cadence
        </Text>
        <Text style={[styles.bodyLine, { color: colors.text }]}>
          Every {template.intervalMinutes} minutes, {template.window.from}–
          {template.window.to}
        </Text>

        {template.body ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              Practice
            </Text>
            <MarkdownBody
              body={template.body}
              colors={colors}
              onOpenTarget={onOpenTarget}
            />
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.modalFooter,
          { borderTopColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <Pressable
          onPress={onAdd}
          disabled={added}
          style={[
            styles.addButton,
            { backgroundColor: added ? colors.surfaceMuted : colors.tint },
          ]}
          accessibilityLabel={added ? 'Already added' : 'Add to dashboard'}
        >
          <Text
            style={[
              styles.addButtonText,
              { color: added ? colors.textMuted : colors.textOnBrand },
            ]}
          >
            {added ? 'Added' : 'Add to dashboard'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface EliminateViewProps {
  template: EliminateTemplate;
  added: boolean;
  colors: ThemeColors;
  onOpenTarget: (target: NonNullable<ContentTarget>) => void;
  onAdd: () => void;
}

export function EliminateView({
  template,
  added,
  colors,
  onOpenTarget,
  onAdd,
}: EliminateViewProps) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.modalContent}>
        <View
          style={[
            styles.kindBadge,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.kindBadgeText, { color: colors.textMuted }]}>
            Eliminate
          </Text>
        </View>

        <Text style={[styles.modalTitle, { color: colors.text }]}>
          {template.title}
        </Text>
        <Text style={[styles.modalMeta, { color: colors.textMuted }]}>
          {domainLabel(template.domain)}
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          Reminder message
        </Text>
        <Text style={[styles.bodyLine, { color: colors.text }]}>
          {template.pingMessage}
        </Text>

        {template.triggers && template.triggers.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              Triggers
            </Text>
            <View style={styles.chipRow}>
              {template.triggers.map((t, i) => (
                <View
                  key={i}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.chipText, { color: colors.text }]}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {template.body ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              How to break it
            </Text>
            <MarkdownBody
              body={template.body}
              colors={colors}
              onOpenTarget={onOpenTarget}
            />
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.modalFooter,
          { borderTopColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <Pressable
          onPress={onAdd}
          disabled={added}
          style={[
            styles.addButton,
            { backgroundColor: added ? colors.surfaceMuted : colors.tint },
          ]}
          accessibilityLabel={added ? 'Already added' : 'Add to dashboard'}
        >
          <Text
            style={[
              styles.addButtonText,
              { color: added ? colors.textMuted : colors.textOnBrand },
            ]}
          >
            {added ? 'Added' : 'Add to dashboard'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface PackageViewProps {
  pkg: LibraryPackage;
  colors: ThemeColors;
  onOpenTarget: (target: NonNullable<ContentTarget>) => void;
}

export function PackageView({ pkg, colors, onOpenTarget }: PackageViewProps) {
  const guides: LibraryGuide[] = pkg.guideIds
    .map((id) => LIBRARY_GUIDES.find((g) => g.id === id))
    .filter((g): g is LibraryGuide => g !== undefined);

  return (
    <ScrollView contentContainerStyle={styles.modalContent}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>{pkg.title}</Text>
      <Text style={[styles.modalMeta, { color: colors.textMuted }]}>
        {pkg.guideIds.length} guides
      </Text>
      <Text style={[styles.intro, { color: colors.text }]}>{pkg.description}</Text>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
        Included guides
      </Text>
      {guides.map((guide) => (
        <Pressable
          key={guide.id}
          onPress={() => onOpenTarget({ kind: 'guide', guide })}
          style={[
            styles.includedGuide,
            { backgroundColor: colors.tintSoft, borderColor: colors.tintMuted },
          ]}
          accessibilityLabel={`${guide.title} guide, ${guide.estimatedMinutes} minute read`}
          accessibilityHint="Opens the full guide"
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {guide.title}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
            {domainLabel(guide.domain)} · {guide.estimatedMinutes} min read
          </Text>
          <Text style={[styles.cardBody, { color: colors.text }]} numberOfLines={2}>
            {guide.summary}
          </Text>
        </Pressable>
      ))}

      {pkg.body ? (
        <View style={{ marginTop: 16 }}>
          <MarkdownBody body={pkg.body} colors={colors} onOpenTarget={onOpenTarget} />
        </View>
      ) : null}
    </ScrollView>
  );
}

interface ContentModalProps {
  visible: boolean;
  target: ContentTarget;
  canBack: boolean;
  added: boolean;
  colors: ThemeColors;
  onBack: () => void;
  onClose: () => void;
  onOpenTarget: (target: NonNullable<ContentTarget>) => void;
  onAdd: () => void;
}

export function ContentModal({
  visible,
  target,
  canBack,
  added,
  colors,
  onBack,
  onClose,
  onOpenTarget,
  onAdd,
}: ContentModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {target && (
        <View
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          accessibilityViewIsModal
        >
          <ModalHeader
            canBack={canBack}
            colors={colors}
            onBack={onBack}
            onClose={onClose}
          />
          {target.kind === 'guide' && (
            <GuideView
              guide={target.guide}
              colors={colors}
              onOpenTarget={onOpenTarget}
            />
          )}
          {target.kind === 'adopt' && (
            <AdoptView
              template={target.template}
              added={added}
              colors={colors}
              onOpenTarget={onOpenTarget}
              onAdd={onAdd}
            />
          )}
          {target.kind === 'eliminate' && (
            <EliminateView
              template={target.template}
              added={added}
              colors={colors}
              onOpenTarget={onOpenTarget}
              onAdd={onAdd}
            />
          )}
          {target.kind === 'package' && (
            <PackageView
              pkg={target.pkg}
              colors={colors}
              onOpenTarget={onOpenTarget}
            />
          )}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.xs,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    padding: Space.xl,
    paddingTop: Space.sm,
    paddingBottom: Space.xxxl,
  },
  // Editorial display for guide / template / package titles inside the
  // content modal. Diverges from `Type.h1` (used elsewhere for screen
  // headers) because long-form reading wants more presence on the title.
  modalTitle: { ...Type.display2 },
  modalMeta: { ...Type.caption, marginTop: Space.xs },
  sectionLabel: {
    ...Type.micro,
    textTransform: 'uppercase',
    marginTop: Space.lg,
    marginBottom: Space.xs,
  },
  bodyLine: { ...Type.body },
  intro: { ...Type.body, marginTop: Space.md },
  kindBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs,
    marginBottom: Space.sm,
  },
  kindBadgeText: { ...Type.micro },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  chip: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + Space.xxs - 1, // = 5; tight vertical to keep chip slim
  },
  chipText: { ...Type.caption },
  includedGuide: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.md,
    gap: Space.xs,
    marginTop: Space.sm,
  },
  cardTitle: { ...Type.bodyBold },
  cardMeta: { ...Type.micro, marginTop: 2 },
  cardBody: { ...Type.caption, marginTop: Space.xs },
  modalFooter: {
    borderTopWidth: 1,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  addButton: {
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  addButtonText: { ...Type.bodyBold },
});
