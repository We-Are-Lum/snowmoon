/**
 * The full run with Claude Opus 5.5 through the Anthropic Message Batches API, direct, at half price, paid from the
 * owner's subscription API credits (outside the $25), only once the owner has picked Opus and approved the estimate
 * (owner, 2026-10-24). The same prompt (config/prompts/glossary-explain.md) and book as the bake-off.
 *
 *   npx tsx scripts/glossary-anthropic-batch.ts estimate [--per-request 10]
 *       No key, no call: the cost range.
 *   npx tsx --env-file-if-exists=.env.local --env-file-if-exists=/Users/nathan/snowmoon/.env.anthropic.local \
 *       scripts/glossary-anthropic-batch.ts run --cap <usd> [--per-request 10]
 *       One step per call, resumable (state in private/glossary-explanations/anthropic-batch.json):
 *       1. warm: a batch of one request (the first group), which writes the book to the 1-hour cache;
 *       2. once it has ended: a batch of the rest, which can read that cache while it lasts;
 *       3. once that has ended: the results, written to private/glossary-explanations/raw.json with `assist`.
 *       Before each submit, the batch's worst case (no request reads the cache) must fit within --cap.
 *
 * Key: SNOWMOON_ANTHROPIC_KEY only (scripts/lib/anthropic-batch.ts). Never ANTHROPIC_API_KEY; never printed.
 *
 * Entries per request (--per-request, default 10): a cache miss inside a batch re-writes the whole book, so fewer,
 * larger requests bound the worst case. Each request asks for its entries as {"entries":[{"slug","sentences"}]}; the
 * system prompt and book are unchanged, so the bake-off's prompt still applies. Quality: one entry per call was what
 * the bake-off measured; ten per call is untested and is the first thing to look at in the results.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Glossary } from './lib/glossary';
import { CHAPTERS, EXPLANATIONS_RAW, PROMPT_FILE, blocksOf, chapterOf, entryRequest, gateOf, serializeBook, sha256, verifyExplanations, type Entry, type ExplanationsFile } from './lib/glossary-explain';
import { OPUS, OPUS_BATCH, anthropicKey, batchCost, batchResults, batchStatus, opusParams, submitBatch, textOf, type BatchRef } from './lib/anthropic-batch';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const mode = args[0] ?? 'estimate';
const PER = Math.max(1, Number(flag('per-request') ?? 10));
const CAP = Number(flag('cap') ?? NaN);
const STATE = 'private/glossary-explanations/anthropic-batch.json';
const RAW = EXPLANATIONS_RAW;

const glossaryRaw = read('content/snowmoon/glossary.json');
const glossary = JSON.parse(glossaryRaw) as Glossary;
const prompt = read(PROMPT_FILE).replace(/^<!--[\s\S]*?-->\s*/, '');
const book = serializeBook(ROOT);

/** Measured in the bake-off (2026-10-24, Opus 5.5 at effort low): the book and prompt are ~227,000 Claude tokens. */
const PREFIX = 227_100;
const FRESH_PER_ENTRY = 450;
const OUT_PER_ENTRY = 1_000; // the bake-off's answers ran 430-775 output tokens with thinking; margin for longer ones
const MAX_TOKENS_PER_ENTRY = 4_000;

const groups: string[][] = [];
const slugs = flag('only')?.split(',') ?? glossary.terms.map((t) => t.slug);
for (let i = 0; i < slugs.length; i += PER) groups.push(slugs.slice(i, i + PER));

function requestFor(group: string[]): string {
  const term = (slug: string) => glossary.terms.find((t) => t.slug === slug)!;
  if (group.length === 1) return entryRequest(term(group[0]));
  const parts = group.map((slug) => `slug: ${slug}\n${entryRequest(term(slug)).replace(/\n\nWrite the explanation for this entry now.*$/s, '')}`);
  return `There are ${group.length} entries below. Write each one as described above, on its own.\n\n${parts.join('\n\n')}\n\nAnswer with one JSON object and nothing else: {"entries": [{"slug": "…", "sentences": [ … as described above … ]}]}, one item per entry, in the order given.`;
}
const custom = (i: number) => `g${String(i).padStart(3, '0')}`;
const usd = (n: number) => `$${n.toFixed(2)}`;

