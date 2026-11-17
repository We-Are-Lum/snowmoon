/**
 * The remix challenge's moments and cards (branch challenge-moments, owner 2026-11-05), as pure checks, so
 * check:principles runs them on the files and scripts/test-challenge-moments.ts proves each is narrow on planted faults.
 *
 * - P8i: the cards' and moments' quotes are the book's, word for word at real blocks (the part of the old P9g that
 *   wasn't about spoilers; principle 9 was retired by the owner on 2026-11-17).
 * - P2m: the agent-drafted cards and scene lines are approved before /challenge goes public (answer 2).
 * - P6ac: entries as pictures only once Terms §6e and Privacy say so (legal texts describe today).
 */
import type { CharacterCard } from '../../src/lib/challenge/cards';
import type { Moment } from '../../src/lib/challenge/moments';
import { quoteProblems } from '../../src/lib/challenge/book-quotes';
import { cardQuotes, cardShapeProblems } from '../../src/lib/challenge/cards';
import { momentShapeProblems } from '../../src/lib/challenge/moments';

export type Files = { file: string; text: string }[];
/** The challenge's pages' data (P2m reads it). */
export const CHALLENGE_VIEW = 'src/lib/challenge/view.ts';
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const get = (files: Files, f: string) => files.find((x) => x.file === f)?.text ?? null;

/**
 * P8i (owner, 2026-11-17, when principle 9 was retired): the part of the old P9g that isn't about spoilers. The
 * challenge's cards and moments quote the book word for word, each at a block that exists, and there is one card per
 * challenge character, with about three first-layer facts and "Where they appear" in book order. The spoiler rules
 * P9g also held (the first layer from chapters 1 to 14, the "Later in the book (spoilers)" fold closed by default, no
 * spoiler mark, every moment chip with its chapter, the reader's own chapter gating, the cards imported nowhere else,
 * and the exception ending when entries close) went with principle 9.
 */
export function p8iProblems(p: {
  cards: readonly CharacterCard[];
  moments: readonly Moment[];
  characters: readonly string[];
  blocks: ReadonlyMap<string, { kind: string; content: string }>;
}): string[] {
  const mq = p.moments.flatMap((m) => m.quotes.map((q) => ({ where: `moment ${m.id}`, block: q.block, text: q.text })));
  return [...quoteProblems([...mq, ...cardQuotes(p.cards)], p.blocks), ...cardShapeProblems(p.cards, p.characters), ...momentShapeProblems(p.moments, p.characters)];
}

/** P2m: /challenge goes public only with the cards and the scene lines approved by the owner. */
export function p2mProblems(c: { public: boolean; cardsApproved: boolean; sceneLinesApproved: boolean }, files: Files): string[] {
  const out: string[] = [];
  if (c.public && !c.cardsApproved) out.push('CHALLENGE.public is on, but the character cards (src/lib/challenge/cards.ts) aren\'t approved by the owner (CHALLENGE.cardsApproved)');
  if (c.public && !c.sceneLinesApproved) out.push('CHALLENGE.public is on, but the moments\' titles and scene lines (src/lib/challenge/moments.ts) aren\'t approved by the owner (CHALLENGE.sceneLinesApproved)');
  const view = stripComments(get(files, CHALLENGE_VIEW) ?? '');
  if (!/draft: CHALLENGE\.cardsApproved \? null : W\.draftShort/.test(view)) out.push(`${CHALLENGE_VIEW}: an unapproved card doesn't carry the "Draft wording" mark`);
  return out;
}

/** P6ac: entries as pictures (CHALLENGE.pictureEntries) only while Terms §6e and Privacy §4 describe them. */
export function p6acProblems(on: boolean, terms: { n: number | string; body: (string | string[])[] }[], privacy: { n: number | string; body: (string | string[])[] }[]): string[] {
  if (!on) return [];
  const text = (doc: typeof terms, n: number | string) => (doc.find((s) => String(s.n) === String(n))?.body ?? []).flat().join(' ');
  const out: string[] = [];
  if (!/pictures? of (a challenge character|its characters)/i.test(text(terms, '6e'))) out.push('CHALLENGE.pictureEntries is on, but Terms §6e doesn\'t say a picture of a challenge character is what counts');
  if (!/picture of a challenge character/i.test(text(privacy, 4))) out.push('CHALLENGE.pictureEntries is on, but Privacy §4 doesn\'t describe the pictures you publish for the challenge');
  return out;
}
