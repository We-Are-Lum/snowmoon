/**
 * The glossary's definition drafts (DRAFT; Nate, 2026-11-24: "For every glossary entry, a 1–3 sentence summary of what
 * the book says about it, grounded in the book with block citations, quoting only word for word"), checked:
 * - every glossary term has one draft (docs/glossary-definitions/drafts/<slug>.json), and no draft is for a term that
 *   isn't in the glossary;
 * - each draft is marked a draft, not approved, and "drafted with AI help (Claude, by Anthropic)";
 * - it is 1 to 3 sentences, and every sentence cites at least one block of the book;
 * - every cited block exists, and every quote is word for word in its block (src/lib/challenge/book-quotes.ts, the
 *   rule the challenge's quotes are held to), at whole words;
 * - a planted misquote and a planted missing block are caught, so the check can fail.
 * Pure: reads the repository only; no model, no network.
 *   npx tsx scripts/test-glossary-definitions.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadBlocks } from './lib/glossary';
import { quoteProblems, type Cited } from '../src/lib/challenge/book-quotes';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/glossary-definitions/drafts');
export const AI_HELP = 'drafted with AI help (Claude, by Anthropic)';

export type Segment = { text: string } | { quote: string; cite: string } | { cite: string };
export interface Draft {
  slug: string;
  term: string;
  status: 'draft';
  approved: false;
  aiHelp: string;
  /** 1 to 3 sentences, each a list of segments; every sentence cites at least one block. */
  sentences: Segment[][];
}

const CITE = /^c(\d+)-b(\d+)$/;

/** What is wrong with one draft (blocks: the book's, by id). */
export function draftProblems(d: Draft, blocks: ReturnType<typeof loadBlocks>): string[] {
  const p: string[] = [];
  const w = d.slug;
  if (d.status !== 'draft' || d.approved !== false) p.push(`${w}: not marked draft and not approved`);
  if (d.aiHelp !== AI_HELP) p.push(`${w}: aiHelp is not "${AI_HELP}"`);
  if (!Array.isArray(d.sentences) || d.sentences.length < 1 || d.sentences.length > 3) return [...p, `${w}: ${Array.isArray(d.sentences) ? d.sentences.length : 'no'} sentences (1 to 3)`];
  const quotes: Cited[] = [];
  let words = 0;
  for (const [n, sentence] of d.sentences.entries()) {
    if (!Array.isArray(sentence) || !sentence.length) {
      p.push(`${w}: sentence ${n + 1} is empty`);
      continue;
    }
    if (!sentence.some((s) => 'cite' in s)) p.push(`${w}: sentence ${n + 1} cites no block`);
    for (const s of sentence) {
      if ('cite' in s) {
        if (!CITE.test(s.cite)) p.push(`${w}: "${s.cite}" is not a block id (c<chapter>-b<block>)`);
        else if (!blocks.has(s.cite)) p.push(`${w}: ${s.cite} is not a block of the book`);
        if ('quote' in s) {
          quotes.push({ where: w, block: s.cite, text: s.quote });
          words += s.quote.split(/\s+/).length;
        }
      } else if ('text' in s && typeof s.text === 'string') words += s.text.split(/\s+/).filter(Boolean).length;
      else p.push(`${w}: sentence ${n + 1} has a segment that is neither text, a quote nor a citation`);
    }
  }
  if (words > 110) p.push(`${w}: ${words} words (keep it to 1 to 3 short sentences)`);
  p.push(...quoteProblems(quotes, blocks));
  return p;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const g = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/glossary.json'), 'utf8')) as { terms: { slug: string; term: string }[] };
  const blocks = loadBlocks(ROOT);
  // --only=a,b: check just these drafts (for whoever is drafting them); the full run checks every term.
  const only = process.argv.find((x) => x.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && (!only || only.includes(f.slice(0, -5))));
  const drafts = files.map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as Draft);
  const problems: string[] = [];
  const slugs = new Set(g.terms.map((t) => t.slug));
  for (const t of g.terms) if ((!only || only.includes(t.slug)) && !drafts.some((d) => d.slug === t.slug)) problems.push(`${t.slug}: no draft`);
  for (const [i, d] of drafts.entries()) {
    if (`${d.slug}.json` !== files[i]) problems.push(`${files[i]}: holds the draft for ${d.slug}`);
    if (!slugs.has(d.slug)) problems.push(`${d.slug}: not a glossary term`);
    else if (g.terms.find((t) => t.slug === d.slug)!.term !== d.term) problems.push(`${d.slug}: term is not the glossary's`);
    problems.push(...draftProblems(d, blocks));
  }
  // Planted faults must be caught.
  const any = drafts[0];
  const planted = [
    { name: 'a misquote', d: { ...any, sentences: [[{ text: 'It is ' }, { quote: 'words the book never wrote, zzqx', cite: 'c1-b1' }, { text: '.' }]] } },
    { name: 'a block that is not in the book', d: { ...any, sentences: [[{ text: 'It is a thing.' }, { cite: 'c1-b99999' }]] } },
    { name: 'an uncited sentence', d: { ...any, sentences: [[{ text: 'It is a thing.' }, { cite: 'c1-b1' }], [{ text: 'It is another thing.' }]] } },
    { name: 'four sentences', d: { ...any, sentences: [1, 2, 3, 4].map((n) => [{ text: `Sentence ${n}.` }, { cite: 'c1-b1' }]) } },
    { name: 'marked approved', d: { ...any, approved: true as unknown as false } },
  ];
  const missed = any ? planted.filter((x) => draftProblems(x.d as Draft, blocks).length === 0).map((x) => x.name) : ['no drafts to plant into'];
  for (const m of missed) problems.push(`planted fault not caught: ${m}`);
  const quotes = drafts.reduce((n, d) => n + d.sentences.flat().filter((s) => 'quote' in s).length, 0);
  if (problems.length) {
    console.log(problems.map((x) => `FAIL ${x}`).join('\n'));
    console.log(`\n${problems.length} problem(s); ${drafts.length} drafts of ${g.terms.length} terms`);
    process.exit(1);
  }
  console.log(`glossary definitions: ${drafts.length} drafts for ${g.terms.length} terms, ${quotes} quotes word for word, every sentence cited; ${planted.length} planted faults caught`);
}