function estimate() {
  const n = groups.length;
  const fresh = FRESH_PER_ENTRY * Math.min(PER, slugs.length);
  const out = OUT_PER_ENTRY * Math.min(PER, slugs.length);
  const p = OPUS_BATCH;
  const warm = PREFIX * p.cacheWrite1h + fresh * p.input + out * p.output;
  const hit = PREFIX * p.cacheRead + fresh * p.input + out * p.output;
  const miss = PREFIX * p.cacheWrite1h + fresh * p.input + out * p.output;
  console.log(`Opus 5.5 via the Anthropic Batch API: ${slugs.length} entries, ${PER} per request, ${n} requests; book ~${PREFIX.toLocaleString()} tokens (measured)`);
  console.log(`Batch prices per million: input $${(p.input * 1e6).toFixed(2)}, output $${(p.output * 1e6).toFixed(2)}, cache read $${(p.cacheRead * 1e6).toFixed(2)}, 1-hour cache write $${(p.cacheWrite1h * 1e6).toFixed(2)}`);
  console.log(`  warm batch (1 request): ${usd(warm)}`);
  console.log(`  the rest (${n - 1} requests): ${usd((n - 1) * hit)} if all read the warm cache, ${usd((n - 1) * miss)} if none does`);
  console.log(`  whole run: ${usd(warm + (n - 1) * hit)} to ${usd(warm + (n - 1) * miss)}`);
  return { best: warm + (n - 1) * hit, worst: warm + (n - 1) * miss };
}

type State = { per: number; groups: string[][]; warm?: BatchRef; rest?: BatchRef; spent_usd: number };
const loadState = (): State | null => (existsSync(path.join(ROOT, STATE)) ? JSON.parse(read(STATE)) : null);
const saveState = (s: State) => {
  mkdirSync(path.dirname(path.join(ROOT, STATE)), { recursive: true });
  writeFileSync(path.join(ROOT, STATE), JSON.stringify(s, null, 1) + '\n');
};

function parseGroup(raw: string, group: string[]): Entry[] {
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { sentences?: unknown[]; entries?: { slug: string; sentences: unknown[] }[] };
  const items = group.length === 1 && j.sentences ? [{ slug: group[0], sentences: j.sentences }] : (j.entries ?? []);
  return group.map((slug) => {
    const t = glossary.terms.find((x) => x.slug === slug)!;
    const it = items.find((x) => x.slug === slug);
    const sentences = (it?.sentences ?? []).map((s) => {
      const o = s as { text?: unknown; cites?: unknown; quotes?: unknown };
      const cites = [...new Set((Array.isArray(o.cites) ? o.cites : []).map((c) => String(c).trim().replace(/^\[|\]$/g, '')))];
      const quotes = (Array.isArray(o.quotes) ? o.quotes : []).map((q) => ({ block: String((q as { block?: unknown }).block ?? '').replace(/^\[|\]$/g, ''), text: String((q as { text?: unknown }).text ?? '') }));
      const valid = cites.filter((c) => Number.isFinite(chapterOf(c)));
      return { text: String(o.text ?? '').trim(), cites, quotes, gate: valid.length ? gateOf(valid) : CHAPTERS };
    });
    return { slug, term: t.term, sentences };
  });
}

