/**
 * Words a closed model draws in a picture (lettering, part C; owner's decisions of 2026-11-18 to 2026-11-22). Pure: no
 * database, no network, no server-only import, so the make screens (for the "Words to draw" preview), the server, the
 * tests and check:principles P8j all run the same rules. Drafted on branch closed-lettering (scripts/lib/lettering-draft.ts,
 * 2026-11-18) by the coding agent (Claude, a closed model by Anthropic); wired in on branch lettering. Wording reread by the owner 2026-11-22 (#215).
 *
 * The rules (owner):
 * - Only words in double quotation marks, straight or curly, are lettering; at most 3 phrases, 8 words and 48
 *   characters in a picture.
 * - Each phrase is recorded as the book's (an exact, case-sensitive match at whole words in a block as a reader sees it,
 *   with that block) or as the person's own (with their FID).
 * - Only a closed model draws them; the open model with quoted words is refused before anything is spent.
 * - For those pictures only, the prompt ends with the lettering line instead of the no-text line (IMAGES.suffix), and the
 *   prompt check reads them against the lettering policy (config/prompts/image-guard-lettering.md); the open model's
 *   policy (image-guard.md) is unchanged.
 * - The picture is padded to 16:9, never cropped, and read back as published, blind, by its own maker (OpenAI's reader
 *   for GPT Image, Google's for Gemini), against rule v1. A mismatch is never kept: the person can only try again.
 */
import { quotedText } from '../challenge/book-quotes';
import { CLOSED_IMAGES } from '../config';

// ---------------------------------------------------------------------------------------------------------------------
// The cap and the parser.
// ---------------------------------------------------------------------------------------------------------------------
export const LETTERING_CAP = { phrases: 3, words: 8, chars: 48 } as const;
const OPEN = new Set(['"', '“', '„']);
const CLOSE = new Set(['"', '”', '“']);
/** What a phrase may hold: letters, digits, spaces and simple punctuation (never a quotation mark, a newline or an emoji). */
const ALLOWED = /^[\p{L}\p{N} .,!?'’:;&()\-]+$/u;

export type Parsed = { ok: true; phrases: string[]; words: number; chars: number } | { ok: false; error: string };

/** The phrases in double quotation marks (straight or curly; autocorrect may mix them), or why they can't be drawn. */
export function parseQuotes(text: string): Parsed {
  const phrases: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (!OPEN.has(c) && c !== '”') {
      i++;
      continue;
    }
    if (!OPEN.has(c)) return { ok: false, error: LETTERING_WORDING.notOpened };
    let j = i + 1;
    while (j < text.length && !CLOSE.has(text[j])) j++;
    if (j >= text.length) return { ok: false, error: LETTERING_WORDING.notClosed };
    const inner = text.slice(i + 1, j).replace(/\s+/g, ' ').trim();
    if (!inner) return { ok: false, error: LETTERING_WORDING.empty };
    if (!ALLOWED.test(inner)) return { ok: false, error: LETTERING_WORDING.characters };
    phrases.push(inner.normalize('NFC'));
    i = j + 1;
  }
  const words = phrases.reduce((n, p) => n + p.split(' ').length, 0);
  const chars = phrases.reduce((n, p) => n + p.length, 0);
  if (phrases.length > LETTERING_CAP.phrases || words > LETTERING_CAP.words || chars > LETTERING_CAP.chars) return { ok: false, error: LETTERING_WORDING.overCap };
  return { ok: true, phrases, words, chars };
}

// ---------------------------------------------------------------------------------------------------------------------
// The book or the person's own.
// ---------------------------------------------------------------------------------------------------------------------
const norm = (s: string) => s.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const wordChar = /[\p{L}\p{N}]/u;
function atWholeWords(text: string, q: string): boolean {
  if (!q) return false;
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) {
    const before = text[i - 1] ?? ' ', after = text[i + q.length] ?? ' ';
    if (!(wordChar.test(q[0]) && wordChar.test(before)) && !(wordChar.test(q[q.length - 1]) && wordChar.test(after))) return true;
  }
  return false;
}

export type BookBlocks = Iterable<readonly [string, { kind: string; content: string }]>;

/** Whether a phrase is in a block as a reader sees it, exactly, at whole words (P8j checks each book phrase so). */
export const phraseInBlock = (phrase: string, block: { kind: string; content: string } | undefined) => Boolean(block) && atWholeWords(quotedText(block!), norm(phrase));

export type LetteringPhrase = { text: string; source: 'book'; block: string; also_in: number } | { text: string; source: 'own'; by_fid: number };

