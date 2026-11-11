/**
 * The fix pass (owner, 2026-10-24): each sentence the support check (with context) marks unsupported is re-cited by
 * the model that wrote it to blocks that support it, or cut; the program's checks run again (citations exist, quotes
 * word for word, the gate recomputed from the new citations) and the support check runs again, with context, on the
 * re-cited sentences. Readers see only sentences that pass. Every fix is recorded: the sentence, its old and new
 * citations or "cut", the model's reason, the checker's reason before and after. Rules: scripts/lib/glossary-fix.ts.
 *
 * How the model finds blocks: it gets the whole book again, as the same cached prefix as the writing run (same
 * system prompt, same book message), and the fix request after it. That is cheaper and more reliable than a search
 * step here: the cache makes the book cost a tenth of its input price (or less), the speaker of a line is often
 * named several blocks earlier (a keyword search would miss it), and the site's own search is for readers, not a
 * retrieval index. Ten entries go in one call (--per-call), so the book is read 21 times for 207 entries.
 *
 *   npx tsx scripts/glossary-fix.ts estimate
 *       The whole pipeline's cost per candidate (full run, support check, fix pass, re-check). No call.
 *   npx tsx scripts/glossary-fix.ts bakeoff --stub
 *   npx tsx scripts/glossary-fix.ts full --stub
 *       Offline: a stand-in model (re-cites "who is speaking" sentences to the block before, cuts the rest) and a
 *       stand-in checker (supports a sentence whose citations grew). Tests the plumbing on real outputs; writes
 *       *-stub.json files in private/. No network.
 *   npx tsx --env-file-if-exists=.env.local scripts/glossary-fix.ts bakeoff|full --run --cap <usd>
 *       The real pass through the Vercel AI Gateway (the writing model and the checker). For the full run with Opus
 *       through the Anthropic Batch API, add --via anthropic-batch and the second --env-file-if-exists for
 *       SNOWMOON_ANTHROPIC_KEY (resumable: run again until it says done).
 *
 * Inputs: the bake-off (private/glossary-bakeoff/explanations.json, support-context.json, the key for each label's
 * model) or the full run (private/glossary-explanations/raw.json and support-context.json, from
 * `glossary-support-check.ts --file private/glossary-explanations/raw.json --context`).
 * Outputs (all private/): fixed.json, every sentence with its status and fix log; and, for the full run, the draft
 * readers may see (glossary-explanations.json), passing sentences only.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Glossary } from './lib/glossary';
import {
  BAKEOFF_FILE,
  BAKEOFF_KEY_FILE,
  BAKEOFF_MODELS,
  BAKEOFF_SUPPORT_CONTEXT_FILE,
  CHECK_CONTEXT_PROMPT_FILE,
  CHECK_MODEL,
  EXPLANATIONS_DRAFT,
  EXPLANATIONS_RAW,
  PROMPT_FILE,
  blockBefore,
  blocksOf,
  priceOf,
  serializeBook,
  sha256,
  type Entry,
  type ExplanationsFile,
  type ModelChoice,
} from './lib/glossary-explain';
import { applyFixes, fixRequest, flagged, parseFixes, readable, settle, tally, toRecheck, FIX_PROMPT_FILE, type Fix, type FixedEntry } from './lib/glossary-fix';
import { callChecker, checkRequest, type Verdict } from './lib/glossary-check';
import { call } from './lib/gateway-call';
import { OPUS_BATCH, anthropicKey, batchCost, batchResults, batchStatus, opusParams, submitBatch, textOf, type BatchRef } from './lib/anthropic-batch';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const mode = args[0] ?? 'estimate';
const STUB = args.includes('--stub');
const RUN = args.includes('--run');
const CAP = Number(flag('cap') ?? NaN);
const PER = Math.max(1, Number(flag('per-call') ?? 10));
const VIA = flag('via') ?? 'gateway';
const usd = (n: number) => `$${n.toFixed(2)}`;

const glossary = JSON.parse(read('content/snowmoon/glossary.json')) as Glossary;
const blocks = blocksOf(ROOT);
const strip = (s: string) => s.replace(/^<!--[\s\S]*?-->\s*/, '');