async function run() {
  if (!Number.isFinite(CAP) || CAP <= 0) throw new Error('--cap <usd> is required');
  const key = anthropicKey();
  const s: State = loadState() ?? { per: PER, groups, spent_usd: 0 };
  const params = (i: number) => opusParams(prompt, book.text, requestFor(s.groups[i]), MAX_TOKENS_PER_ENTRY * s.groups[i].length);
  const worstOf = (idx: number[]) => idx.reduce((a, i) => a + PREFIX * OPUS_BATCH.cacheWrite1h + FRESH_PER_ENTRY * s.groups[i].length * OPUS_BATCH.input + MAX_TOKENS_PER_ENTRY * s.groups[i].length * OPUS_BATCH.output, 0);
  if (!s.warm) {
    const w = worstOf([0]);
    if (w > CAP) throw new Error(`the warm batch's worst case ${usd(w)} is over the cap ${usd(CAP)}`);
    s.warm = await submitBatch(key, [{ custom_id: custom(0), params: params(0) }]);
    saveState(s);
    return console.log(`submitted the warm batch ${s.warm.id} (worst case ${usd(w)}); run again when it has ended`);
  }
  if (s.warm.processing_status !== 'ended') {
    s.warm = await batchStatus(key, s.warm.id);
    saveState(s);
    if (s.warm.processing_status !== 'ended') return console.log(`warm batch ${s.warm.id}: ${s.warm.processing_status}`);
  }
  if (!s.rest && s.groups.length > 1) {
    const idx = s.groups.map((_, i) => i).slice(1);
    const w = worstOf(idx);
    if (w > CAP) throw new Error(`the batch's worst case ${usd(w)} (no request reading the cache) is over the cap ${usd(CAP)}`);
    s.rest = await submitBatch(key, idx.map((i) => ({ custom_id: custom(i), params: params(i) })));
    saveState(s);
    return console.log(`submitted ${idx.length} requests as batch ${s.rest.id} (worst case ${usd(w)}); run again when it has ended`);
  }
  if (s.rest && s.rest.processing_status !== 'ended') {
    s.rest = await batchStatus(key, s.rest.id);
    saveState(s);
    if (s.rest.processing_status !== 'ended') return console.log(`batch ${s.rest.id}: ${s.rest.processing_status}`, s.rest.request_counts ?? '');
  }
  // Collect.
  const results = [...(await batchResults(key, s.warm)), ...(s.rest ? await batchResults(key, s.rest) : [])];
  const entries: Entry[] = [];
  const calls: unknown[] = [];
  let spent = 0;
  let version = '';
  s.groups.forEach((group, i) => {
    const r = results.find((x) => x.custom_id === custom(i));
    const u = r?.result.message?.usage ?? {};
    spent += batchCost(u);
    version ||= r?.result.message?.model ?? '';
    let parsed: Entry[] = group.map((slug) => ({ slug, term: glossary.terms.find((t) => t.slug === slug)!.term, sentences: [] }));
    let error: string | undefined = r?.result.type === 'succeeded' ? undefined : `result ${r?.result.type ?? 'missing'}`;
    if (!error) {
      try {
        parsed = parseGroup(textOf(r!), group);
      } catch (e) {
        error = String(e);
      }
    }
    entries.push(...parsed);
    calls.push({ custom_id: custom(i), slugs: group, usage: u, usd: batchCost(u), raw: r ? textOf(r) : '', error });
  });
  s.spent_usd = spent;
  saveState(s);
  const assist: ExplanationsFile['assist'] = {
    model: 'anthropic/claude-opus-5.5',
    maker: 'Anthropic',
    open_weights: false,
    version: version || OPUS,
    provider: 'anthropic (Message Batches API, direct)',
    prompt_file: PROMPT_FILE,
    prompt_sha256: sha256(read(PROMPT_FILE)),
    book_sha256: book.sha256,
    glossary_sha256: sha256(glossaryRaw),
    date: new Date().toISOString().slice(0, 10),
    settings: { per_request: s.per, max_tokens_per_entry: MAX_TOKENS_PER_ENTRY, effort: 'low', cache: '1h on the book', batches: [s.warm.id, s.rest?.id].filter(Boolean) },
    drafted: 'every word of each explanation; the citations and quotes are checked by scripts/lib/glossary-explain.ts',
  };
  writeFileSync(path.join(ROOT, RAW), JSON.stringify({ about: 'The raw run, before the fix pass (scripts/glossary-fix.ts). Not for readers.', assist, entries }, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'private/glossary-explanations/anthropic-batch-calls.json'), JSON.stringify(calls, null, 1) + '\n');
  const problems = verifyExplanations(entries, blocksOf(ROOT), glossary);
  console.log(`wrote ${RAW}: ${entries.length} entries, ${entries.filter((e) => !e.sentences.length).length} empty, ${problems.length} program problems; spent ${usd(spent)} (batch prices)`);
}

if (mode === 'estimate') estimate();
else if (mode === 'run') await run();
else throw new Error('mode: estimate | run');
