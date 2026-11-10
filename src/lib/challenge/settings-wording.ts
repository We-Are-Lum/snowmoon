/**
 * How "How it was made" names a challenge picture's drawn setting (src/lib/challenge/settings.ts; owner, 2026-11-09).
 * The owner's wording (2026-11-09), first drafted by the coding agent (Claude, a closed model by Anthropic). No server-only imports: the preview
 * (a client screen) uses it too. It cites the blocks; it isn't a quote and shows none of the book's text (P9).
 */
export const SETTING_WORDING = {
  // The owner's words (follow-up review, 2026-11-09; coordinator reviewed, owner approved), the same on the preview and the picture's page.
  head: 'Setting',
  line: (s: { id: string; text: string; blocks: readonly string[] }) =>
    `${s.text}. This edition's description of the book's world, not a quote, picked at random from four (setting ${s.id}); based on ${s.blocks.join(', ')}.`,
} as const;