// ---- Estimate ----
/** Measured on 2026-10-24 (bake-off and its checks), per entry unless said. */
const M = {
  entries: 207,
  checkPerEntry: 0.226 / 15, // GPT-5.6 Sol, with context
  recheckShare: 0.5, // the re-check reads only re-cited sentences: about half an entry's check
  prefix: { kimi: 155_000, deepseek: 156_000, opus: 227_100 },
  genOut: { kimi: 2_400, deepseek: 4_800, opus: 640 },
  fixFreshPerEntry: 700, // the entry's sentences and the checker's reasons
  fixOutPerEntry: { kimi: 600, deepseek: 1_000, opus: 350 }, // fixes plus reasoning, a guess
};
async function estimate() {
  const n = M.entries;
  const calls = Math.ceil(n / PER);
  const check = n * M.checkPerEntry;
  const recheck = n * M.checkPerEntry * M.recheckShare;
  const rows: string[][] = [];
  for (const [name, m, k] of [
    ['Kimi K3.1 Pro (gateway)', BAKEOFF_MODELS[2], 'kimi'],
    ['DeepSeek V4 Pro 0813 on Parasail (gateway)', BAKEOFF_MODELS[1], 'deepseek'],
  ] as const) {
    const p = await priceOf(m);
    const pre = M.prefix[k];
    const gen = pre * p.cacheWrite + 400 * p.input + M.genOut[k] * p.output + (n - 1) * (pre * p.cacheRead + 400 * p.input + M.genOut[k] * p.output);
    const fix = pre * p.cacheWrite + (calls - 1) * pre * p.cacheRead + n * (M.fixFreshPerEntry * p.input + M.fixOutPerEntry[k] * p.output);
    rows.push([name, usd(gen), usd(check), usd(fix), usd(recheck), usd(gen + check + fix + recheck), usd(check + recheck + gen + fix)]);
  }
  {
    const b = OPUS_BATCH;
    const pre = M.prefix.opus;
    const genCalls = Math.ceil(n / 10);
    const genTail = 10 * (450 * b.input + 1_000 * b.output);
    const genBest = pre * b.cacheWrite1h + genTail + (genCalls - 1) * (pre * b.cacheRead + genTail);
    const genWorst = genCalls * (pre * b.cacheWrite1h + genTail);
    const fixTail = PER * (M.fixFreshPerEntry * b.input + M.fixOutPerEntry.opus * b.output);
    const fixBest = pre * b.cacheWrite1h + fixTail + (calls - 1) * (pre * b.cacheRead + fixTail);
    const fixWorst = calls * (pre * b.cacheWrite1h + fixTail);
    rows.push(['Claude Opus 5.5 (Anthropic Batch API, 10 per request)', `${usd(genBest)}–${usd(genWorst)}`, usd(check), `${usd(fixBest)}–${usd(fixWorst)}`, usd(recheck), `${usd(genBest + fixBest + check + recheck)}–${usd(genWorst + fixWorst + check + recheck)}`, usd(check + recheck)]);
  }
  console.log(`Per candidate, ${n} entries; fix pass ${PER} entries per call (${calls} calls); checks by ${CHECK_MODEL.id} on the gateway.`);
  console.log(['candidate', 'full run', 'support check', 'fix pass', 're-check', 'total', 'of which on the gateway ($25)'].join(' | '));
  for (const r of rows) console.log(r.join(' | '));
  console.log('Opus: the run and fix pass are on SNOWMOON_ANTHROPIC_KEY (outside the $25); the checks are on the gateway.');
}

// ---- Inputs ----
interface Job {
  label: string;
  model: ModelChoice;
  entries: Entry[];
  verdicts: Record<string, Verdict[]>;
}
function jobs(which: 'bakeoff' | 'full'): Job[] {
  if (which === 'bakeoff') {
    const page = JSON.parse(read(BAKEOFF_FILE)) as { labels: Record<string, { entries: Entry[] }> };
    const support = JSON.parse(read(BAKEOFF_SUPPORT_CONTEXT_FILE)) as { results: Record<string, Record<string, Verdict[]>> };
    const key = existsSync(path.join(ROOT, BAKEOFF_KEY_FILE)) ? (JSON.parse(read(BAKEOFF_KEY_FILE)).key as Record<string, { assist: { model: string } }>) : {};
    return Object.entries(page.labels).map(([label, v]) => ({
      label,
      model: BAKEOFF_MODELS.find((m) => m.id === key[label]?.assist.model) ?? BAKEOFF_MODELS[0],
      entries: v.entries,
      verdicts: support.results[label] ?? {},
    }));
  }
  const raw = JSON.parse(read(EXPLANATIONS_RAW)) as ExplanationsFile;
  const supportFile = 'private/glossary-explanations/support-context.json';
  if (!existsSync(path.join(ROOT, supportFile))) throw new Error(`${supportFile} missing: run glossary-support-check.ts --file ${EXPLANATIONS_RAW} --context first`);
  const support = JSON.parse(read(supportFile)) as { results: Record<string, Record<string, Verdict[]>> };
  const model = BAKEOFF_MODELS.find((m) => m.id === raw.assist.model)!;
  return [{ label: raw.assist.model, model, entries: raw.entries, verdicts: support.results[raw.assist.model] ?? {} }];
}

