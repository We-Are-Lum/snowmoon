/**
 * How "How it was made" names a challenge picture's drawn setting (src/lib/challenge/settings.ts; owner, 2026-11-09).
 * DRAFT wording, drafted by the coding agent (Claude, a closed model by Anthropic). No server-only imports: the preview
 * (a client screen) uses it too. It cites the blocks; it isn't a quote and shows none of the book's text (P9).
 */
export const SETTING_WORDING = {
  head: 'Setting (this edition’s description of the book’s setting, not a quote)',
  line: (s: { id: string; text: string; blocks: readonly string[] }) =>
    `${s.text}. Drawn at random from five for a closed model (setting ${s.id}); it describes the book at ${s.blocks.join(', ')}.`,
} as const;
