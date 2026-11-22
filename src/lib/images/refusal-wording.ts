/**
 * What a person is told when a picture is refused (branch refusal-reasons). Wording reread by the owner 2026-11-22
 * (#188's review page).
 * Owner Nate, 2026-11-18: say which rule the prompt check refused it under, "words" in its own words, and name the
 * closed model's maker when the maker's own check refused it. Drafted by the coding agent (Claude, a closed model by
 * Anthropic).
 *
 * The categories are the prompt check's, as config/prompts/image-guard.md names them (scripts/test-refusal-reasons.ts
 * ties the two). A refusal with no category, or one not listed here (the check's "unclear", anything else it writes),
 * gets the generic line, unchanged from before. The open model's own safety check keeps its words
 * (src/lib/challenge/model-wording.ts openBlocked, and "flagged by the safety checker" in paid.ts).
 * Plain to import anywhere (no server-only): the screens' checks read it too.
 */

/** The prompt check's categories, in the policy's order. */
export const GUARD_CATEGORIES = ['minor', 'sexual', 'real_person', 'violence', 'hateful', 'someone_elses_work', 'words', 'self_harm', 'extremism', 'campaign'] as const;
export type GuardCategory = (typeof GUARD_CATEGORIES)[number];

export const REFUSAL_WORDING = {
  /** No category, or one this file doesn't know: today's line, word for word. */
  generic: 'This prompt asks for something the rules don’t allow.',
  /** The owner's words (2026-11-18). */
  words: 'The image model here doesn’t draw words. Take them out and try again.',
  /** The owner's words (2026-11-18), with the rule in plain words. */
  rule: (plain: string) => `This prompt asks for something the rules don’t allow (${plain}). Change the words and try again.`,
  /** Each rule but "words", in plain words (the agent's phrases, someone_elses_work the owner's; reread by the owner 2026-11-22). */
  plain: {
    minor: 'anything sexual involving someone under 18',
    sexual: 'nudity or sexual content',
    real_person: 'a real person',
    violence: 'gore or graphic injury',
    hateful: 'hate symbols or slurs',
    someone_elses_work: 'a character, brand or film from another work, or a named artist’s style',
    self_harm: 'self-harm shown as something to copy',
    extremism: 'support for violent extremism',
    campaign: 'election campaign material',
  } satisfies Record<Exclude<GuardCategory, 'words'>, string>,
  /** The owner's words (2026-11-18): a closed model's maker (OpenAI, Google) refused the picture. */
  maker: (maker: string) => `${maker}’s own safety check refused this picture. Try other words.`,
} as const;

const known = (c: unknown): c is GuardCategory => typeof c === 'string' && (GUARD_CATEGORIES as readonly string[]).includes(c);

/** The line for a prompt-check refusal in `category`: words, a known rule, or the generic line. */
export function guardRefusal(category: string | null | undefined): string {
  if (!known(category)) return REFUSAL_WORDING.generic;
  return category === 'words' ? REFUSAL_WORDING.words : REFUSAL_WORDING.rule(REFUSAL_WORDING.plain[category]);
}

/**
 * The category a refusal is counted under in the day's totals (studio.image_refusals): a known one as it is, the check's
 * "unclear" or no category as 'unclear', anything else as 'other' (so a word the model makes up is never stored).
 */
export function countedCategory(category: string | null | undefined): string {
  if (known(category)) return category;
  return !category || category === 'unclear' ? 'unclear' : 'other';
}
