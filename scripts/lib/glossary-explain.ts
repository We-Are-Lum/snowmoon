/**
 * Written explanations for the glossary (owner, 2026-10-23: "Add a written explanation per entry, made from the
 * whole book"). Kept apart from the glossary itself: content/snowmoon/glossary.json stays the book's quotes only,
 * built with no model (scripts/build-glossary.ts); the explanations are model-written, in their own file
 * (content/snowmoon/glossary-explanations.json), with an `assist` record, and the glossary page merges them.
 *
 * This file holds what the generator, the support check, the bake-off and the tests share, all deterministic:
 *
 *   BOOK. The whole book as the models read it: every block with its id, "[c3-b42] …". Paragraphs, quotes and
 *   datelines are the block exactly as verifyGlossary quotes it (speaker-colour span tags removed), with any other
 *   tag and every line break turned into a space. Screens and figures are their words only (tags removed; a figure
 *   with no words says so). Headings and breaks are left out (a heading is "# Chapter n", which the chapter line
 *   already says).
 *
 *   RULES for a written explanation, checked by verifyExplanations:
 *   - every sentence cites at least one block, and every cited block exists;
 *   - every quote is word for word in its block (verifyGlossary's check: the block with speaker-colour span tags
 *     removed contains it), allowing only what the reader can't see: Markdown marks (*, \), tags and runs of
 *     white space; the quote's block must be one the sentence cites;
 *   - each sentence carries `gate`, the chapter of its latest citation, and is shown only once the reader has
 *     reached that chapter (src/lib/glossary-written.ts filters on it);
 *   - sentences carry no block ids, brackets or chapter numbers in their text (the citations carry those).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadBlocks, quoteSource, type Glossary } from './glossary';

/**
 * Where the explanations go once the owner has read them and says to publish (committed; the glossary page reads it).
 * Until then every output stays in private/, which git ignores (owner, 2026-10-23: "keep outputs out of the public
 * repo until I've read them"): never committed, never in a deployment built from GitHub.
 */
export const EXPLANATIONS_FILE = 'content/snowmoon/glossary-explanations.json';
export const EXPLANATIONS_DRAFT = 'private/glossary-explanations/glossary-explanations.json';
export const PROMPT_FILE = 'config/prompts/glossary-explain.md';
export const CHECK_PROMPT_FILE = 'config/prompts/glossary-support-check.md';
/** The blind bake-off's page data: labels A/B/C only, never a model's name. */
export const BAKEOFF_FILE = 'private/glossary-bakeoff/explanations.json';
export const BAKEOFF_SUPPORT_FILE = 'private/glossary-bakeoff/support.json';
/** The blind page as one self-contained file, to open without the site (scripts/glossary-bakeoff-page.ts). */
export const BAKEOFF_PAGE_FILE = 'private/glossary-bakeoff/page.html';
/**
 * The key (which label is which model, with each run's usage, request ids and raw answers): a separate file,
 * which neither the site nor the blind page reads.
 */
export const BAKEOFF_KEY_FILE = 'private/glossary-bakeoff/key.json';
export const CHAPTERS = 32;

/** The bake-off's five entries (owner, 2026-10-23: four named, and one minor term the agent picks: Lightfoot). */
export const BAKEOFF_SLUGS = ['order-of-steering', 'minpentai', 'veridia', 'acolyte', 'lightfoot'] as const;

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const chapterOf = (id: string) => Number(id.match(/^c(\d+)-b\d+$/)?.[1] ?? NaN);

export interface Quote {
  block: string;
  text: string;
}
export interface Sentence {
  text: string;
  /** Block ids the sentence rests on, c<chapter>-b<idx>. */
  cites: string[];
  /** Words of the book the sentence quotes, each word for word in a cited block. */
  quotes: Quote[];
  /** The chapter of the latest citation: the sentence shows once the reader has reached it. */
  gate: number;
}
export interface Entry {
  slug: string;
  term: string;
  sentences: Sentence[];
}
export interface Assist {
  /** The gateway's model id. */
  model: string;
  maker: string;
  open_weights: boolean;
  /** What the gateway reported serving (its model string and provider), from the first call. */
  version: string;
  provider: string;
  prompt_file: string;
  prompt_sha256: string;
  book_sha256: string;
  glossary_sha256: string;
  /** UTC date of the run, YYYY-MM-DD. */
  date: string;
  settings: Record<string, unknown>;
  drafted: string;
}
export interface ExplanationsFile {
  about: string;
  assist: Assist;
  entries: Entry[];
}

const BLOCKS_CACHE = new Map<string, Map<string, { kind: string; content: string }>>();
export function blocksOf(root: string) {
  if (!BLOCKS_CACHE.has(root)) BLOCKS_CACHE.set(root, loadBlocks(root));
  return BLOCKS_CACHE.get(root)!;
}

