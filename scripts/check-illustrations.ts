/**
 * Does each image show its scene? (owner, 2026-10-23; branch illustration-check)
 *
 * For each illustration job (content/snowmoon/illustrations/chapter-N.json) a vision model gets the image, the
 * passage (the job's block and the blocks around it), the prompt the picture model received, and each named
 * character's sheet and facts. It answers in fixed fields (src/lib/illustration-check/schema.ts): who's there,
 * setting, action, time of day, problems, and a verdict (matches / partly / wrong) with one sentence why.
 * The instructions are config/prompts/illustration-check.md.
 *
 * Paid calls go only through the Vercel AI Gateway (owner, 2026-10-11: batch jobs never use the site's Groq
 * key), with AI_GATEWAY_API_KEY read from the environment or from the one line of an env file; the key is never
 * printed. Every call asks for zero data retention. Nothing is spent without --spend.
 *
 *   npx tsx scripts/check-illustrations.ts                                   estimate all jobs, no call
 *   npx tsx scripts/check-illustrations.ts --pilot                           estimate the 3-job pilot, no call
 *   npx tsx scripts/check-illustrations.ts --pilot --spend --max-usd=1 \
 *     --env-file=/Users/nathan/snowmoon/.env.local                           run the pilot (paid)
 *   … --only=c1-b082-snatch,c2-b038-foil-classroom   … --model=anthropic/claude-opus-5.5
 *   … --sheets=DIR (repeatable): folders holding cast sheet renders (zei-sheet.png …); a sheet is sent as a
 *     picture only when its sha256 matches content/snowmoon/recipes/images/cast.json, otherwise as its text.
 *   … --upload: also store each answer in studio.illustration_checks (needs NEXT_illustration_review and
 *     STUDIO_DATABASE_URL), so the owner's review page can show it on the site.
 *
 * Output (with --spend): private/illustration-check/<run>.json (gitignored), with its recipe: the model, the
 * version the gateway reports, the prompt file and its sha256, the date, and the sha256 of every input. It is
 * the file to commit (content/snowmoon/recipes/checks/) once the owner has read it: nothing is public before
 * (owner: "Owner-only: nothing public until I've read it").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkJobs, sha256, type CheckJob } from '../src/lib/illustration-check/jobs';
import { ANSWER_SCHEMA, parseAnswer, type CheckAnswer } from '../src/lib/illustration-check/schema';

const ROOT = process.cwd();
const PROMPT_FILE = 'config/prompts/illustration-check.md';
const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
/** The pilot (3 jobs): a robed crowd with two identical robes; a lettered classroom full of students with two
 *  cast members; seven people around a table with two cast members. */
export const PILOT = ['c1-b082-snatch', 'c2-b038-foil-classroom', 'c27-b114-countdown-chant'];

/**
 * Candidates, USD per million tokens from the gateway's model list (https://ai-gateway.vercel.sh/v1/models, read
 * 2026-10-23). imageTokens: what one 1024×576 picture costs in input tokens. Gemini: 1,120 at high media resolution
 * (Gemini 3's documented figure; Gemini 4's isn't published, so it is an assumption). Claude: width×height/750.
 * OpenAI: 85 + 170 per 512-px tile after scaling the short side to 768 (6 tiles). Reasoning tokens bill as output.
 */
export const MODELS: Record<string, { maker: string; input: number; output: number; cacheRead: number; imageTokens: number; reasoningTokens: number; note: string }> = {
  'google/gemini-4-argon': { maker: 'Google', input: 2, output: 10, cacheRead: 0.1, imageTokens: 1120, reasoningTokens: 1500, note: 'recommended; implicit caching' },
  'anthropic/claude-opus-5.5': { maker: 'Anthropic', input: 4, output: 20, cacheRead: 0.2, imageTokens: 787, reasoningTokens: 1500, note: 'alternative; zero retention on every provider' },
  'openai/gpt-6.1-sol': { maker: 'OpenAI', input: 2, output: 10, cacheRead: 0.1, imageTokens: 1105, reasoningTokens: 1500, note: 'alternative; implicit caching' },
  'google/gemini-3.8-flash': { maker: 'Google', input: 0.75, output: 3.75, cacheRead: 0.075, imageTokens: 1120, reasoningTokens: 1000, note: 'cheap fallback' },
};
const ANSWER_TOKENS = 450;

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);
const many = (name: string) => process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));

