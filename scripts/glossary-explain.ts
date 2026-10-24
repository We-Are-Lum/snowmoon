/**
 * Writes the glossary's model-written explanations (owner, 2026-10-23), through the Vercel AI Gateway only, with
 * AI_GATEWAY_API_KEY from .env.local (never printed; never the site's Groq key). Rules and shared code:
 * scripts/lib/glossary-explain.ts. Prompt: config/prompts/glossary-explain.md, the same for every model.
 *
 *   npx tsx scripts/glossary-explain.ts book
 *       Writes the exact book text the models read to private/glossary-explanations/book.txt, to look at.
 *   npx tsx scripts/glossary-explain.ts estimate
 *       No model call, no key: the book's size, whether it fits each model, and the cost table, from the gateway's
 *       free model list. The default.
 *   npx tsx --env-file-if-exists=.env.local scripts/glossary-explain.ts bakeoff --run --cap <usd>
 *       The blind bake-off: the five entries (BAKEOFF_SLUGS) with each of the three models. Writes the page's data
 *       (private/glossary-bakeoff/explanations.json, labels A/B/C only) and the key
 *       (private/glossary-bakeoff/key.json, a separate file: which label is which model, usage, request ids, raw answers).
 *   npx tsx --env-file-if-exists=.env.local scripts/glossary-explain.ts bakeoff-fill --run --cap <usd>
 *       Runs the bake-off's failed calls again (same model, same label) and updates both files.
 *   npx tsx --env-file-if-exists=.env.local scripts/glossary-explain.ts all --model <gateway id> --run --cap <usd>
 *       Every entry with one model. Writes the draft, private/glossary-explanations/glossary-explanations.json,
 *       with its `assist` record.
 *   npx tsx scripts/glossary-explain.ts publish --owner-read
 *       Only once the owner has read the draft: copies it to content/snowmoon/glossary-explanations.json (committed).
 *
 * Every output stays in private/ (git-ignored) until then (owner, 2026-10-23: "keep outputs out of the public repo
 * until I've read them"): the bake-off's page data, the support check, the key, the raw answers and the draft.
 *
 * Each model reads the book once: the book is the same first user message on every call (after the same system
 * prompt), so later calls read it from the provider's prompt cache. Anthropic needs a cache marker on that message
 * (cache_control, 5-minute entry, kept warm by calling one entry after another); DeepSeek and Kimi cache a repeated
 * prefix by themselves. Each model is pinned to one provider (providerOptions.gateway.only) so the cache stays in
 * one place, with the same x-session-affinity header on every call of a run.
 *
 * Spending: before every call, the run stops if that call's worst case (the book written to the cache again, plus
 * the full output allowance) would take the run's total past --cap. The total is summed from the calls' reported
 * usage priced at the gateway's published prices.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Glossary } from './lib/glossary';
import {
  BAKEOFF_FILE,
  BAKEOFF_KEY_FILE,
  BAKEOFF_MODELS,
  BAKEOFF_SLUGS,
  CHECK_MODEL,
  EXPLANATIONS_DRAFT,
  EXPLANATIONS_FILE,
  GATEWAY,
  PROMPT_FILE,
  blocksOf,
  entryRequest,
  estimateTokens,
  parseAnswer,
  priceOf,
  runCost,
  serializeBook,
  sha256,
  verifyExplanations,
  type Entry,
  type ExplanationsFile,
  type ModelChoice,
  type Price,
} from './lib/glossary-explain';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const args = process.argv.slice(2);
const mode = args[0] ?? 'estimate';
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUN = args.includes('--run');
const CAP = Number(flag('cap') ?? NaN);
/** Output allowance per call, reasoning included. */
const MAX_TOKENS = 8000;

const glossaryRaw = read('content/snowmoon/glossary.json');
const glossary = JSON.parse(glossaryRaw) as Glossary;
const prompt = read(PROMPT_FILE).replace(/^<!--[\s\S]*?-->\s*/, '');
const book = serializeBook(ROOT);