// ---- The model and the checker: real or stand-in ----
type Fixer = (job: Job, items: { entry: Entry; fix: { n: number; why: string }[] }[]) => Promise<Fix[] | null>;
type Checker = (entry: FixedEntry) => Promise<Verdict[]>;

const SPEAKER = /speaker|who (is )?speak|asker|questioner|says it|said it|identify .* as the (person|speaker)/i;
const stubFixer: Fixer = async (_job, items) =>
  items.flatMap(({ entry, fix }) =>
    fix.map((f) => {
      const s = entry.sentences[f.n - 1];
      const before = s.cites.length ? blockBefore(ROOT, s.cites[0]) : null;
      return SPEAKER.test(f.why) && before
        ? { slug: entry.slug, n: f.n, action: 'RECITE' as const, cites: [before, ...s.cites], quotes: s.quotes, why: `stub: ${before} for the speaker` }
        : { slug: entry.slug, n: f.n, action: 'CUT' as const, cites: [], quotes: [], why: 'stub: cut' };
    }),
  );
const stubChecker: Checker = async (e) => toRecheck(e).map((s) => ({ n: s.n, supported: s.cites.length > (s.fix?.original.cites.length ?? 0), why: 'stub' }));

let spent = 0;
function guard(worst: number) {
  if (spent + worst > CAP) throw new Error(`stopping: spent ${usd(spent)}; the next call's worst case ${usd(worst)} would pass the cap ${usd(CAP)}`);
}
const book = serializeBook(ROOT);
const writePrompt = strip(read(PROMPT_FILE));
const fixPrompt = strip(read(FIX_PROMPT_FILE));

function gatewayFixer(key: string): Fixer {
  const sessions = new Map<string, string>();
  return async (job, items) => {
    const p = await priceOf(job.model);
    if (!sessions.has(job.label)) sessions.set(job.label, `glossary-fix-${randomUUID()}`);
    guard(200_000 * Math.max(p.cacheWrite, p.input) + 16_000 * p.output);
    const r = await call(key, job.model, p, sessions.get(job.label)!, writePrompt, book.text, `${fixPrompt}\n\n${fixRequest(items)}`, 16_000);
    spent += r.usd;
    console.log(`${job.label} fix ${items.map((i) => i.entry.slug).join(',')}: ${usd(r.usd)}; total ${usd(spent)}`);
    return parseFixes(r.text);
  };
}

/** Opus through the Anthropic Batch API: submits once, then collects on a later run (state in private/). */
function batchFixer(): Fixer {
  const STATE = 'private/glossary-explanations/anthropic-fix-batch.json';
  return async (_job, items) => {
    const key = anthropicKey();
    const st = existsSync(path.join(ROOT, STATE)) ? (JSON.parse(read(STATE)) as { ref: BatchRef; groups: string[][] }) : null;
    const groups: string[][] = [];
    for (let i = 0; i < items.length; i += PER) groups.push(items.slice(i, i + PER).map((x) => x.entry.slug));
    if (!st) {
      const worst = groups.length * (227_100 * OPUS_BATCH.cacheWrite1h + 16_000 * OPUS_BATCH.output);
      guard(worst);
      const reqs = groups.map((g, i) => ({ custom_id: `f${String(i).padStart(3, '0')}`, params: opusParams(writePrompt, book.text, `${fixPrompt}\n\n${fixRequest(items.filter((x) => g.includes(x.entry.slug)))}`, 16_000) }));
      const ref = await submitBatch(key, reqs);
      mkdirSync(path.dirname(path.join(ROOT, STATE)), { recursive: true });
      writeFileSync(path.join(ROOT, STATE), JSON.stringify({ ref, groups }, null, 1) + '\n');
      console.log(`submitted fix batch ${ref.id} (${reqs.length} requests, worst case ${usd(worst)}); run again when it has ended`);
      return null;
    }
    const ref = st.ref.processing_status === 'ended' ? st.ref : await batchStatus(key, st.ref.id);
    writeFileSync(path.join(ROOT, STATE), JSON.stringify({ ...st, ref }, null, 1) + '\n');
    if (ref.processing_status !== 'ended') {
      console.log(`fix batch ${ref.id}: ${ref.processing_status}`);
      return null;
    }
    const out: Fix[] = [];
    for (const r of await batchResults(key, ref)) {
      spent += batchCost(r.result.message?.usage ?? {});
      if (r.result.type === 'succeeded') out.push(...parseFixes(textOf(r)));
    }
    return out;
  };
}

