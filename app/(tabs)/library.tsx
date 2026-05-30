import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Type, Space, Radius, type ThemeColors } from '@/constants/theme';
import {
  LIBRARY_GUIDES,
  ADOPT_TEMPLATES,
  ELIMINATE_TEMPLATES,
  LIBRARY_PACKAGES,
  domainLabel,
  type LibraryGuide,
  type AdoptTemplate,
  type EliminateTemplate,
  type LibraryPackage,
} from '@/services/library-content';
import { useContentModals } from '@/components/library/content-modals-provider';
import { SearchBar } from '@/components/library/search-bar';

/**
 * Filter chips at the top of Library. `Browse` is the default and surfaces a
 * featured card per kind so the merged tab doesn't feel like a wall of items.
 */
type Filter = 'browse' | 'guides' | 'adopt' | 'eliminate' | 'packages';

const FILTER_LABELS: Record<Filter, string> = {
  browse: 'Browse',
  guides: 'Guides',
  adopt: 'Adopt',
  eliminate: 'Eliminate',
  packages: 'Packages',
};

const FILTERS: Filter[] = ['browse', 'guides', 'adopt', 'eliminate', 'packages'];

function matches(q: string, haystack: string[]): boolean {
  if (!q) return true;
  return haystack.some((s) => s.toLowerCase().includes(q));
}

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { openGuide, openAdopt, openEliminate, openPackage } = useContentModals();
  const [filter, setFilter] = useState<Filter>('browse');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filteredGuides = useMemo(
    () =>
      LIBRARY_GUIDES.filter((g) =>
        matches(q, [g.title, g.summary, domainLabel(g.domain)])
      ),
    [q]
  );

  const filteredAdopt = useMemo(
    () =>
      ADOPT_TEMPLATES.filter((t) =>
        matches(q, [t.title, t.pingMessage, domainLabel(t.domain)])
      ),
    [q]
  );

  const filteredEliminate = useMemo(
    () =>
      ELIMINATE_TEMPLATES.filter((t) =>
        matches(q, [t.title, t.pingMessage, domainLabel(t.domain)])
      ),
    [q]
  );

  const filteredPackages = useMemo(
    () =>
      LIBRARY_PACKAGES.filter((p) => matches(q, [p.title, p.description])),
    [q]
  );

  // For "Browse": one featured card per kind. Pure index-0 for now; later
  // phases can swap in real featuring logic.
  const featuredGuide = filteredGuides[0];
  const featuredAdopt = filteredAdopt[0];
  const featuredEliminate = filteredEliminate[0];
  const featuredPackage = filteredPackages[0];

  const browseEmpty =
    !featuredGuide && !featuredAdopt && !featuredEliminate && !featuredPackage;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Space.md }]}>
        <Text style={[styles.title, { color: colors.text }]}>Library</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Research-grounded guides, Adopt + Eliminate templates, packages.
        </Text>
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search library…"
        colors={colors}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityLabel={`Filter: ${FILTER_LABELS[f]}`}
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.tint : colors.surfaceMuted,
                  borderColor: active ? colors.tint : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: active ? colors.textOnBrand : colors.text,
                  },
                ]}
              >
                {FILTER_LABELS[f]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {filter === 'browse' ? (
          browseEmpty ? (
            <Text style={[styles.noMatches, { color: colors.textMuted }]}>
              No matches — try a different term.
            </Text>
          ) : (
            <View style={styles.section}>
              {featuredGuide ? (
                <>
                  <SectionLabel colors={colors}>Guide</SectionLabel>
                  <GuideCard
                    guide={featuredGuide}
                    colors={colors}
                    onPress={() => openGuide(featuredGuide.id)}
                  />
                </>
              ) : null}
              {featuredAdopt ? (
                <>
                  <SectionLabel colors={colors}>Adopt</SectionLabel>
                  <TemplateCard
                    title={featuredAdopt.title}
                    domain={domainLabel(featuredAdopt.domain)}
                    colors={colors}
                    onPress={() => openAdopt(featuredAdopt.id)}
                  />
                </>
              ) : null}
              {featuredEliminate ? (
                <>
                  <SectionLabel colors={colors}>Eliminate</SectionLabel>
                  <TemplateCard
                    title={featuredEliminate.title}
                    domain={domainLabel(featuredEliminate.domain)}
                    colors={colors}
                    onPress={() => openEliminate(featuredEliminate.id)}
                  />
                </>
              ) : null}
              {featuredPackage ? (
                <>
                  <SectionLabel colors={colors}>Package</SectionLabel>
                  <PackageCard
                    pkg={featuredPackage}
                    colors={colors}
                    onPress={() => openPackage(featuredPackage.id)}
                  />
                </>
              ) : null}
            </View>
          )
        ) : null}

        {filter === 'guides' ? (
          <ListOrEmpty
            colors={colors}
            isEmpty={filteredGuides.length === 0}
            emptyHint="No guides match — try a different term."
          >
            {filteredGuides.map((g) => (
              <GuideCard
                key={g.id}
                guide={g}
                colors={colors}
                onPress={() => openGuide(g.id)}
              />
            ))}
          </ListOrEmpty>
        ) : null}

        {filter === 'adopt' ? (
          <Grid
            colors={colors}
            isEmpty={filteredAdopt.length === 0}
            emptyHint="No Adopt templates match — try a different term."
          >
            {filteredAdopt.map((t) => (
              <TemplateCard
                key={t.id}
                title={t.title}
                domain={domainLabel(t.domain)}
                colors={colors}
                onPress={() => openAdopt(t.id)}
              />
            ))}
          </Grid>
        ) : null}

        {filter === 'eliminate' ? (
          <Grid
            colors={colors}
            isEmpty={filteredEliminate.length === 0}
            emptyHint="No Eliminate templates match — try a different term."
          >
            {filteredEliminate.map((t) => (
              <TemplateCard
                key={t.id}
                title={t.title}
                domain={domainLabel(t.domain)}
                colors={colors}
                onPress={() => openEliminate(t.id)}
              />
            ))}
          </Grid>
        ) : null}

        {filter === 'packages' ? (
          <ListOrEmpty
            colors={colors}
            isEmpty={filteredPackages.length === 0}
            emptyHint="No packages match — try a different term."
          >
            {filteredPackages.map((p) => (
              <PackageCard
                key={p.id}
                pkg={p}
                colors={colors}
                onPress={() => openPackage(p.id)}
              />
            ))}
          </ListOrEmpty>
        ) : null}
      </ScrollView>
    </View>
  );
}

