/**
 * The style the challenge's bases were made in, "Animated series" (owner, 2026-11-09: published, so a remix starts in its
 * base's own look). Its text is word for word the drafts' style (docs/starting-sheet-drafts/directions/plan.json,
 * `styles["Animated series"]`, branch challenge-styles), which is also what each base's front recipe records as its
 * style. Quality words only: no artist, studio, film or real person (scripts/test-model-choice.ts C19 runs it through the
 * blocked names and the prompt check). Published by the owner with scripts/publish-style.ts.
 */
export const BASE_STYLE = {
  title: 'Animated series',
  text: 'Animated series look: clean bold black ink outlines of even weight, flat saturated cel colour with a single hard-edged shadow tone, simple graphic shapes, large expressive eyes and readable eyebrows, lively faces full of personality, slightly stylised proportions, crisp characters against soft muted backgrounds, clear readable faces and hands.',
  source: 'docs/starting-sheet-drafts/directions/plan.json, styles["Animated series"] (branch challenge-styles)',
} as const;