function gatewayChecker(key: string): Checker {
  const prompt = strip(read(CHECK_CONTEXT_PROMPT_FILE));
  return async (e) => {
    const todo = toRecheck(e);
    if (!todo.length) return [];
    const p = await priceOf(CHECK_MODEL);
    guard(0.06);
    const r = await callChecker(key, p, prompt, checkRequest(ROOT, e.term, todo, true), 2000);
    spent += r.cost;
    return r.verdicts;
  };
}

// ---- The pass ----
async function pass(which: 'bakeoff' | 'full') {
  if (!STUB && !RUN) throw new Error('add --stub (offline) or --run --cap <usd>');
  if (RUN && (!Number.isFinite(CAP) || CAP <= 0)) throw new Error('--cap <usd> is required with --run');
  const gw = RUN ? process.env.AI_GATEWAY_API_KEY : undefined;
  if (RUN && !gw) throw new Error('AI_GATEWAY_API_KEY not set (run with --env-file-if-exists=.env.local)');
  const fixer: Fixer = STUB ? stubFixer : VIA === 'anthropic-batch' ? batchFixer() : gatewayFixer(gw!);
  const checker: Checker = STUB ? stubChecker : gatewayChecker(gw!);
  const out: Record<string, { entries: FixedEntry[]; tally: ReturnType<typeof tally> }> = {};
  for (const job of jobs(which)) {
    const items = job.entries
      .map((entry) => ({ entry, fix: flagged(entry, job.verdicts[entry.slug] ?? []) }))
      .filter((x) => x.fix.length);
    const fixes: Fix[] = [];
    for (let i = 0; i < items.length; i += VIA === 'anthropic-batch' ? items.length : PER) {
      const got = await fixer(job, items.slice(i, i + (VIA === 'anthropic-batch' ? items.length : PER)));
      if (got === null) return; // a batch is still running: run again later
      fixes.push(...got);
    }
    const fixed: FixedEntry[] = [];
    for (const entry of job.entries) {
      const applied = applyFixes(entry, job.verdicts[entry.slug] ?? [], fixes, blocks);
      fixed.push(settle(applied, await checker(applied)));
    }
    out[job.label] = { entries: fixed, tally: tally(fixed) };
    console.log(`${job.label}: ${JSON.stringify(out[job.label].tally)}`);
  }
  const suffix = STUB ? '-stub' : '';
  const meta = { date: new Date().toISOString().slice(0, 10), stub: STUB, fix_prompt_file: FIX_PROMPT_FILE, fix_prompt_sha256: sha256(read(FIX_PROMPT_FILE)), checker: STUB ? 'stub' : CHECK_MODEL.id, check_prompt_file: CHECK_CONTEXT_PROMPT_FILE, per_call: PER, via: STUB ? 'stub' : VIA, spent_usd: spent };
  if (which === 'bakeoff') {
    const target = `private/glossary-bakeoff/fixed${suffix}.json`;
    writeFileSync(path.join(ROOT, target), JSON.stringify({ about: 'The fix pass on the blind bake-off: every sentence with its status (pass, cut, fail) and its fix. Labels only.', ...meta, labels: out }, null, 1) + '\n');
    console.log(`wrote ${target}; spent ${usd(spent)}`);
    return;
  }
  const raw = JSON.parse(read(EXPLANATIONS_RAW)) as ExplanationsFile;
  const [only] = Object.values(out);
  mkdirSync(path.join(ROOT, 'private/glossary-explanations'), { recursive: true });
  writeFileSync(path.join(ROOT, `private/glossary-explanations/fixed${suffix}.json`), JSON.stringify({ about: 'The fix pass on the full run: every sentence with its status and its fix. Not for readers.', ...meta, assist: raw.assist, entries: only.entries }, null, 1) + '\n');
  const draft: ExplanationsFile = {
    about: `${raw.about ?? ''} Only sentences that passed the support check (with context), first time or after the fix pass, are here; the rest are in fixed.json.`.trim(),
    assist: { ...raw.assist, settings: { ...raw.assist.settings, fix_pass: meta } },
    entries: only.entries.map(readable),
  };
  const target = STUB ? 'private/glossary-explanations/glossary-explanations-stub.json' : EXPLANATIONS_DRAFT;
  writeFileSync(path.join(ROOT, target), JSON.stringify(draft, null, 1) + '\n');
  console.log(`wrote ${target} (passing sentences only) and fixed${suffix}.json; spent ${usd(spent)}`);
}

if (mode === 'estimate') await estimate();
else if (mode === 'bakeoff' || mode === 'full') await pass(mode);
else throw new Error('mode: estimate | bakeoff | full');