// --- Sub-components ---

function SectionLabel({
  colors,
  children,
}: {
  colors: ThemeColors;
  children: string;
}) {
  return (
    <Text
      style={[
        styles.sectionLabel,
        { color: colors.textMuted, borderColor: colors.border },
      ]}
    >
      {children}
    </Text>
  );
}

function GuideCard({
  guide,
  colors,
  onPress,
}: {
  guide: LibraryGuide;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.tintSoft, borderColor: colors.tintMuted },
      ]}
      accessibilityLabel={`${guide.title} guide, ${guide.estimatedMinutes} minute read`}
      accessibilityHint="Opens the full guide"
    >
      <Text style={[styles.cardTitle, { color: colors.text }]}>{guide.title}</Text>
      <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
        {domainLabel(guide.domain)} · {guide.estimatedMinutes} min read
      </Text>
      <Text style={[styles.cardBody, { color: colors.text }]} numberOfLines={3}>
        {guide.summary}
      </Text>
    </Pressable>
  );
}

function TemplateCard({
  title,
  domain,
  colors,
  onPress,
}: {
  title: string;
  domain: string;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.gridCard,
        { backgroundColor: colors.tintSoft, borderColor: colors.tintMuted },
      ]}
      accessibilityLabel={`${title}, ${domain}`}
      accessibilityHint="Opens template details"
    >
      <Text
        numberOfLines={3}
        style={[styles.gridCardTitle, { color: colors.text }]}
      >
        {title}
      </Text>
      <Text style={[styles.gridCardMeta, { color: colors.textMuted }]}>
        {domain}
      </Text>
    </Pressable>
  );
}

function PackageCard({
  pkg,
  colors,
  onPress,
}: {
  pkg: LibraryPackage;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.packageCard,
        { backgroundColor: colors.tintSoft, borderColor: colors.tintMuted },
      ]}
      accessibilityLabel={`${pkg.title} package, ${pkg.guideIds.length} guides`}
      accessibilityHint="Opens package details"
    >
      <Text style={[styles.packageName, { color: colors.text }]}>{pkg.title}</Text>
      <Text style={[styles.packageMeta, { color: colors.textMuted }]}>
        {pkg.guideIds.length} guides
      </Text>
      <Text
        style={[styles.packageDescription, { color: colors.text }]}
        numberOfLines={2}
      >
        {pkg.description}
      </Text>
    </Pressable>
  );
}

function ListOrEmpty({
  colors,
  isEmpty,
  emptyHint,
  children,
}: {
  colors: ThemeColors;
  isEmpty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  if (isEmpty) {
    return (
      <Text style={[styles.noMatches, { color: colors.textMuted }]}>
        {emptyHint}
      </Text>
    );
  }
  return <View style={styles.list}>{children}</View>;
}

function Grid({
  colors,
  isEmpty,
  emptyHint,
  children,
}: {
  colors: ThemeColors;
  isEmpty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  if (isEmpty) {
    return (
      <Text style={[styles.noMatches, { color: colors.textMuted }]}>
        {emptyHint}
      </Text>
    );
  }
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
  },
  title: { ...Type.h1 },
  subtitle: { ...Type.caption, marginTop: Space.xs },
  chipsRow: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipText: { ...Type.caption, fontWeight: '600' },
  scrollContent: {
    padding: Space.lg,
    paddingTop: Space.sm,
    gap: Space.md,
  },
  section: { gap: Space.sm },
  sectionLabel: {
    ...Type.micro,
    textTransform: 'uppercase',
    marginTop: Space.sm,
  },
  list: { gap: Space.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  noMatches: {
    ...Type.body,
    textAlign: 'center',
    paddingVertical: Space.xxl,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.md,
    gap: Space.xs,
  },
  cardTitle: { ...Type.bodyBold },
  cardMeta: { ...Type.micro, marginTop: Space.xxs },
  cardBody: { ...Type.caption, marginTop: Space.xs },
  gridCard: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
    justifyContent: 'space-between',
  },
  gridCardTitle: { ...Type.bodyBold },
  gridCardMeta: { ...Type.caption },
  packageCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.lg,
    gap: Space.xs,
  },
  packageName: { ...Type.h2 },
  packageMeta: { ...Type.caption },
  packageDescription: { ...Type.caption, marginTop: Space.xs },
});