const model = arg('model') ?? 'google/gemini-4-argon';
const price = MODELS[model];
if (!price) throw new Error(`--model must be one of ${Object.keys(MODELS).join(', ')} (prices are recorded there)`);
const effort = arg('effort') ?? 'medium';
const maxUsd = Number(arg('max-usd') ?? '3');
const spend = flag('spend');
const sheetDirs = [path.join(ROOT, 'images-out', 'cast'), ...many('sheets')];

const prompt = readFileSync(path.join(ROOT, PROMPT_FILE), 'utf8');
const system = prompt.replace(/^<!--[\s\S]*?-->\s*/, '');

// ---------------------------------------------------------------------------------------------------------------
// Inputs per job
// ---------------------------------------------------------------------------------------------------------------

/** A cast sheet render on this machine whose sha256 matches the cast recipe, or null. */
function sheetFile(ref: string, want: string | null): string | null {
  if (!want) return null;
  const name = `${ref.split('/').pop()}.png`;
  for (const dir of sheetDirs) {
    const f = path.join(dir, name);
    if (existsSync(f) && sha256(readFileSync(f)) === want) return f;
  }
  return null;
}

/** The cast block: the same text for every job with the same cast, so it is part of the cacheable prefix. */
function castText(job: CheckJob): string {
  if (!job.cast.length) return 'CAST: none named. The job names no book character; judge the people against the PASSAGE.';
  return job.cast
    .map((c, i) => {
      const facts = c.facts.map((f) => `- ${f.fact} (c${f.chapter}-b${f.idx}: "${f.quote}")`).join('\n');
      return `CAST ${i + 1}: ${c.name}\nSheet: ${c.descriptor}\nFACTS:\n${facts || '- none recorded'}`;
    })
    .join('\n\n');
}

function passageText(job: CheckJob): string {
  const lines = job.passage.map((b) => `${b.target ? '>>> ' : ''}[c${job.chapter}-b${b.idx}] ${b.text}`);
  return `PASSAGE (chapter ${job.chapter}${job.dateline ? `, ${job.dateline}` : ''}):\n${lines.join('\n\n')}`;
}

function letteringText(job: CheckJob): string {
  if (!job.lettering.length) return '';
  const words = [...new Set(job.lettering.map((l) => l.text.replace(/\n+/g, ' / ') + (l.gloss ? ` ("${l.gloss}")` : '')))];
  return `\n\nLETTERING (drawn over the picture later, in code; the picture below is the clean one and should have no writing): ${words.join('; ')}`;
}

interface Built {
  job: CheckJob;
  /** Cast key: jobs are run grouped by it, so consecutive calls share the instructions and the cast block. */
  castKey: string;
  text: { cast: string; job: string };
  sheets: { ref: string; file: string; sha256: string }[];
  inputs: Record<string, string>;
}

