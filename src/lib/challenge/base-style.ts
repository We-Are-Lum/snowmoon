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

/**
 * The challenge's offered styles (CHALLENGE.offeredStyles; owner, 2026-11-09, final review): "Animated series" (above) and
 * two from the owner's style test (8 November), in his words. The prompt text is the part after the title's colon. Quality words only
 * (scripts/test-model-choice.ts C24: blocked names, studio/film/artist words, the prompt check mocked). Published by the
 * owner after the merge with scripts/publish-style.ts (dry run first; it refuses any that already exists).
 */
export interface OfferedStyle { title: string; text: string; source: string }
export const COMIC_BOOK: OfferedStyle = {
  title: 'Comic book',
  text: 'bold black ink outlines, flat bright colours, dot-pattern shading, dramatic angle',
  source: 'the owner\'s style test, "Comic book: bold black ink outlines, flat bright colours, dot-pattern shading, dramatic angle"',
};
export const COMIC_3D_MIX: OfferedStyle = {
  title: 'Comic 3D mix',
  text: '3D forms drawn over with hand-inked lines, halftone dots and hatching in the shadows, slightly offset colour printing, bold graphic colour',
  source: 'the owner\'s style test, "Comic 3D mix: 3D forms drawn over with hand-inked lines, halftone dots and hatching in the shadows, slightly offset colour printing, bold graphic colour"',
};
/**
 * "Mood", the fourth offered style (owner, 2026-11-09): already published on production as "Mood" by @naaate (version
 * 712ca63f-de6e-46bf-b3ad-7007b1120e16, 2026-10-15; title and text read from its public page,
 * /references/designs/712ca63f-de6e-46bf-b3ad-7007b1120e16). scripts/publish-style.ts refuses it there (it exists);
 * a local database gets it with this text.
 */
export const MOOD: OfferedStyle = {
  title: 'Mood',
  text: 'Intense, highly detailed graphic novel look. Moody. Expressive. Dark lines, bold colors. Visible brushstrokes.',
  source: 'published on production, version 712ca63f-de6e-46bf-b3ad-7007b1120e16 (its public page)',
};
export const OFFERED_STYLES: readonly OfferedStyle[] = [BASE_STYLE, COMIC_BOOK, COMIC_3D_MIX, MOOD];
