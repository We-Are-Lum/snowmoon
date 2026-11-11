/**
 * A challenge picture's optional Backstory (owner, 2026-11-09, "GO"; approved wording, exact): the maker's own words,
 * at most BACKSTORY_MAX characters, typed in a PublishedTextField on the publish (preview) screen of a NEW challenge
 * picture (owner, 2026-11-09: new pictures only). Three starter questions are shown as hints and never put in the box.
 * Shown under the picture as "Invented by @maker, not from the book". No spoiler mark: on the challenge's pages people
 * work on the whole story (owner, 2026-11-09). The prompt check (the same guard, 1,200 tokens) reads it at publish; a
 * refusal lets the maker edit it or publish without it. No model writes, fills or suggests it (scripts/test-backstory.ts
 * proves it). Pure: no network, no database; the browser and the server both read it.
 */
export const BACKSTORY_MAX = 400;

export const BACKSTORY_WORDING = {
  label: 'Backstory',
  optional: '(optional)',
  hints: (name: string) => [`What changed for ${name}?`, 'Where are they now?', 'What do they want that they didn’t before?'],
  invented: (maker: string) => `Invented by ${maker}, not from the book`,
  /** DRAFT wording (the agent's), for the refusal and the admin's button. */
  refused: 'The prompt check didn’t allow this backstory. Change it, or publish without it.',
  withoutIt: 'Publish without it',
  tooLong: (n: number) => `Write the backstory in up to ${n} characters.`,
} as const;

export interface Backstory {
  text: string;
}
/** As kept in the version's body: with when it was written (at publish). */
export interface StoredBackstory extends Backstory {
  at: string;
}

/** What a request may hold: nothing (no backstory), or typed text up to the limit. */
export function readBackstory(input: unknown): { ok: true; backstory: Backstory | null } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, backstory: null };
  const b = (typeof input === 'object' ? input : {}) as { text?: unknown };
  if (typeof b.text !== 'string') return { ok: false, error: 'Bad backstory' };
  const text = b.text.replace(/\r\n/g, '\n').trim();
  if (!text) return { ok: true, backstory: null };
  if ([...text].length > BACKSTORY_MAX) return { ok: false, error: BACKSTORY_WORDING.tooLong(BACKSTORY_MAX) };
  return { ok: true, backstory: { text } };
}

/** A stored backstory from a version's body, or null. */
export function storedBackstory(x: unknown): StoredBackstory | null {
  const b = (x && typeof x === 'object' ? x : null) as { text?: unknown; at?: unknown } | null;
  if (!b || typeof b.text !== 'string' || !b.text.trim()) return null;
  return { text: b.text, at: typeof b.at === 'string' ? b.at : '' };
}
