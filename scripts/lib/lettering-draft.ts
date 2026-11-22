/**
 * Decision C's drafts, as the lettering test uses them (branch closed-lettering, 2026-11-18; DRAFT, written by the coding
 * agent, Claude, a closed model by Anthropic; not used by the site): the quote parser and its cap, the book-or-own record,
 * the lettering line, the guard's lettering policy and the comparison rule v1. Pure: tests run it (scripts/test-lettering-draft.ts).
 * Kept as the 2026-11-18 test's record (scripts/lettering-test.ts on closed-lettering). The site's own rules, which the
 * owner's decisions of 2026-11-22 settled, are src/lib/images/lettering.ts and config/prompts/image-guard-lettering.md
 * (branch lettering); scripts/test-lettering.ts checks those.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readerText } from '../../src/lib/challenge/book-quotes';

const ROOT = process.cwd();

// ---------------------------------------------------------------------------------------------------------------------
// Quote parsing (draft of decision C 1): double quotation marks only; at most 3 phrases, 8 words and 48 characters.
// ---------------------------------------------------------------------------------------------------------------------
export const CAP = { phrases: 3, words: 8, chars: 48 } as const;
const OPEN = new Set(['"', '“', '«', '„']);
const CLOSE = new Set(['"', '”', '»', '“']);
const ALLOWED = /^[\p{L}\p{N} .,!?'’:;&()\-]+$/u;
export type Parsed = { ok: true; phrases: string[]; words: number; chars: number } | { ok: false; error: string };
export function parseQuotes(text: string): Parsed {
  const phrases: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (!OPEN.has(c) && c !== '”' && c !== '»') { i++; continue; }
    if (!OPEN.has(c)) return { ok: false, error: 'A quotation mark isn’t opened.' };
    let j = i + 1;
    while (j < text.length && !CLOSE.has(text[j])) j++;
    if (j >= text.length) return { ok: false, error: 'A quotation mark isn’t closed.' };
    const inner = text.slice(i + 1, j).replace(/\s+/g, ' ').trim();
    if (!inner) return { ok: false, error: 'Empty quotation marks.' };
    if (!ALLOWED.test(inner)) return { ok: false, error: 'Words in quotation marks can use letters, numbers, spaces and simple punctuation only.' };
    phrases.push(inner);
    i = j + 1;
  }
  const words = phrases.reduce((n, p) => n + p.split(' ').length, 0);
  const chars = phrases.reduce((n, p) => n + p.length, 0);
  if (phrases.length > CAP.phrases || words > CAP.words || chars > CAP.chars) return { ok: false, error: `Up to ${CAP.words} words in quotation marks per picture.` };
  return { ok: true, phrases, words, chars };
}

// ---------------------------------------------------------------------------------------------------------------------
// The book or the person's own: an exact, case-sensitive match at whole words in a block as a reader sees it.
// ---------------------------------------------------------------------------------------------------------------------
const norm = (s: string) => s.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const wordChar = /[\p{L}\p{N}]/u;
function atWholeWords(text: string, q: string): boolean {
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) {
    const before = text[i - 1] ?? ' ', after = text[i + q.length] ?? ' ';
    if (!(wordChar.test(q[0]) && wordChar.test(before)) && !(wordChar.test(q[q.length - 1]) && wordChar.test(after))) return true;
  }
  return false;
}
let BLOCKS: { id: string; text: string }[] | null = null;
function blocks() {
  if (BLOCKS) return BLOCKS;
  const dir = path.join(ROOT, 'content/snowmoon/text');
  const files = readdirSync(dir).filter((f) => /^chapter-\d+\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  BLOCKS = files.flatMap((f) => {
    const d = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { chapter: number; blocks: { idx: number; content: string }[] };
    return d.blocks.map((b) => ({ id: `c${d.chapter}-b${b.idx}`, text: readerText(b.content) }));
  });
  return BLOCKS;
}
export function phraseSource(p: string): { source: 'book'; block: string; also_in: number } | { source: 'own' } {
  const q = norm(p);
  const hits = blocks().filter((b) => atWholeWords(b.text, q)).map((b) => b.id);
  return hits.length ? { source: 'book', block: hits[0], also_in: hits.length - 1 } : { source: 'own' };
}

// ---------------------------------------------------------------------------------------------------------------------
// The lettering line (draft of decision C 3), in place of IMAGES.suffix for these pictures only.
// ---------------------------------------------------------------------------------------------------------------------
const listed = (ps: string[]) => (ps.length === 1 ? `"${ps[0]}"` : `${ps.slice(0, -1).map((p) => `"${p}"`).join(', ')} and "${ps[ps.length - 1]}"`);
export const letteringLine = (ps: string[]) =>
  `Draw exactly ${ps.length === 1 ? 'these words' : 'these words, each where the change puts it'}, spelled exactly as written, and no other lettering, logos or signs with words: ${listed(ps)}. Put them in the upper half of the picture, well inside the edges.`;

// ---------------------------------------------------------------------------------------------------------------------
// The guard's lettering policy (draft of decision C 2): config/prompts/image-guard.md with the words rule changed, and
// the allowed phrases set by the site in the system message, never by the person's words.
// ---------------------------------------------------------------------------------------------------------------------
const BASE_POLICY = readFileSync(path.join(ROOT, 'config/prompts/image-guard.md'), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');
const WORDS_RULE = '- **words**: asking for words, letters, captions, signs or speech bubbles in the image.';
const WORDS_LETTERING =
  '- **words**: asking for words, letters, captions, signs or speech bubbles in the image, except exactly the phrases listed under "Allowed lettering" below. Those phrases may be drawn; judge each of them by every other category, as if it were shown on a public sign (a slur, a real person\'s name, a brand, logo or slogan from another work, campaign material or a hate symbol in them is not allowed). Any other words, letters or lettering asked for are not allowed.';
const ANSWER = 'Answer with exactly one line of JSON and nothing else:';
export function letteringPolicy(ps: string[]): string {
  if (!BASE_POLICY.includes(WORDS_RULE) || !BASE_POLICY.includes(ANSWER)) throw new Error('image-guard.md changed: the lettering policy must be redrafted');
  const allowed = `Allowed lettering (set by the site from the quoted words, not by the reader): ${ps.map((p) => `"${p}"`).join('; ')}.\n\n`;
  return BASE_POLICY.replace(WORDS_RULE, WORDS_LETTERING).replace(ANSWER, allowed + ANSWER);
}
// ---------------------------------------------------------------------------------------------------------------------
// The comparison (rule v1): quote marks, apostrophes, dashes and whitespace normalised; nothing else. Each phrase must be
// there exactly (case, spelling, punctuation), and nothing else may be written. Also a case-insensitive tally.
// ---------------------------------------------------------------------------------------------------------------------
const cmpNorm = (s: string) => norm(s).replace(/[‐‑‒–—−]/g, '-');
export function compare(phrases: string[], texts: string[], caseless = false): { match: boolean; missing: string[]; extra: string } {
  const f = (s: string) => (caseless ? cmpNorm(s).toLowerCase() : cmpNorm(s));
  let rest = ` ${texts.map(f).join(' | ')} `;
  const missing: string[] = [];
  for (const p of phrases) {
    const q = f(p);
    const i = rest.indexOf(q);
    if (i < 0) missing.push(p);
    else rest = rest.slice(0, i) + ' | ' + rest.slice(i + q.length);
  }
  const extra = rest.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
  // Anything left over, a letter, a digit or a punctuation mark, is lettering that wasn't asked for.
  return { match: !missing.length && !extra, missing, extra };
}

