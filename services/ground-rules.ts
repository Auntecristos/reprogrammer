export interface GroundRule {
  id: string;
  title: string;
  body: string;
  citation: string;
}

/**
 * The three rules shown during onboarding — the ones that pass an
 * actual gut check for someone deciding whether this app fits them.
 * The other two (`rule-no-magic`, `rule-timeline`) live in
 * `EXTENDED_GROUND_RULES` and surface under Profile → About so the
 * onboarding flow doesn't drown the user in caveats up front.
 */
export const ONBOARDING_GROUND_RULES_IDS = [
  'rule-time',
  'rule-silence',
  'rule-exercise',
] as const;

export const GROUND_RULES: GroundRule[] = [
  {
    id: 'rule-time',
    title: 'Show up — more days than not.',
    body: 'Habits form from repetition, not perfection. Aim for daily practice — actual doing, not just reading — but a missed day is data, not failure. Come back tomorrow.',
    citation: 'Lally et al., 2010 — habit automaticity emerges from frequency; one missed opportunity does not break formation',
  },
  {
    id: 'rule-silence',
    title: 'Tell one person — not everyone.',
    body: "Premature broadcasting can release the dopamine that should fuel the doing. But silence isn't the goal — one trusted person who knows what you're working on is protective when you slip. Pick carefully; share intentionally.",
    citation: 'Gollwitzer et al., 2009; Marlatt & Gordon, 1985 — social support reduces relapse',
  },
  {
    id: 'rule-exercise',
    title: 'The exercise is everything.',
    body: "Reading the guides doesn't change you. Doing the exercise does. Start before you feel ready. The first rep is the hardest.",
    citation: 'Amabile & Kramer, 2011 — the Progress Principle',
  },
  {
    id: 'rule-no-magic',
    title: 'This app will not magically change you.',
    body: 'It gives structure and guidance. The effort is entirely yours. Browsing the features and journaling about change is not change.',
    citation: 'Lally et al., 2010 — habit formation averages 66 days (range 18–254)',
  },
  {
    id: 'rule-timeline',
    title: 'This is a 3 to 12 month journey.',
    body: 'Most people quit not because the method failed, but because they set the wrong timeline. Lower the expectation. Raise the commitment.',
    citation: 'Polivy & Herman, 2002 — False Hope Syndrome',
  },
];

/** The three rules shown in onboarding. */
export const ONBOARDING_RULES: GroundRule[] = GROUND_RULES.filter((r) =>
  (ONBOARDING_GROUND_RULES_IDS as readonly string[]).includes(r.id)
);

/** Rules surfaced under Profile → About (everything not in onboarding). */
export const EXTENDED_RULES: GroundRule[] = GROUND_RULES.filter(
  (r) => !(ONBOARDING_GROUND_RULES_IDS as readonly string[]).includes(r.id)
);