// ---- Estimates (assumptions shown with the table) ----
const BOOK_TOKENS = estimateTokens(prompt) + estimateTokens(book.text);
const ENTRY_IN = 400; // the entry's request: mentions list and instructions (Minpentai's 52 mentions are ~350 tokens)
const OUT_TEXT = 900; // the JSON answer: 3-8 sentences with ids and quotes
const OUT_REASON = 2000; // reasoning at effort "low", billed as output (a guess; the bake-off will measure it)
const OUT = OUT_TEXT + OUT_REASON;
const CHECK_IN = 2500; // one entry's sentences plus the text of every cited block (~6 sentences x ~3 blocks)
const CHECK_OUT = 1200;

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

async function estimate() {
  console.log(`Book: ${book.blocks} blocks, ${book.text.length.toLocaleString()} characters, sha256 ${book.sha256.slice(0, 12)}`);
  console.log(`Tokens (characters / 4, no tokenizer): book ${estimateTokens(book.text).toLocaleString()}, prompt ${estimateTokens(prompt)}; cached prefix ${BOOK_TOKENS.toLocaleString()}`);
  console.log(`Per entry: ${ENTRY_IN} fresh input, ${OUT} output (${OUT_TEXT} answer + ${OUT_REASON} reasoning)\n`);
  const n = glossary.terms.length;
  for (const m of [...BAKEOFF_MODELS, CHECK_MODEL]) {
    const p = await priceOf(m);
    const fits = BOOK_TOKENS + ENTRY_IN + MAX_TOKENS <= p.context;
    console.log(`${m.id} at ${m.provider}: context ${p.context.toLocaleString()}, max output ${p.maxOutput.toLocaleString()} -> ${fits ? 'fits' : 'DOES NOT FIT'}`);
    console.log(`  per million tokens: input $${(p.input * 1e6).toFixed(3)}, output $${(p.output * 1e6).toFixed(3)}, cache read $${(p.cacheRead * 1e6).toFixed(3)}, cache write $${(p.cacheWrite * 1e6).toFixed(3)}`);
    if (m === CHECK_MODEL) {
      const one = CHECK_IN * p.input + CHECK_OUT * p.output;
      console.log(`  support check: bake-off 15 calls ${usd(15 * one)}; all ${n} entries of one model ${usd(n * one)}\n`);
      continue;
    }
    const bake = runCost(p, BAKEOFF_SLUGS.length, BOOK_TOKENS, ENTRY_IN, OUT);
    const all = runCost(p, n, BOOK_TOKENS, ENTRY_IN, OUT);
    const uncached = n * (BOOK_TOKENS * p.input + ENTRY_IN * p.input + OUT * p.output);
    console.log(`  first (uncached) call ${usd(bake.first)}; each later call ${usd(bake.perLater)}`);
    console.log(`  bake-off (5 calls) ${usd(bake.usd)}; all ${n} (one per call) ${usd(all.usd)}; without caching ${usd(uncached)}`);
    for (const per of [5, 10, 25]) {
      const calls = Math.ceil(n / per);
      const g = runCost(p, calls, BOOK_TOKENS, ENTRY_IN * per, OUT * per);
      console.log(`  all ${n}, ${per} per call (${calls} calls) ${usd(g.usd)}`);
    }
    if (m.id.startsWith('anthropic/')) {
      // Batch (Anthropic only on the gateway): half price; a cache hit inside a batch is not guaranteed.
      const half: Price = { ...p, input: p.input / 2, output: p.output / 2, cacheRead: p.cacheRead / 2, cacheWrite: p.cacheWrite / 2 };
      const worst = n * (BOOK_TOKENS * half.input + ENTRY_IN * half.input + OUT * half.output);
      console.log(`  all ${n} as a gateway batch: ${usd(runCost(half, n, BOOK_TOKENS, ENTRY_IN, OUT).usd)} if every call hits the cache, ${usd(worst)} if none does`);
    }
    console.log('');
  }
}

// ---- Calls ----
interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cost?: number;
}
interface Reply {
  text: string;
  usage: Usage;
  usd: number;
  requestId: string | null;
  model: string;
  provider: string;
}

