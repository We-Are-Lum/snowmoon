/**
 * A challenge picture's optional Backstory (owner, 2026-11-09, "GO"; approved wording, exact): the maker's own words,
 * at most BACKSTORY_MAX characters, typed in a PublishedTextField on the publish (preview) screen of a NEW challenge
 * picture (owner, 2026-11-09: new pictures only). Three starter questions are shown as hints and never put in the box.
 * Shown under the picture as "Invented by @maker, not from the book". No spoiler mark: on the challenge's pages people
 * work on the whole story (owner, 2026-11-09). The prompt check (the same guard, 1,200 tokens) reads it at publish; a
 * refusal lets the maker edit it or publish without it. No model writes, fills or suggests it (scripts/test-backstory.ts
 * proves it). Pure: no network, no database; the browser and the server both read it.
 */
/** At most this many characters (owner: 400 on 2026-11-09; 2,000 on 2026-11-11). The field, the server and the tests read it. */
export const BACKSTORY_MAX = 2000;

export const BACKSTORY_WORDING = {
  label: 'Backstory',
  optional: '(optional)',
  hints: (name: string) => [`What changed for ${name}?`, 'Where are they now?', 'What do they want that they didn’t before?'],
  invented: (maker: string) => `Invented by ${maker}, not from the book`,
  /** DRAFT wording (the agent's), for the refusal and the admin's button. */
  refused: 'The prompt check didn’t allow this backstory. Change it, or publish without it.',
  withoutIt: 'Publish without it',
  tooLong: (n: number) => `Write the backstory in up to ${n.toLocaleString('en-US')} characters.`,
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

/**
 * Adding a backstory after publish (owner's spec, 2026-11-12): on a challenge picture's page,
 * for its maker only, one to three paragraphs (a blank line between paragraphs), at most BACKSTORY_MAX characters, the
 * same prompt check. It starts from the backstory the picture already has. Each save is a new row of
 * studio.challenge_backstories (append-only); the newest is the picture's backstory; the version's body is never edited.
 */
export const BACKSTORY_PARAGRAPHS_MAX = 3;

/** The paragraphs of a backstory: blocks separated by a blank line, blank ones dropped. */
export const paragraphsOf = (text: string): string[] => text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);

/** What "Save" may hold: typed text of one to three paragraphs, up to the limit (nothing is not a backstory here). */
export function readAddedBackstory(input: unknown): { ok: true; backstory: Backstory } | { ok: false; error: string } {
  const r = readBackstory(input);
  if (!r.ok) return r;
  if (!r.backstory) return { ok: false, error: ADD_BACKSTORY_WORDING.empty };
  if (paragraphsOf(r.backstory.text).length > BACKSTORY_PARAGRAPHS_MAX) return { ok: false, error: ADD_BACKSTORY_WORDING.tooManyParagraphs(BACKSTORY_PARAGRAPHS_MAX) };
  return { ok: true, backstory: r.backstory };
}

/** DRAFT wording (the coding agent's, 2026-11-12; the owner will rewrite): the "Add a backstory" box on a picture's page. */
export const ADD_BACKSTORY_WORDING = {
  head: 'Add a backstory',
  edit: 'Edit the backstory',
  intro: 'One to three paragraphs, in your own words. Leave a blank line between paragraphs.',
  save: 'Save backstory',
  saving: 'Checking…',
  saved: 'Saved. It shows under your picture.',
  unchanged: 'That’s the backstory it already has.',
  empty: 'Write the backstory first.',
  tooManyParagraphs: (n: number) => `Keep it to ${n} paragraphs or fewer.`,
  refused: 'The prompt check didn’t allow this backstory. Change it and save again.',
  guideHead: 'What makes a good backstory',
} as const;

/**
 * DRAFT (the coding agent's five points, 2026-11-12; the owner will rewrite them): shown next to the box. Advice only:
 * nothing here is put in the box, and no model writes, fills or suggests a backstory.
 */
export const BACKSTORY_GUIDE: readonly string[] = [
  'Start from the picture: what just happened, or is about to?',
  'Give them one want and one thing in the way.',
  'Show a single moment or detail rather than a whole life story.',
  'Make it fit beside the book: a reader of Snowmoon should believe it.',
  'Your own words, about invented things: no real people, and nothing copied.',
];
