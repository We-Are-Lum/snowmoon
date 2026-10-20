/**
 * docs/minpentai/passages.md: every passage of the book about Minpentai, word for word, with its block
 * id, in chapter order; chapters 15 on under a spoiler heading. Served at /minpentai/passages.md and
 * linked from docs/minpentai/agents.md.
 *
 * A block is a passage if it names Minpentai, is cited in docs/minpentai-rules.md (the reading of the
 * book's rules), or is cited by Learn's words (src/lib/minpentai/learn-text.ts); a cited range counts
 * every block in it. The selection and each passage's lines are the same as the minpentai-kit branch's
 * (src/lib/minpentai/kit.ts, scripts/build-minpentai-kit.ts at 4770500), which is not merged; the kit
 * also orders them by its rules table, which main does not have.
 *
 *   npx tsx scripts/build-minpentai-passages.ts           write the file
 *   npx tsx scripts/build-minpentai-passages.ts --check   fail if it is stale, a cited block is missing,
 *                                                         or the count is not 152 (test:minpentai-agents runs this)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LEARN_TEXT } from '../src/lib/minpentai/learn-text';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
export const OUT = 'docs/minpentai/passages.md';
export const PASSAGE_COUNT = 152;
/** Spoilers start here: the matches the rules come from are chapters 2–14. */
export const SPOILERS_FROM = 15;

export interface BookBlock { idx: number; kind: string; content: string }
type Reason = 'names' | 'rules-doc' | 'learn';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const unescape = (s: string) => s.replace(/&([a-z]+|#\d+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : m));

/** A block's words, paragraph by paragraph, markup removed, words unchanged (`*word*` is the book's emphasis). */
export function blockParagraphs(b: BookBlock): string[] {
  if (b.kind === 'figure') return [];
  const parts = b.kind === 'screen' ? [...b.content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]) : [b.content];
  return parts.map((p) => unescape(p.replace(/<[^>]+>/g, '')).replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const figureWords = (b: BookBlock): string[] =>
  b.kind === 'figure' ? [...b.content.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => unescape(m[1].replace(/<[^>]+>/g, '')).trim()).filter(Boolean) : [];

/** Block ids in a text: "c4-b9", and ranges "c4-b97–c4-b98" or "c4-b136–b138", each block of a range counted. */
export function citedIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/c(\d+)-b(\d+)(?:\s*[–-]\s*(?:c\d+-)?b(\d+))?/g)) {
    const a = Number(m[2]), z = m[3] ? Number(m[3]) : a;
    for (let i = a; i <= Math.max(a, z); i++) out.push(`c${m[1]}-b${i}`);
  }
  return out;
}
const parseId = (id: string) => { const m = /^c(\d+)-b(\d+)$/.exec(id)!; return { chapter: Number(m[1]), idx: Number(m[2]) }; };

export function loadBook(): Record<number, BookBlock[]> {
  const book: Record<number, BookBlock[]> = {};
  for (let n = 1; n <= 32; n++) book[n] = JSON.parse(read(`content/snowmoon/text/chapter-${n}.json`)).blocks;
  return book;
}

export function findPassages(book: Record<number, BookBlock[]>) {
  const reasons = new Map<string, Set<Reason>>();
  const add = (id: string, r: Reason) => { if (!reasons.has(id)) reasons.set(id, new Set()); reasons.get(id)!.add(r); };
  for (const [ch, blocks] of Object.entries(book)) for (const b of blocks) if (/minpentai/i.test(b.content)) add(`c${ch}-b${b.idx}`, 'names');
  for (const id of citedIds(read('docs/minpentai-rules.md'))) add(id, 'rules-doc');
  for (const id of citedIds(JSON.stringify(LEARN_TEXT))) add(id, 'learn');
  const ORDER: Reason[] = ['names', 'rules-doc', 'learn'];
  const key = (id: string) => { const p = parseId(id); return p.chapter * 100000 + p.idx; };
  return [...reasons.keys()].sort((a, b) => key(a) - key(b)).map((id) => {
    const { chapter, idx } = parseId(id);
    const block = book[chapter]?.find((x) => x.idx === idx);
    return { id, chapter, block, reasons: ORDER.filter((r) => reasons.get(id)!.has(r)) };
  });
}

