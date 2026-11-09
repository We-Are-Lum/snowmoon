/**
 * A challenge picture's optional Backstory (owner, 2026-11-09, "GO"; approved wording, exact): the maker's own words,
 * at most BACKSTORY_MAX characters, typed in a PublishedTextField on the publish (preview) screen. Three starter
 * questions are shown as hints and never put in the box. A tick says it mentions things from later in the book, which
 * adds "May spoil later chapters." on the picture's page. Shown under the picture as "Invented by @maker, not from the
 * book". The prompt check (the same guard, 1,200 tokens) reads it at publish; a refusal lets the maker edit it or
 * publish without it. No model writes, fills or suggests it (scripts/test-backstory.ts proves it). Pure: no network,
 * no database; the browser and the server both read it.
 */
export const BACKSTORY_MAX = 400;

export const BACKSTORY_WORDING = {
  label: 'Backstory',
  optional: '(optional)',
  hints: (name: string) => [`What changed for ${name}?`, 'Where are they now?', 'What do they want that they didn’t before?'],
  spoilTick: 'Mentions things from later in the book',
  spoils: 'May spoil later chapters.',
  invented: (maker: string) => `Invented by ${maker}, not from the book`,
  /** DRAFT wording (the agent's), for the refusal and the admin's button. */
  refused: 'The prompt check didn’t allow this backstory. Change it, or publish without it.',
  withoutIt: 'Publish without it',
  add: 'Add backstory',
  save: 'Save backstory',
  saved: 'Saved.',
  tooLong: (n: number) => `Write the backstory in up to ${n} characters.`,
} as const;

export interface Backstory {
  text: string;
  /** "Mentions things from later in the book". */
  spoils: boolean;
}
/** As kept: with when it was written (at publish, or when its maker added it later). */
export interface StoredBackstory extends Backstory {
  at: string;
}

/** What a request may hold: nothing (no backstory), or typed text up to the limit and the tick. */
export function readBackstory(input: unknown): { ok: true; backstory: Backstory | null } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, backstory: null };
  const b = (typeof input === 'object' ? input : {}) as { text?: unknown; spoils?: unknown };
  if (typeof b.text !== 'string') return { ok: false, error: 'Bad backstory' };
  const text = b.text.replace(/\r\n/g, '\n').trim();
  if (!text) return { ok: true, backstory: null };
  if ([...text].length > BACKSTORY_MAX) return { ok: false, error: BACKSTORY_WORDING.tooLong(BACKSTORY_MAX) };
  return { ok: true, backstory: { text, spoils: b.spoils === true } };
}

/** A stored backstory from a version's body (or the backstories table), or null. */
export function storedBackstory(x: unknown): StoredBackstory | null {
  const b = (x && typeof x === 'object' ? x : null) as { text?: unknown; spoils?: unknown; at?: unknown } | null;
  if (!b || typeof b.text !== 'string' || !b.text.trim()) return null;
  return { text: b.text, spoils: b.spoils === true, at: typeof b.at === 'string' ? b.at : '' };
}