/** A block's text as the models read it (see BOOK above). */
export function seenText(b: { kind: string; content: string }): string {
  if (b.kind === 'screen' || b.kind === 'figure') {
    const words = b.content
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return words || '(a drawing with no words)';
  }
  return quoteSource(b.content).replace(/<[^>]+>/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

/** The whole book, serialised with block ids, and its hash. Deterministic. */
export function serializeBook(root: string): { text: string; sha256: string; blocks: number } {
  const lines: string[] = ['# Snowmoon, by Vitalik Buterin (GPL-3.0)', '', 'Each block starts with its id in square brackets: [c<chapter>-b<block>]. Screens and figures (drawn in the book) give their words only.', ''];
  let n = 0;
  for (let ch = 1; ch <= CHAPTERS; ch++) {
    const c = JSON.parse(readFileSync(path.join(root, `content/snowmoon/text/chapter-${ch}.json`), 'utf8')) as { blocks: { idx: number; kind: string; content: string }[] };
    lines.push(`## Chapter ${ch}`, '');
    for (const b of c.blocks) {
      if (b.kind === 'heading' || b.kind === 'break') continue;
      const tag = b.kind === 'paragraph' ? '' : ` ${b.kind}`;
      lines.push(`[c${ch}-b${b.idx}${tag}] ${seenText(b)}`);
      n++;
    }
    lines.push('');
  }
  const text = lines.join('\n');
  return { text, sha256: sha256(text), blocks: n };
}

/** Rough token count: characters / 4 (no tokenizer is installed; each model's own count differs by maker). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/** What "word for word" ignores: Markdown marks, tags and white space the reader never sees as words. */
function wordsOnly(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\(.)/g, '$1')
    .replace(/\*/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
/** verifyGlossary's check (the block, speaker-colour span tags removed, contains the quote), marks aside. */
export function quoteInBlock(b: { kind: string; content: string }, quote: string): boolean {
  if (!quote.trim()) return false;
  if (quoteSource(b.content).includes(quote)) return true;
  const q = wordsOnly(quote);
  return q.length > 0 && (wordsOnly(quoteSource(b.content)).includes(q) || wordsOnly(seenText(b)).includes(q));
}

export const gateOf = (cites: string[]) => Math.max(...cites.map(chapterOf));

/** Problems with a set of written explanations against the book and the glossary. Empty when it passes. */
export function verifyExplanations(entries: Entry[], blocks: Map<string, { kind: string; content: string }>, glossary?: Glossary): string[] {
  const problems: string[] = [];
  const slugs = glossary ? new Set(glossary.terms.map((t) => t.slug)) : null;
  for (const e of entries) {
    const at = e.slug;
    if (slugs && !slugs.has(e.slug)) problems.push(`${at}: not a glossary slug`);
    if (!e.sentences.length) problems.push(`${at}: no sentences`);
    e.sentences.forEach((s, i) => {
      const where = `${at} sentence ${i + 1}`;
      if (!s.text?.trim()) problems.push(`${where}: empty`);
      if (/\bc\d+-b\d+\b|\[|\]/.test(s.text)) problems.push(`${where}: a block id or bracket in the text`);
      if (!s.cites?.length) problems.push(`${where}: cites nothing`);
      for (const c of s.cites ?? []) if (!blocks.has(c)) problems.push(`${where}: cites ${c}, which is not a block of the book`);
      const valid = (s.cites ?? []).filter((c) => blocks.has(c));
      if (valid.length && s.gate !== gateOf(valid)) problems.push(`${where}: gate ${s.gate} is not the chapter of its latest citation (${gateOf(valid)})`);
      for (const q of s.quotes ?? []) {
        const b = blocks.get(q.block);
        if (!(s.cites ?? []).includes(q.block)) problems.push(`${where}: quotes ${q.block}, which it does not cite`);
        if (!b) problems.push(`${where}: quotes ${q.block}, which is not a block of the book`);
        else if (!quoteInBlock(b, q.text)) problems.push(`${where}: "${q.text.slice(0, 50)}" is not word for word in ${q.block}`);
      }
      // Quotation marks in the sentence must be words of the book: each quoted run is one of its quotes.
      for (const m of s.text.matchAll(/[“"]([^“”"]{3,})[”"]/g)) {
        if (!(s.quotes ?? []).some((q) => wordsOnly(q.text).includes(wordsOnly(m[1])))) problems.push(`${where}: "${m[1].slice(0, 40)}" is in quotation marks but is not one of its quotes`);
      }
    });
  }
  return problems;
}

/** The sentences a reader at `through` sees, in order, and how many wait for a later chapter. */
export function shownThrough(e: Entry, through: number): { shown: Sentence[]; hidden: number } {
  const shown = e.sentences.filter((s) => s.gate <= through);
  return { shown, hidden: e.sentences.length - shown.length };
}

/**
 * Parse a model's answer into sentences: the JSON object it was asked for ({"sentences":[{text,cites,quotes}]}),
 * possibly inside a code fence. Gates are computed here, never taken from the model.
 */
export function parseAnswer(raw: string): Omit<Entry, 'slug' | 'term'> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON object in the answer');
  const j = JSON.parse(raw.slice(start, end + 1)) as { sentences?: { text?: unknown; cites?: unknown; quotes?: unknown }[] };
  if (!Array.isArray(j.sentences)) throw new Error('no "sentences" list in the answer');
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim().replace(/^\[|\]$/g, '')) : []);
  return {
    sentences: j.sentences.map((s) => {
      const cites = [...new Set(ids(s.cites))];
      const quotes = (Array.isArray(s.quotes) ? s.quotes : []).map((q) => ({ block: String((q as Quote).block ?? '').trim().replace(/^\[|\]$/g, ''), text: String((q as Quote).text ?? '') }));
      const valid = cites.filter((c) => Number.isFinite(chapterOf(c)));
      return { text: String(s.text ?? '').trim(), cites, quotes, gate: valid.length ? gateOf(valid) : CHAPTERS };
    }),
  };
}

/** The per-entry request: the glossary's own facts about the word (deterministic, from glossary.json). */
export function entryRequest(t: Glossary['terms'][number]): string {
  const mentions = Object.entries(t.mentions)
    .map(([ch, list]) => list.map((i) => `c${ch}-b${i}`).join(' '))
    .join(' ');
  return [
    `ENTRY: ${t.term}`,
    t.aliases.length ? `Also written: ${t.aliases.join(', ')}` : '',
    `Kind (the glossary's label, unreviewed): ${t.kind}`,
    `First appears: ${t.first}`,
    `Every block that mentions it (${t.mention_count}): ${mentions}`,
    '',
    'Write the explanation for this entry now, as the JSON object described above.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

// ---- Models and prices ----

export interface ModelChoice {
  /** The gateway's id. */
  id: string;
  maker: string;
  open_weights: boolean;
  /** The one provider allowed to serve it (providerOptions.gateway.only), so caching and price are known. */
  provider: string;
  /** The reasoning effort sent (the same word for all three where the model allows it). */
  effort: string;
  /** How the book is cached: Anthropic needs a marker; the others cache a repeated prefix by themselves. */
  caching: 'explicit' | 'implicit';
}

/** The bake-off's three models (owner, 2026-10-23), as found on the gateway's model list on 2026-10-23. */
export const BAKEOFF_MODELS: ModelChoice[] = [
  { id: 'anthropic/claude-opus-5.5', maker: 'Anthropic', open_weights: false, provider: 'anthropic', effort: 'low', caching: 'explicit' },
  // Hosted by Parasail, which the gateway lists with zero data retention and no training (owner, 2026-10-23: "use
  // the host that keeps nothing"); DeepSeek's own endpoint shows neither. No peak-hour pricing at Parasail.
  { id: 'deepseek/deepseek-v4-pro-0813', maker: 'DeepSeek', open_weights: true, provider: 'parasail', effort: 'low', caching: 'implicit' },
  { id: 'moonshotai/kimi-k3.1-pro', maker: 'Moonshot AI', open_weights: true, provider: 'moonshotai', effort: 'low', caching: 'implicit' },
];
/** The support check's model: not one of the three, and from a fourth maker. */
export const CHECK_MODEL: ModelChoice = { id: 'openai/gpt-5.6-sol', maker: 'OpenAI', open_weights: false, provider: 'openai', effort: 'low', caching: 'implicit' };

export const GATEWAY = 'https://ai-gateway.vercel.sh/v1';

export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  /** Writing the cache: Anthropic 1.25x input (5-minute entry); the others charge plain input for the first read. */
  cacheWrite: number;
  context: number;
  maxOutput: number;
}

/** A model's price at one provider, from the gateway's free endpoint list (no key needed). US dollars per token. */
export async function priceOf(m: ModelChoice): Promise<Price> {
  const r = await fetch(`${GATEWAY}/models/${m.id}/endpoints`);
  if (!r.ok) throw new Error(`${m.id}: endpoints ${r.status}`);
  const j = (await r.json()) as { data?: { endpoints?: { provider_name: string; context_length: number; max_completion_tokens: number; pricing: Record<string, string> }[] } };
  const e = j.data?.endpoints?.find((x) => x.provider_name === m.provider);
  if (!e) throw new Error(`${m.id}: no endpoint at ${m.provider}`);
  const n = (k: string) => Number(e.pricing[k] ?? NaN);
  const input = n('prompt');
  return {
    input,
    output: n('completion'),
    cacheRead: Number.isFinite(n('input_cache_read')) ? n('input_cache_read') : input,
    cacheWrite: Number.isFinite(n('input_cache_write')) ? n('input_cache_write') : input,
    context: e.context_length,
    maxOutput: e.max_completion_tokens,
  };
}

/**
 * Cost of `calls` calls that share one cached prefix of `prefix` tokens, each adding `fresh` input tokens and
 * `out` output tokens (reasoning included): the first call writes the cache, the rest read it.
 */
export function runCost(p: Price, calls: number, prefix: number, fresh: number, out: number): { usd: number; first: number; perLater: number } {
  const first = prefix * p.cacheWrite + fresh * p.input + out * p.output;
  const perLater = prefix * p.cacheRead + fresh * p.input + out * p.output;
  return { usd: first + Math.max(0, calls - 1) * perLater, first, perLater };
}