const REASON_WORDS = { names: 'names Minpentai', 'rules-doc': 'cited in docs/minpentai-rules.md', learn: 'cited in Learn' } as const;

export function passagesMd(book: Record<number, BookBlock[]>): { text: string; problems: string[] } {
  const passages = findPassages(book);
  const problems = passages.filter((p) => !p.block).map((p) => `${p.id} is cited but is not in the book`);
  if (passages.length !== PASSAGE_COUNT) problems.push(`${passages.length} passages, not ${PASSAGE_COUNT}`);
  const one = (p: (typeof passages)[number]) => {
    const b = p.block!;
    const head = `**${p.id}** (${p.reasons.map((r) => REASON_WORDS[r]).join(', ')}${b.kind === 'figure' ? '; figure' : b.kind === 'screen' ? '; screen' : ''})`;
    const words = figureWords(b);
    const body = b.kind === 'figure' ? [words.length ? `(figure; its only words: ${words.join(' ')})` : '(figure, no words)'] : blockParagraphs(b);
    return [head, ...body.map((t) => `> ${t}`), ''].join('\n');
  };
  const out: string[] = [
    '# Minpentai in the book: the passages, word for word',
    '',
    "> Written by `scripts/build-minpentai-passages.ts`; do not edit by hand. The words are the book's, as committed in `content/snowmoon/text`, with markup removed (`*word*` is the book's emphasis). The headings and notes are the coding agent's (DRAFT).",
    '',
    `**${passages.length} passages.** A block is listed if it names Minpentai, is cited in \`docs/minpentai-rules.md\`, or is cited by Learn's words (\`src/lib/minpentai/learn-text.ts\`); a cited range counts each of its blocks. A block id such as c4-b84 is chapter 4, block 84; on the site it is /chapter/4#c4-b84.`,
    '',
    `**Spoilers.** Everything here is from the book. Every block the rules are read from is in chapters 2–14 (\`docs/minpentai-rules.md\` and the rules page cite nothing later). Chapters ${SPOILERS_FROM} to the end are under their own spoiler heading below.`,
    '',
  ];
  let ch = 0, spoiled = false;
  for (const p of passages.filter((x) => x.block)) {
    if (!spoiled && p.chapter >= SPOILERS_FROM) {
      spoiled = true;
      const later = passages.filter((x) => x.chapter >= SPOILERS_FROM);
      out.push(`## Spoilers: chapters ${SPOILERS_FROM}–${Math.max(...later.map((x) => x.chapter))} (${later.length} passages)`, '', `Stop here if you have not read past chapter ${SPOILERS_FROM - 1}.`, '');
    }
    if (p.chapter !== ch) { ch = p.chapter; out.push(`### Chapter ${ch}`, ''); }
    out.push(one(p));
  }
  return { text: out.join('\n'), problems };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-minpentai-passages.ts')) {
  const { text, problems } = passagesMd(loadBook());
  if (problems.length) { console.error(`minpentai passages: ${problems.join('; ')}`); process.exit(1); }
  const full = path.join(ROOT, OUT);
  if (process.argv.includes('--check')) {
    if (!existsSync(full) || readFileSync(full, 'utf8') !== text) { console.error(`${OUT} is stale: run npx tsx scripts/build-minpentai-passages.ts`); process.exit(1); }
    console.log(`${OUT}: ${PASSAGE_COUNT} passages, up to date`);
  } else {
    writeFileSync(full, text);
    console.log(`wrote ${OUT} (${PASSAGE_COUNT} passages)`);
  }
}