function costOf(u: Usage, p: Price): number {
  if (typeof u.cost === 'number') return u.cost;
  const read = u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens ?? 0;
  const write = u.prompt_tokens_details?.cache_write_tokens ?? u.cache_creation_input_tokens ?? 0;
  const plain = Math.max(0, (u.prompt_tokens ?? 0) - read - write);
  return plain * p.input + read * p.cacheRead + write * p.cacheWrite + (u.completion_tokens ?? 0) * p.output;
}

async function call(key: string, m: ModelChoice, p: Price, session: string, system: string, user: string, request: string): Promise<Reply> {
  const bookMessage: Record<string, unknown> = { role: 'user', content: user };
  if (m.caching === 'explicit') bookMessage.cache_control = { type: 'ephemeral' };
  const send = () => fetch(`${GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'x-session-affinity': session },
    body: JSON.stringify({
      model: m.id,
      messages: [{ role: 'system', content: system }, bookMessage, { role: 'user', content: request }],
      max_tokens: MAX_TOKENS,
      reasoning: { effort: m.effort },
      providerOptions: { gateway: { only: [m.provider] } },
    }),
  });
  // A busy provider (429, "at capacity"): wait and try the same provider again, 30 s, 90 s, 180 s. A refused call costs nothing.
  let res = await send();
  for (const wait of [30_000, 90_000, 180_000]) {
    if (res.status !== 429) break;
    console.log(`${m.id}: busy (429), trying again in ${wait / 1000} s`);
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string; model?: string; provider?: string; choices?: { message?: { content?: string } }[]; usage?: Usage; error?: { message?: string } };
  if (!res.ok) throw new Error(`${m.id}: gateway ${res.status} ${j.error?.message ?? ''}`.trim());
  const usage = j.usage ?? {};
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    usage,
    usd: costOf(usage, p),
    requestId: j.id ?? res.headers.get('x-vercel-id'),
    model: j.model ?? m.id,
    provider: j.provider ?? res.headers.get('x-vercel-ai-provider') ?? m.provider,
  };
}

let spent = 0;
function guard(p: Price) {
  const worst = BOOK_TOKENS * Math.max(p.cacheWrite, p.input) + ENTRY_IN * p.input + MAX_TOKENS * p.output;
  if (spent + worst > CAP) throw new Error(`stopping: spent ${usd(spent)}; the next call's worst case ${usd(worst)} would pass the cap ${usd(CAP)}`);
}

async function runModel(key: string, m: ModelChoice, slugs: string[]) {
  const p = await priceOf(m);
  const session = `glossary-${randomUUID()}`;
  const entries: Entry[] = [];
  const calls: { slug: string; requestId: string | null; usage: Usage; usd: number; raw: string; error?: string }[] = [];
  let served = { model: '', provider: '' };
  for (const slug of slugs) {
    const t = glossary.terms.find((x) => x.slug === slug);
    if (!t) throw new Error(`${slug}: not in the glossary`);
    guard(p);
    let r: Reply;
    try {
      r = await call(key, m, p, session, prompt, book.text, entryRequest(t));
    } catch (e) {
      // A refused or failed call: recorded, and the run goes on (what was spent so far is kept and written).
      console.log(`${m.id} ${slug}: ${String(e).slice(0, 200)}`);
      entries.push({ slug, term: t.term, sentences: [] });
      calls.push({ slug, requestId: null, usage: {}, usd: 0, raw: '', error: String(e).slice(0, 500) });
      continue;
    }
    spent += r.usd;
    if (!served.model) served = { model: r.model, provider: r.provider };
    const read = r.usage.prompt_tokens_details?.cached_tokens ?? r.usage.cache_read_input_tokens ?? 0;
    console.log(`${m.id} ${slug}: ${r.usage.prompt_tokens ?? '?'} in (${read} from cache), ${r.usage.completion_tokens ?? '?'} out, ${usd(r.usd)}; run total ${usd(spent)}`);
    try {
      entries.push({ slug, term: t.term, ...parseAnswer(r.text) });
      calls.push({ slug, requestId: r.requestId, usage: r.usage, usd: r.usd, raw: r.text });
    } catch (e) {
      entries.push({ slug, term: t.term, sentences: [] });
      calls.push({ slug, requestId: r.requestId, usage: r.usage, usd: r.usd, raw: r.text, error: String(e) });
    }
  }
  const assist: ExplanationsFile['assist'] = {
    model: m.id,
    maker: m.maker,
    open_weights: m.open_weights,
    version: served.model,
    provider: served.provider,
    prompt_file: PROMPT_FILE,
    prompt_sha256: sha256(read(PROMPT_FILE)),
    book_sha256: book.sha256,
    glossary_sha256: sha256(glossaryRaw),
    date: new Date().toISOString().slice(0, 10),
    settings: { max_tokens: MAX_TOKENS, reasoning_effort: m.effort, provider_only: m.provider, cache: m.caching, gateway: GATEWAY },
    drafted: 'every word of each explanation; the citations and quotes are checked by scripts/lib/glossary-explain.ts',
  };
  return { entries, calls, assist, usd: calls.reduce((a, c) => a + c.usd, 0) };
}

const ABOUT =
  'Written explanations of the glossary\'s words, made by a model from the whole book (scripts/glossary-explain.ts, prompt in config/prompts/glossary-explain.md). Not the author\'s words. Each sentence cites the blocks it rests on; quotes are checked word for word; a sentence shows only once the reader has reached the chapter of its latest citation (`gate`).';

async function main() {
  if (mode === 'estimate') return estimate();
  if (mode === 'publish') {
    // Only on the owner's word, after reading the draft: copy it to the committed file, if it passes.
    if (!args.includes('--owner-read')) throw new Error('publish copies the draft into the repository: add --owner-read only once the owner has read it');
    const draft = JSON.parse(read(EXPLANATIONS_DRAFT)) as ExplanationsFile;
    const problems = verifyExplanations(draft.entries, blocksOf(ROOT), glossary);
    if (problems.length) throw new Error(`the draft fails: ${problems.slice(0, 10).join('; ')}`);
    writeFileSync(path.join(ROOT, EXPLANATIONS_FILE), JSON.stringify(draft, null, 1) + '\n');
    console.log(`copied ${EXPLANATIONS_DRAFT} to ${EXPLANATIONS_FILE}`);
    return;
  }
  if (mode === 'book') {
    // The exact text every model reads, to look at (rebuilt from the committed chapters; its sha256 is in `assist`).
    mkdirSync(path.join(ROOT, 'private/glossary-explanations'), { recursive: true });
    writeFileSync(path.join(ROOT, 'private/glossary-explanations/book.txt'), book.text);
    console.log(`wrote private/glossary-explanations/book.txt: ${book.blocks} blocks, sha256 ${book.sha256}`);
    return;
  }
  if (!RUN) {
    console.log(`${mode}: add --run and --cap <usd> to call the models. Nothing was sent.`);
    return estimate();
  }
  if (!Number.isFinite(CAP) || CAP <= 0) throw new Error('--cap <usd> is required with --run');
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error('AI_GATEWAY_API_KEY not set (run with --env-file-if-exists=.env.local)');
  if (process.env.GROQ_API_KEY) delete process.env.GROQ_API_KEY; // never the site's Groq key

  if (mode === 'bakeoff') {
    // Blind labels: a random order of the three models, recorded only in the key.
    const order = [...BAKEOFF_MODELS];
    for (let i = order.length - 1; i > 0; i--) {
      const k = randomInt(i + 1);
      [order[i], order[k]] = [order[k], order[i]];
    }
    const labels = ['A', 'B', 'C'];
    const blocks = blocksOf(ROOT);
    const page: Record<string, { entries: Entry[]; problems: string[] }> = {};
    const keyFile: Record<string, unknown> = {};
    for (const [i, m] of order.entries()) {
      const r = await runModel(key, m, [...BAKEOFF_SLUGS]);
      page[labels[i]] = { entries: r.entries, problems: verifyExplanations(r.entries, blocks, glossary) };
      keyFile[labels[i]] = { assist: r.assist, usd: r.usd, calls: r.calls };
    }
    const date = new Date().toISOString().slice(0, 10);
    mkdirSync(path.dirname(path.join(ROOT, BAKEOFF_FILE)), { recursive: true });
    writeFileSync(
      path.join(ROOT, BAKEOFF_FILE),
      JSON.stringify({ about: 'The blind bake-off (owner, 2026-10-23): the same prompt and book to three models, labelled A, B and C. Which is which is in a separate key file.', date, prompt_file: PROMPT_FILE, prompt_sha256: sha256(read(PROMPT_FILE)), book_sha256: book.sha256, slugs: BAKEOFF_SLUGS, labels: page }, null, 1) + '\n',
    );
    mkdirSync(path.dirname(path.join(ROOT, BAKEOFF_KEY_FILE)), { recursive: true });
    writeFileSync(path.join(ROOT, BAKEOFF_KEY_FILE), JSON.stringify({ date, spent_usd: spent, key: keyFile }, null, 1) + '\n');
    console.log(`wrote ${BAKEOFF_FILE} and ${BAKEOFF_KEY_FILE}; spent ${usd(spent)}`);
    return;
  }
  if (mode === 'bakeoff-fill') {
    // Calls of the bake-off that failed (e.g. a busy provider): run them again with the same model, keep its label.
    const page = JSON.parse(read(BAKEOFF_FILE));
    const keyData = JSON.parse(read(BAKEOFF_KEY_FILE));
    for (const [label, k] of Object.entries(keyData.key as Record<string, { assist: { model: string }; usd: number; calls: { slug: string; error?: string }[] }>)) {
      const failed = k.calls.filter((c) => c.error).map((c) => c.slug);
      if (!failed.length) continue;
      const m = BAKEOFF_MODELS.find((x) => x.id === k.assist.model)!;
      const r = await runModel(key, m, failed);
      for (const e of r.entries) page.labels[label].entries[page.labels[label].entries.findIndex((x: Entry) => x.slug === e.slug)] = e;
      for (const c of r.calls) k.calls[k.calls.findIndex((x) => x.slug === c.slug)] = c;
      k.usd += r.usd;
      page.labels[label].problems = verifyExplanations(page.labels[label].entries, blocksOf(ROOT), glossary);
    }
    keyData.spent_usd += spent;
    writeFileSync(path.join(ROOT, BAKEOFF_FILE), JSON.stringify(page, null, 1) + '\n');
    writeFileSync(path.join(ROOT, BAKEOFF_KEY_FILE), JSON.stringify(keyData, null, 1) + '\n');
    console.log(`filled; spent ${usd(spent)} this run`);
    return;
  }
  if (mode === 'all') {
    const id = flag('model');
    const m = BAKEOFF_MODELS.find((x) => x.id === id);
    if (!m) throw new Error(`--model must be one of ${BAKEOFF_MODELS.map((x) => x.id).join(', ')}`);
    const only = flag('only')?.split(',');
    const slugs = only ?? glossary.terms.map((t) => t.slug);
    const r = await runModel(key, m, slugs);
    const problems = verifyExplanations(r.entries, blocksOf(ROOT), glossary);
    const out: ExplanationsFile = { about: ABOUT, assist: r.assist, entries: r.entries };
    mkdirSync(path.join(ROOT, 'private/glossary-explanations'), { recursive: true });
    writeFileSync(path.join(ROOT, EXPLANATIONS_DRAFT), JSON.stringify(out, null, 1) + '\n');
    writeFileSync(path.join(ROOT, `private/glossary-explanations/run-${r.assist.date}.json`), JSON.stringify({ spent_usd: spent, calls: r.calls }, null, 1) + '\n');
    console.log(`wrote ${EXPLANATIONS_DRAFT}: ${r.entries.length} entries, ${problems.length} problems; spent ${usd(spent)}`);
    if (problems.length) console.log(problems.slice(0, 30).join('\n'));
    return;
  }
  throw new Error('mode: estimate | book | bakeoff | bakeoff-fill | all | publish');
}

if (!existsSync(path.join(ROOT, PROMPT_FILE))) throw new Error(`${PROMPT_FILE} missing`);
await main();