/** The book's (its first block, in book order, and how many more hold it) or the person's own. */
export function phraseSource(text: string, blocks: BookBlocks, fid: number): LetteringPhrase {
  const hits: string[] = [];
  for (const [id, b] of blocks) if (phraseInBlock(text, b)) hits.push(id);
  return hits.length ? { text, source: 'book', block: hits[0], also_in: hits.length - 1 } : { text, source: 'own', by_fid: fid };
}

// ---------------------------------------------------------------------------------------------------------------------
// The prompt's lettering line, in place of the no-text line, for these pictures only.
// ---------------------------------------------------------------------------------------------------------------------
const listed = (ps: string[]) => (ps.length === 1 ? `"${ps[0]}"` : `${ps.slice(0, -1).map((p) => `"${p}"`).join(', ')} and "${ps[ps.length - 1]}"`);
/** Drafted by the coding agent (2026-11-18; the 10-picture test's line, with "well inside the edges" for the pad); reread by the owner 2026-11-22. */
export const letteringLine = (ps: string[]) =>
  `Draw exactly ${ps.length === 1 ? 'these words' : 'these words, each where the change puts it'}, spelled exactly as written, and no other lettering, logos or signs with words: ${listed(ps)}. Put them in the upper half of the picture, well inside the edges.`;

/**
 * The prompt's last line: the no-text line (IMAGES.suffix) without lettering, the lettering line with it. Every prompt
 * that may carry lettering ends with this, so no lettered prompt keeps the no-text line and no plain one loses it.
 */
export const closingLine = (phrases: readonly string[], suffix: string) => (phrases.length ? letteringLine([...phrases]) : suffix);

// ---------------------------------------------------------------------------------------------------------------------
// The guard's lettering policy: config/prompts/image-guard-lettering.md, with the allowed phrases set by the site.
// ---------------------------------------------------------------------------------------------------------------------
export const LETTERING_POLICY_FILE = 'image-guard-lettering.md';
export const ALLOWED_SLOT = '{{ALLOWED_LETTERING}}';
/** The variant with the phrases put in (the site's own list, never the person's other words). */
export function fillPolicy(variant: string, phrases: readonly string[]): string {
  if (!variant.includes(ALLOWED_SLOT)) throw new Error(`${LETTERING_POLICY_FILE}: no ${ALLOWED_SLOT}`);
  if (!phrases.length || phrases.some((p) => !ALLOWED.test(p))) throw new Error('lettering policy: phrases must be parsed first');
  return variant.replace(ALLOWED_SLOT, phrases.map((p) => `"${p}"`).join('; '));
}

