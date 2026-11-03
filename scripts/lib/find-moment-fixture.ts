/**
 * A recorded "Find a moment" reply and the real blocks it is checked against, shared by test:find-moment and
 * check:principles (P2k, P2l, P9a). Recorded only: no model is called. The blocks are the book's, read from
 * content/snowmoon/text/chapter-N.json (as the database holds them).
 *
 * The person has opened chapters 1 to 5 and asks about Bai. The reply has three good picks and these planted ones:
 * - c4-b74 with one word changed ("hands" for "fists");
 * - c4-b74 running on into c4-b75 (a quote across two blocks);
 * - c30-b6, past the chapter limit;
 * - c4-b70, a real sentence, with a why that copies the book's words (the why is dropped, the quote kept);
 * - c4-b76, a real sentence, with a why in quote marks (the why is dropped, the quote kept);
 * - c9-b1, an id search never returned.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const FIXTURE_UP_TO = 5;
export const FIXTURE_LIMIT = 5;
export const FIXTURE_MOOD = 'smug and needling a rival before a match';

type Block = { idx: number; kind: string; content: string; sha256: string };
export function bookBlocks(root: string, chapter: number): Block[] {
  return (JSON.parse(readFileSync(path.join(root, `content/snowmoon/text/chapter-${chapter}.json`), 'utf8')) as { blocks: Block[] }).blocks;
}

/** What book search returned (within the limit), plus c30-b6 for the planted past-limit pick. */
export function fixturePassages(root: string) {
  const ch4 = bookBlocks(root, 4).filter((b) => b.idx >= 70 && b.idx <= 76);
  const c30 = bookBlocks(root, 30).find((b) => b.idx === 6)!;
  const within = ch4.map((b) => ({ id: `c4-b${b.idx}`, chapter: 4, idx: b.idx, kind: b.kind, content: b.content, sha256: b.sha256 }));
  const later = { id: 'c30-b6', chapter: 30, idx: 6, kind: c30.kind, content: c30.content, sha256: c30.sha256 };
  return { within, later };
}

export const GOOD_PICKS = [
  "c4-b73 | Bai walked up closer, and put her hand on Zei's shoulder. | a friendly hand on the shoulder while needling, smug on the surface",
  "c4-b72 | Zei's facial expression immediately turned into a frown. | the rivalry shows on a face at once",
  'c4-b75 | She laughed, and slowly walked away. | leaving on her own terms after the taunt',
];
export const CHANGED_WORD = 'c4-b74 | Zei clenched his hands. | anger held in';
export const ACROSS_BLOCKS = 'c4-b74 | Zei clenched his fists. "See you in battle! | anger and a taunt';
export const PAST_LIMIT = 'c30-b6 | Fin responded almost immediately. | quick and sure';
export const WHY_COPIES = 'c4-b70 | Another woman walked in, about the same age as Zei. | another woman walked in about the same age, a rival arriving';
export const WHY_QUOTED = 'c4-b76 | A bell buzzed. | the match is "about to begin" for everyone';
export const NOT_SEARCHED = 'c9-b1 | Something from memory. | x';

export const FIXTURE_REPLY = [GOOD_PICKS[0], CHANGED_WORD, GOOD_PICKS[1], ACROSS_BLOCKS, PAST_LIMIT, WHY_COPIES, NOT_SEARCHED, GOOD_PICKS[2], WHY_QUOTED].join('\n');