function build(job: CheckJob): Built {
  const cast = castText(job);
  const jobText = `${passageText(job)}\n\nPROMPT (what the picture model received):\n${job.composedPrompt}${letteringText(job)}\n\nTHE IMAGE follows. Answer in the fixed fields.`;
  const sheets = job.cast.flatMap((c) => {
    if (!c.sheet) return [];
    const f = sheetFile(c.sheet.ref, c.sheet.sha256);
    return f && c.sheet.sha256 ? [{ ref: c.sheet.ref, file: f, sha256: c.sheet.sha256 }] : [];
  });
  return {
    job,
    castKey: job.cast.map((c) => c.slug).join('+'),
    text: { cast, job: jobText },
    sheets,
    inputs: {
      image: job.image?.sha256 ?? 'none',
      passage: sha256(job.passage.map((b) => b.sha256).join(',')),
      prompt: sha256(job.composedPrompt),
      cast: sha256(cast),
      ...Object.fromEntries(sheets.map((s) => [`sheet:${s.ref}`, s.sha256])),
      instructions: sha256(prompt),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------------------------------------------

const tokens = (s: string) => Math.ceil(s.length / 3.6);
function estimate(list: Built[], p = price) {
  let usd = 0;
  let cachedUsd = 0;
  let inTok = 0;
  let outTok = 0;
  let prev = '';
  for (const b of list) {
    const prefix = tokens(system) + tokens(b.text.cast) + b.sheets.length * p.imageTokens;
    const rest = tokens(b.text.job) + p.imageTokens + 60; // + the schema's own tokens, roughly
    const out = ANSWER_TOKENS + p.reasoningTokens;
    inTok += prefix + rest;
    outTok += out;
    const full = ((prefix + rest) * p.input + out * p.output) / 1e6;
    usd += full;
    // With caching, a call whose cast matches the previous one reads the prefix from the cache.
    const hit = b.castKey === prev;
    cachedUsd += ((hit ? prefix * p.cacheRead : prefix * p.input) + rest * p.input + out * p.output) / 1e6;
    prev = b.castKey;
  }
  return { jobs: list.length, inTok, outTok, usd, cachedUsd };
}

// ---------------------------------------------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------------------------------------------

function gatewayKey(): string {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  const file = arg('env-file') ?? path.join(ROOT, '.env.local');
  if (!existsSync(file)) throw new Error(`no AI_GATEWAY_API_KEY: pass --env-file=<the main checkout's .env.local>`);
  // Only this one line is read; the file's other keys (the site's GROQ key among them) are never loaded.
  const line = readFileSync(file, 'utf8').split('\n').find((l) => /^AI_GATEWAY_API_KEY=/.test(l));
  const key = line?.slice('AI_GATEWAY_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error(`no AI_GATEWAY_API_KEY line in ${file}`);
  return key;
}

const dataUrl = (buf: Buffer, type: string) => `data:${type};base64,${buf.toString('base64')}`;

async function imageBytes(job: CheckJob): Promise<Buffer> {
  let res: Response | null = null;
  for (let i = 0; i < 4 && !res?.ok; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, 3000 * i));
    res = await fetch(job.image!.url).catch(() => null);
  }
  if (!res?.ok) throw new Error(`${job.id}: image ${res?.status ?? 'unreachable'}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== job.image!.sha256) throw new Error(`${job.id}: the published image's sha256 doesn't match published.json`);
  return buf;
}

interface Result {
  job: string;
  chapter: number;
  idx: number;
  image: { url: string; sha256: string } | null;
  inputs_sha256: Record<string, string>;
  sheets_sent_as: 'none' | 'text' | 'pictures and text';
  answer: CheckAnswer | null;
  error?: string;
  usage?: { input_tokens: number; output_tokens: number; cached_tokens: number };
  cost_usd?: number;
  provider?: string | null;
  served_model?: string | null;
  request_id?: string | null;
  attempts?: number;
}

async function call(key: string, b: Built): Promise<Result> {
  const job = b.job;
  const base: Result = {
    job: job.id,
    chapter: job.chapter,
    idx: job.idx,
    image: job.image ? { url: job.image.url, sha256: job.image.sha256 } : null,
    inputs_sha256: b.inputs,
    sheets_sent_as: !job.cast.length ? 'none' : b.sheets.length ? 'pictures and text' : 'text',
    answer: null,
  };
  if (!job.image) return { ...base, error: `no published image (${job.excluded ?? 'not in published.json'})` };
  const img = await imageBytes(job);
  const castParts = [
    { type: 'text', text: b.text.cast },
    ...b.sheets.flatMap((s) => [
      { type: 'text', text: `Sheet picture of ${job.cast.find((c) => c.sheet?.ref === s.ref)?.name}:` },
      { type: 'image_url', image_url: { url: dataUrl(readFileSync(s.file), 'image/png'), detail: 'high' } },
    ]),
  ];
  const body = {
    model,
    // Anthropic's models don't take a temperature while reasoning; the others get 0.
    ...(model.startsWith('anthropic/') ? {} : { temperature: 0 }),
    max_tokens: 6000,
    reasoning: { effort },
    response_format: { type: 'json_schema', json_schema: { name: 'illustration_check', strict: true, schema: ANSWER_SCHEMA } },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: [...castParts, { type: 'text', text: b.text.job }, { type: 'image_url', image_url: { url: dataUrl(img, 'image/jpeg'), detail: 'high' } }] },
    ],
    providerOptions: { gateway: { zeroDataRetention: true } },
  };
  // A malformed answer is retried once; the cost of every attempt is counted.
  let paid = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    if (!res) {
      if (attempt === 2) return { ...base, cost_usd: paid, error: 'gateway unreachable' };
      await new Promise((ok) => setTimeout(ok, 5000));
      continue;
    }
    const j = (await res.json().catch(() => ({}))) as {
      id?: string;
      model?: string;
      choices?: { message?: { content?: string; provider_metadata?: { gateway?: { routing?: { finalProvider?: string }; cost?: string } } } }[];
      usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number }; cost?: number };
      error?: { message?: string };
    };
    if (!res.ok) {
      if (attempt === 2) return { ...base, cost_usd: paid, error: `gateway ${res.status}: ${(j.error?.message ?? '').slice(0, 200)}` };
      continue;
    }
    const msg = j.choices?.[0]?.message;
    const u = j.usage;
    const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
    const cost = u?.cost ?? Number(msg?.provider_metadata?.gateway?.cost ?? NaN);
    const est = u ? ((u.prompt_tokens - cached) * price.input + cached * price.cacheRead + u.completion_tokens * price.output) / 1e6 : 0;
    paid += Number.isFinite(cost) ? cost : est;
    const parsed = parseAnswer(msg?.content ?? '');
    const out: Result = {
      ...base,
      usage: u ? { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens, cached_tokens: cached } : undefined,
      cost_usd: paid,
      attempts: attempt,
      provider: msg?.provider_metadata?.gateway?.routing?.finalProvider ?? null,
      served_model: j.model ?? null,
      request_id: j.id ?? null,
    };
    if (typeof parsed !== 'string') return { ...out, answer: parsed };
    if (attempt === 2) return { ...out, error: `answer didn't fit the fields: ${parsed}` };
  }
  return { ...base, error: 'unreachable' };
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------

const all = checkJobs();
const only = arg('only')?.split(',') ?? (flag('pilot') ? PILOT : null);
const chosen = only ? only.map((id) => all.find((j) => j.id === id) ?? (() => { throw new Error(`no job ${id}`); })()) : all;
const built = chosen.map(build).sort((a, b) => a.castKey.localeCompare(b.castKey) || a.job.chapter - b.job.chapter || a.job.idx - b.job.idx);
const withImage = built.filter((b) => b.job.image);

const fmt = (e: ReturnType<typeof estimate>) =>
  `${e.jobs} jobs, ~${Math.round(e.inTok / 1000)}k input and ~${Math.round(e.outTok / 1000)}k output tokens: $${e.usd.toFixed(2)} uncached, $${e.cachedUsd.toFixed(2)} with the cast prefix cached`;
console.log(`model ${model} (${price.maker}; $${price.input}/$${price.output} per M in/out, cache read $${price.cacheRead}), effort ${effort}`);
console.log(`this run: ${fmt(estimate(withImage))}`);
const noImage = built.filter((b) => !b.job.image).map((b) => b.job.id);
if (noImage.length) console.log(`not checked, no published image: ${noImage.join(', ')}`);
const sheetsAsPictures = new Set(withImage.flatMap((b) => b.sheets.map((s) => s.ref)));
console.log(`cast sheets sent as pictures: ${sheetsAsPictures.size ? [...sheetsAsPictures].join(', ') : 'none'} (the rest as their descriptor text; add --sheets=DIR)`);

if (flag('compare')) {
  const pilot = PILOT.map((id) => all.find((j) => j.id === id)!).map(build);
  const every = all.filter((j) => j.image).map(build).sort((a, b) => a.castKey.localeCompare(b.castKey));
  for (const [m, p] of Object.entries(MODELS)) console.log(`  ${m}: pilot ${fmt(estimate(pilot, p))}; all ${fmt(estimate(every, p))}`);
}

// --show=<job id>: print the exact text a call sends for that job (the pictures are named, not printed). Free.
const show = arg('show');
if (show) {
  const b = built.find((x) => x.job.id === show) ?? build(all.find((j) => j.id === show) ?? (() => { throw new Error(`no job ${show}`); })());
  console.log(`\n--- system (${PROMPT_FILE}) ---\n${system}\n--- user ---\n${b.text.cast}\n${b.sheets.map((s) => `[sheet picture ${s.ref}, sha256 ${s.sha256}]`).join('\n')}\n${b.text.job}\n[image ${b.job.image?.url ?? 'none'}]`);
}

if (!spend) {
  console.log('No call made (estimate only). Add --spend to run; it stops before going over --max-usd (default $3).');
  process.exit(0);
}

const planned = estimate(withImage).usd;
if (planned > maxUsd) {
  console.error(`The uncached estimate ($${planned.toFixed(2)}) is over --max-usd=${maxUsd}; nothing called.`);
  process.exit(1);
}
const key = gatewayKey();
// The record is written after every job, and a run given an existing --out resumes it: jobs with an answer are kept
// and skipped, so a crash can't lose paid results.
const outFile = arg('out');
const resumed = outFile && existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf8')) as { run: string; recipe: { date: string }; results: Result[] }) : null;
const date = resumed?.recipe.date ?? new Date().toISOString();
const run = resumed?.run ?? `${model.replace(/[^a-z0-9.]+/gi, '-')}-${date.slice(0, 19).replace(/[:T]/g, '-')}`;
const out = outFile ?? path.join(ROOT, 'private', 'illustration-check', `${run}.json`);
mkdirSync(path.dirname(out), { recursive: true });
const results: Result[] = resumed ? resumed.results.filter((r) => r.answer) : [];
const done = new Set(results.map((r) => r.job));
// Spend counts every paid attempt, including those of answers dropped on resume.
let spent = resumed ? resumed.results.reduce((t, r) => t + (r.cost_usd ?? 0), 0) + ((resumed as { earlier_spend_usd?: number }).earlier_spend_usd ?? 0) : 0;
const earlier = resumed ? spent - results.reduce((t, r) => t + (r.cost_usd ?? 0), 0) : 0;
if (resumed) console.log(`resuming ${run}: ${done.size} answered, $${spent.toFixed(3)} spent so far`);
const retention = arg('retention') ?? null;

function save() {
  const record = {
    about: 'The illustration check (owner, 2026-10-23): a vision model says whether each seeded image shows its scene. Owner-only until the owner has read it.',
    run,
    recipe: {
      model: { gateway_id: model, maker: price.maker, host: 'Vercel AI Gateway', open_weights: false },
      version: [...new Set(results.map((r) => r.served_model).filter(Boolean))].join(', ') || null,
      version_note: 'The gateway exposes no weights revision for a closed model; the served model id, the date and each call\'s request id are recorded.',
      prompt_file: PROMPT_FILE,
      prompt_sha256: sha256(prompt),
      schema_sha256: sha256(JSON.stringify(ANSWER_SCHEMA)),
      script: 'scripts/check-illustrations.ts',
      date,
      settings: { temperature: model.startsWith('anthropic/') ? 'default (reasoning on)' : 0, reasoning_effort: effort, zero_data_retention: true, structured_output: 'json_schema strict', image_detail: 'high', malformed_retry: 1 },
      ...(retention ? { retention } : {}),
      inputs_sha256: {
        job_files: Object.fromEntries([...new Set(chosen.map((j) => j.jobFile))].map((f) => [f, sha256(readFileSync(path.join(ROOT, f)))])),
        published: sha256(readFileSync(path.join(ROOT, 'content/snowmoon/illustrations/published.json'))),
      },
      assist: { model: 'claude-coding-agent', by: 'the coding agent', drafted: ['check instructions', 'answer fields as JSON schema', 'pilot choice'], instructions: ['owner brief, 2026-10-23'], see: 'config/models.json drafting; principle 3' },
    },
    cost_usd: Number(spent.toFixed(4)),
    earlier_spend_usd: Number(earlier.toFixed(4)),
    results,
  };
  writeFileSync(out, JSON.stringify(record, null, 1) + '\n');
}

let dearest = 0.06; // the most one job may cost; raised to the dearest seen
for (const b of built) {
  if (done.has(b.job.id)) continue;
  if (spent + dearest > maxUsd) {
    console.error(`stopped: $${spent.toFixed(3)} spent; one more job could pass the cap of $${maxUsd}`);
    break;
  }
  // A network failure is recorded as an error for that job (nothing was paid for a call that never reached the gateway's
  // answer) and the run goes on; a later resume retries it.
  const r: Result = await call(key, b).catch((e: Error) => ({ job: b.job.id, chapter: b.job.chapter, idx: b.job.idx, image: null, inputs_sha256: b.inputs, sheets_sent_as: 'none' as const, answer: null, error: `failed: ${e.message.slice(0, 160)}` }));
  spent += r.cost_usd ?? 0;
  dearest = Math.max(dearest, (r.cost_usd ?? 0) * 1.5);
  const at = results.findIndex((x) => x.job === r.job);
  if (at >= 0) results.splice(at, 1);
  results.push(r);
  save();
  console.log(`  ${r.job}: ${r.answer ? `${r.answer.verdict}, ${r.answer.problems.length} problem(s)` : r.error} · $${(r.cost_usd ?? 0).toFixed(4)}`);
}
save();
console.log(`wrote ${path.relative(ROOT, out)} · spent $${spent.toFixed(3)}`);

if (flag('upload')) {
  const { default: postgres } = await import('postgres');
  const url = process.env.STUDIO_DATABASE_URL;
  if (!url) throw new Error('--upload needs STUDIO_DATABASE_URL');
  const sql = postgres(url, { prepare: false, max: 1 });
  for (const r of results.filter((x) => x.answer)) {
    await sql`insert into studio.illustration_checks ${sql({ run, job_id: r.job, image_sha256: r.image?.sha256 ?? null, model, answer: sql.json(r.answer as never), inputs_sha256: sql.json(r.inputs_sha256), cost_usd: r.cost_usd ?? null })} on conflict (run, job_id) do nothing`;
  }
  await sql.end();
  console.log(`uploaded ${results.filter((x) => x.answer).length} answers as run ${run}`);
}