// ---------------------------------------------------------------------------------------------------------------------
// The read-back: its readers, its instruction (blind: it never holds the words asked for) and rule v1.
// ---------------------------------------------------------------------------------------------------------------------
export interface Reader {
  id: string;
  name: string;
  maker: 'OpenAI' | 'Google';
  provider: 'openai' | 'vertex';
  /** USD a token, from the gateway's endpoint list (read 2026-11-18). */
  input: number;
  output: number;
  /** The picture's tokens, assumed for the worst case only (OpenAI: 85 + 170 a 512-px tile; Gemini 1,120). */
  imageTokens: number;
  effort: 'low';
}
/** Each picture is read by its own maker (owner, 2026-11-22): GPT-6.1 Sol for GPT Image, Gemini 3.8 Flash on Vertex for Gemini. */
export const READERS: Record<'OpenAI' | 'Google', Reader> = {
  OpenAI: { id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol', maker: 'OpenAI', provider: 'openai', input: 2e-6, output: 10e-6, imageTokens: 1105, effort: 'low' },
  Google: { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', maker: 'Google', provider: 'vertex', input: 0.75e-6, output: 3.75e-6, imageTokens: 1120, effort: 'low' },
};
export const readerFor = (maker: string): Reader | null => (maker === 'OpenAI' || maker === 'Google' ? READERS[maker] : null);
export const READ_MAX_TOKENS = 1500;
/** The reader's one instruction (the coding agent's, the 2026-11-18 test's; kept by the owner 2026-11-22). It never contains the words asked for. */
export const READ_TEXT_INSTRUCTION = [
  'You transcribe writing in pictures. List every piece of visible writing in the picture (a sign, a banner, a label, a caption, a printed or painted word), exactly as drawn: the same letters, capitals, spelling and punctuation, even where it is misspelled, oddly spaced or partly cut off. Never correct, complete or guess at a word you cannot see; transcribe only what is there.',
  'Give one entry per separate piece of writing, in reading order. Join the lines of one piece with a single space. Set cut_off to true for a piece that runs off an edge of the picture. If there is no writing at all, return an empty list.',
].join('\n\n');
export const READ_USER_LINE = 'Transcribe the writing in this picture.';
/** The most one read can cost: the picture, the instruction and every allowed output token. Part of the reservation. */
export const readWorstUsd = (r: Reader) => (r.imageTokens + READ_TEXT_INSTRUCTION.length / 3 + 100) * r.input + READ_MAX_TOKENS * r.output;

const cmpNorm = (s: string) => norm(s).replace(/[‐‑‒–—−]/g, '-');
/**
 * Rule v1 (owner, 2026-11-22): NFC, quote marks and apostrophes, dashes and whitespace normalised, nothing else. Each
 * phrase must be there exactly (letters, case, punctuation), each once per time asked; anything left over is a mismatch.
 */
export function compareRead(phrases: readonly string[], texts: readonly string[]): { match: boolean; missing: string[]; extra: string } {
  let rest = ` ${texts.map(cmpNorm).join(' | ')} `;
  const missing: string[] = [];
  for (const p of phrases) {
    const q = cmpNorm(p);
    const i = rest.indexOf(q);
    if (i < 0) missing.push(p);
    else rest = rest.slice(0, i) + ' | ' + rest.slice(i + q.length);
  }
  const extra = rest.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
  return { match: !missing.length && !extra, missing, extra };
}

// ---------------------------------------------------------------------------------------------------------------------
// The record: in a challenge picture's recipe (params.lettering) and body (body.lettering, drawn_by 'model'), and in a
// chapter picture's recipe (recipe.lettering).
// ---------------------------------------------------------------------------------------------------------------------
export interface Readback {
  reader: string;
  name: string;
  maker: string;
  provider: string;
  /** The picture read: the published file (after the pad), by sha256. */
  sha256: string;
  read: string[];
  verdict: 'match';
  rule: 'v1';
  costUsd: number;
  requestId: string | null;
  at: string;
}
export interface LetteringRecord {
  v: 1;
  phrases: LetteringPhrase[];
  /** The line the prompt ends with, in place of the no-text line. */
  line: string;
  policy: typeof LETTERING_POLICY_FILE;
  /** Padded to 16:9, never cropped (owner, 2026-11-22). */
  fit: 'pad';
  readback: Readback;
}
/** One body.lettering item (src/lib/element-body.ts ModelLetteringItem): no position, since the model placed it. */
export const bodyItems = (r: LetteringRecord) =>
  r.phrases.map((p) => ({ kind: 'sign' as const, text: p.text, drawn_by: 'model' as const, source: p.source === 'book' ? { kind: 'book' as const, block: p.block } : { kind: 'own' as const, by_fid: p.by_fid } }));

/**
 * P8j (owner, 2026-11-22): each picture whose words a model drew has a lettering record; every book phrase is in its
 * block, word for word; every own phrase names its person (by_fid); the read-back read the published file and said
 * "match"; the prompt ends with the lettering line and never carries the no-text line. Empty: it passes.
 */
export interface LetteredPicture {
  /** "challenge 0000…", "chapter c30-b041-… version …". */
  where: string;
  sha256: string;
  prompt: string;
  /** body.lettering items drawn_by 'model' (a challenge picture), or null where the record is the only place (a chapter picture). */
  body: { text: string; drawn_by?: string }[] | null;
  record: LetteringRecord | null | undefined;
}
export function p8jProblems(pictures: readonly LetteredPicture[], blocks: ReadonlyMap<string, { kind: string; content: string }>, suffix: string): string[] {
  const out: string[] = [];
  for (const p of pictures) {
    const r = p.record;
    if (!r || !Array.isArray(r.phrases) || !r.phrases.length) {
      out.push(`${p.where}: words drawn by a model, but no lettering record`);
      continue;
    }
    for (const ph of r.phrases) {
      if (ph.source === 'book') {
        if (!phraseInBlock(ph.text, blocks.get(ph.block))) out.push(`${p.where}: "${ph.text}" is recorded as the book's at ${ph.block}, but that block doesn't hold it word for word`);
      } else if (ph.source === 'own') {
        if (typeof (ph as { by_fid?: unknown }).by_fid !== 'number') out.push(`${p.where}: own words "${ph.text}" without by_fid`);
      } else out.push(`${p.where}: "${(ph as { text: string }).text}" is neither the book's nor own words`);
    }
    if (r.readback?.verdict !== 'match') out.push(`${p.where}: the read-back's verdict is "${r.readback?.verdict ?? 'none'}", not "match"`);
    if (r.readback && r.readback.sha256 !== p.sha256) out.push(`${p.where}: the read-back read another file than the one published`);
    if (r.line !== letteringLine(r.phrases.map((x) => x.text))) out.push(`${p.where}: the recorded lettering line isn't the line for its phrases`);
    if (!p.prompt.includes(r.line)) out.push(`${p.where}: the prompt doesn't carry the lettering line`);
    if (p.prompt.includes(suffix)) out.push(`${p.where}: the prompt still carries the no-text line`);
    if (r.fit !== 'pad') out.push(`${p.where}: not padded (fit "${String(r.fit)}")`);
    if (p.body) {
      const drawn = p.body.filter((b) => b.drawn_by === 'model').map((b) => b.text);
      if (drawn.join('\u0000') !== r.phrases.map((x) => x.text).join('\u0000')) out.push(`${p.where}: body.lettering and the recipe's lettering record name different words`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The words: drafted by the coding agent (2026-11-22); reread by the owner 2026-11-22 (#215: "reread, with these changes"),
// with his one change to warning and warningAdmin ("if the words aren't exactly yours" becomes "if the words aren't
// exactly the ones in quotation marks"); everything else as drafted.
// ---------------------------------------------------------------------------------------------------------------------
const names = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
export const LETTERING_WORDING = {
  notOpened: 'A quotation mark closes words that were never opened.',
  notClosed: 'A quotation mark isn’t closed.',
  empty: 'Empty quotation marks: put the words to draw between them.',
  characters: 'Words in quotation marks can use letters, numbers, spaces and simple punctuation only.',
  overCap: `Up to ${LETTERING_CAP.words} words (${LETTERING_CAP.chars} characters, ${LETTERING_CAP.phrases} phrases) in quotation marks a picture.`,
  /** The preview under the change box. */
  previewHead: 'Words to draw',
  previewNote: 'Only words in double quotation marks are drawn, exactly as typed.',
  book: (block: string) => `the book, ${block}`,
  own: 'your own words',
  ownBy: (by: string) => `${by}’s own words`,
  /** Before Make it, whenever quoted words go to a closed model (owner, 2026-11-22). */
  // "Uses one of today's pictures" (the owner's words) made true for a closed picture, which counts as CLOSED_IMAGES.countsAs.
  warning: `The model can get words wrong. Each picture is read back; if the words aren’t exactly the ones in quotation marks, it isn’t kept, and making it again uses ${CLOSED_IMAGES.countsAs} more of today’s pictures.`,
  warningAdmin: 'The model can get words wrong. Each picture is read back; if the words aren’t exactly the ones in quotation marks, it isn’t kept, and making it again is paid from the admins’ daily limit.',
  /** The open model with quoted words: refused before anything is spent (owner, 2026-11-22). */
  openRefused: (open: string, closed: readonly string[]) =>
    closed.length ? `${open} can’t draw words. To draw the words in quotation marks, choose ${names(closed)}.` : `${open} can’t draw words, and no model that can is offered where you are. Take the quotation marks out to make it without words.`,
  /** The read-back said the words aren't exactly the ones asked for: nothing is kept; try again only (option a). */
  mismatchHead: 'The words came out wrong',
  mismatchAsked: 'You asked for',
  mismatchRead: (reader: string) => `${reader} read`,
  mismatchNothing: 'no writing',
  mismatchKept: `This picture isn’t kept. Try again to make a new one; it uses ${CLOSED_IMAGES.countsAs} more of today’s pictures.`,
  mismatchKeptAdmin: 'This picture isn’t kept. Try again to make a new one; it is paid from the admins’ daily limit.',
  tryAgain: 'Try again',
  /** The read-back gave no answer: the same, try again only. */
  unread: 'The words in the picture couldn’t be read back, so it isn’t kept. Try again in a moment.',
  /** Lettering before its migration is applied. */
  notReady: 'Words in pictures aren’t switched on here yet. Take the quotation marks out to make it without words.',
  /** The record, on the picture's page and the preview. */
  recordHead: 'Words drawn',
  recordRead: (reader: string, maker: string) => `Read back by ${reader} (a closed model by ${maker}): the same words, nothing else.`,
  recordPad: 'Padded to 16:9, not cropped, so no words are cut.',
  /** An admin's lettered edition picture (its words drawn in code): the redo box's line. */
  letteredJob: (words: readonly string[]) => `This picture’s words were drawn in code: ${words.map((w) => `“${w.replace(/\s+/g, ' ')}”`).join(', ')}. To keep words in a redo, put them in quotation marks in your note and choose GPT Image or Gemini.`,
} as const;
