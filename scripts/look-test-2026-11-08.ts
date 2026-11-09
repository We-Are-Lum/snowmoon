/**
 * The challenge's look test of 2026-11-08 (owner-approved): how far a change typed into the remix screen's change box
 * shows, and whether the character stays recognisable. Zei and Bai from their default bases (front view), in the style
 * the remix screen starts on for those pictures, with 12 changes x 2 closing lines, on the four challenge models; FLUX
 * a second time with Zei's three sheet views as references (see FLUX_VIEWS). Test pictures only: NO database, NO
 * storage, nothing published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 * The prompt is built as the route builds it (src/lib/challenge/make.ts remixPrompt, origin/challenge-models c01059e6):
 * the change words, "<Name> is the person in reference image 1, the main figure.", the style's text, the closing line
 * (A: KEEP_LINE, today's; B: the owner's alternative, in the same place), the no-lettering line. Line A's prompt is
 * checked to equal remixPrompt's exactly.
 *
 * The style: the bases were made in "Animated series", which isn't a published style, so the screen can't start on it
 * (makeView: the picture's own style when listed, else the first listed); with no presets yet, the first listed is the
 * newest published style, Mood (published 2026-10-15; the public list shows Mood, Printed, Quiet, Bolder, warm light).
 *
 * Cap: $15 for this run; stops before any call that would take this run's spent + in-flight worst + that call's worst
 * past $14. Prompt check at 1,200 tokens (the route's IMAGES.designs.guardMaxTokens) on every prompt first. Closed models
 * only through the Vercel AI Gateway with the site's own request (GPT pinned to openai, no training; Gemini pinned to
 * vertex, zero retention, no training), checked by scripts/lib/batch-model.ts. GPT, Gemini and Qwen pictures are cropped
 * to 16:9 as the route does (toWide, a quarter of the removed height from the top).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/look-test-2026-11-08.ts <outdir with refs/>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { KEEP_LINE } from '../src/lib/challenge/styles';
import { remixPrompt } from '../src/lib/challenge/make';
import { CHALLENGE_MODELS, QWEN, qwenCostUsd, type ChallengeModel } from '../src/lib/challenge/models';
import { challengeClosedRequest, hasC2pa, parseClosed, toWide } from '../src/lib/images/closed';
import type { SheetModel } from '../src/lib/images/sheet-models';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, retentionCheck, type ClosedImageModel } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/look-test-2026-11-08');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: look-test-2026-11-08.ts <outdir>');
const FULL = path.join(OUT, 'full');
mkdirSync(FULL, { recursive: true });
mkdirSync(DOC, { recursive: true });

const CAP = 15;
const STOP_AT = 14;
const SEED = 20261108;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens; // 1,200, as the challenge route passes
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
if (!GW_KEY || !FAL_KEY) throw new Error('missing a key');
const fakeRequest = new Request('http://localhost/local-script');

export const REFS = {
  zei: { version: 'bffc7b6a-edc7-4fd7-8922-bcab5f8c4c2d', front: { url: 'https://pictures.snowmoon.party/images/readers/131f235227a54b06f6f11253f37a09b5.jpg', sha256: '131f235227a54b06f6f11253f37a09b5001bf5f72326a6c9949a21800990dc7c' },
    side: { url: 'https://pictures.snowmoon.party/images/readers/88d9f91ae1930e35c75b1f1dae4ae7b4.jpg', sha256: '88d9f91ae1930e35c75b1f1dae4ae7b4521dffc0dbc6d140899cb0f1c2763464' },
    back: { url: 'https://pictures.snowmoon.party/images/readers/f976714b5bdc9331b40b1470df16a376.jpg', sha256: 'f976714b5bdc9331b40b1470df16a3768582821db4599af20403815e90b9ae82' } },
  bai: { version: '110d5973-31c2-4d96-9a88-5838d8a6d868', front: { url: 'https://pictures.snowmoon.party/images/readers/01538922456b9bf61192ed291b8f2659.jpg', sha256: '01538922456b9bf61192ed291b8f26595c694599b94eb95be8b60ce931b76a96' } },
} as const;
const readRef = (c: string, view: string) => {
  const b = readFileSync(path.join(OUT, 'refs', `${c}-${view}.jpg`));
  const want = (REFS as any)[c][view].sha256; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (sha(b) !== want) throw new Error(`${c} ${view}: sha256 differs`);
  return b;
};
const REF_SIZE = { width: 576, height: 768 };

export const CHARS = [{ id: 'zei', name: 'Zei' }, { id: 'bai', name: 'Bai' }] as const;
export const STYLE = {
  label: 'Mood', versionId: '712ca63f-de6e-46bf-b3ad-7007b1120e16',
  text: 'Intense, highly detailed graphic novel look. Moody. Expressive. Dark lines, bold colors. Visible brushstrokes.',
  why: 'The remix screen starts on the picture\'s own style when it is listed, else the first listed (makeView). The bases\' style, "Animated series", is not published, and there are no presets yet, so the first listed is the newest published style: Mood.',
};
export const LINES = {
  A: KEEP_LINE,
  B: 'Keep the face recognisable; change anything else the words describe.',
} as const;
export const CHANGES = [
  'in a long winter coat and scarf, snow on the shoulders',
  'dressed all in bright red and gold',
  'aged about 70',
  'much taller, with a heavy, broad-shouldered build',
  'mid-leap over a wall, seen from below',
  'furious and shouting',
  'shaved head',
  'as a medieval knight in armour',
  'sitting on a rooftop at night in the rain',
  'with a robot arm and goggles',
  'as a deep-sea diver in a brass helmet, underwater',
  'as a fox',
];

export function promptFor(change: string, name: string, line: 'A' | 'B'): string {
  const p = [change.trim(), `${name} is the person in reference image 1, the main figure.`, STYLE.text.trim(), LINES[line], IMAGES.suffix].join('\n\n');
  if (line === 'A' && p !== remixPrompt({ words: change, name, style: STYLE.text })) throw new Error('line A prompt differs from remixPrompt');
  return p;
}

type ModelKey = 'flux' | 'flux3' | 'qwen' | 'gpt' | 'gemini';
const MODEL_OF: Record<Exclude<ModelKey, 'flux3'>, ChallengeModel> = {
  flux: CHALLENGE_MODELS.find((m) => m.id === 'flux2-klein-4b-edit')!,
  qwen: CHALLENGE_MODELS.find((m) => m.id === 'qwen-image-edit')!,
  gpt: CHALLENGE_MODELS.find((m) => m.id === 'gpt-image-2.5-sunburst')!,
  gemini: CHALLENGE_MODELS.find((m) => m.id === 'gemini-3.1-flash-image')!,
};
const mp = (s: { width: number; height: number }) => (s.width * s.height) / 1e6;
const FAL_UNIT: Record<string, number> = { flux: 0.01, flux3: 0.01, qwen: 0.03 };
const WORST: Record<ModelKey, number> = { flux: 0.0125, flux3: 0.025, qwen: 0.06, gpt: 0.08, gemini: 0.09 };

interface Row { kind: string; model?: ModelKey; character?: string; change?: number; line?: 'A' | 'B'; status: string; cost_usd: number; cost_source: string; worst_usd: number; at: string; [k: string]: unknown }
const ledger: { about: string; cap_usd: number; stop_at_usd: number; seed: number; style: typeof STYLE; lines: typeof LINES; changes: string[]; refs: typeof REFS; prompts: Record<string, string>; calls: Row[] } = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { about: 'Look test 2026-11-08: Zei and Bai, 12 changes x 2 closing lines, FLUX (as the route sends: the front only), FLUX with three sheet views (Zei only), Qwen, GPT, Gemini. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only: nothing published, no database.', cap_usd: CAP, stop_at_usd: STOP_AT, seed: SEED, style: STYLE, lines: LINES, changes: CHANGES, refs: REFS, prompts: {}, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n, c) => n + c.cost_usd, 0);
let inflight = 0;
class Stop extends Error {}
let stopped: string | null = null;
const reserve = (what: string, worst: number) => {
  const after = spent() + inflight + worst;
  if (after > STOP_AT + 1e-9) throw new Stop(`STOP before ${what}: spent $${spent().toFixed(4)} + in flight $${inflight.toFixed(4)} + worst $${worst.toFixed(4)} = $${after.toFixed(4)} > $${STOP_AT}`);
  inflight += worst;
};
const now = () => new Date().toISOString();

const guardOk = new Map<string, boolean>();
for (const c of ledger.calls) if (c.kind === 'guard') guardOk.set(c.prompt_sha256 as string, c.status === 'ok');
async function guard(prompt: string): Promise<boolean> {
  const h = sha(Buffer.from(prompt));
  ledger.prompts[h] = prompt;
  if (guardOk.has(h)) return guardOk.get(h)!;
  const name = blockedName(prompt);
  if (name) {
    ledger.calls.push({ kind: 'guard', prompt_sha256: h, status: 'blocked-name', note: name, cost_usd: 0, cost_source: 'no call', worst_usd: 0, at: now() });
    guardOk.set(h, false); save(); return false;
  }
  const worst = guardWorstUsd(prompt.length, GUARD_TOKENS);
  reserve('a prompt check', worst);
  try {
    const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
    ledger.calls.push({ kind: 'guard', prompt_sha256: h, endpoint: IMAGES.guardModel, host: `Vercel AI Gateway${g.provider ? ` (${g.provider})` : ''}`, max_tokens: GUARD_TOKENS, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, cost_usd: g.costUsd, cost_source: 'reported', worst_usd: worst, at: now() });
    guardOk.set(h, g.allow);
    return g.allow;
  } finally { inflight -= worst; save(); }
}

async function falCall(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`https://fal.run/${endpoint}`, { method: 'POST', headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' }, body: JSON.stringify(body) });
  const billing: Record<string, string> = {};
  res.headers.forEach((v, k) => { if (/bill|cost|unit|price/i.test(k)) billing[k] = v; });
  const text = await res.text();
  let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = JSON.parse(text); } catch { /* not json */ }
  return { res, j, text, billing, requestId: res.headers.get('x-fal-request-id') };
}
const refusalText = /safety|moderat|content.?polic|nsfw|blocked|prohibited|not allowed|violat|IMAGE_SAFETY|PROHIBITED|refus/i;

async function picture(model: ModelKey, ch: (typeof CHARS)[number], ci: number, line: 'A' | 'B', attempt: number): Promise<void> {
  const prompt = promptFor(CHANGES[ci], ch.name, line);
  const h = sha(Buffer.from(prompt));
  const file = `c${String(ci + 1).padStart(2, '0')}-${ch.id}-${line}-${model}.jpg`;
  const worst = WORST[model];
  const base = { kind: 'picture', model, character: ch.id, change: ci + 1, line, prompt_sha256: h };
  reserve(`${model} ${ch.id} ${ci + 1}${line}`, worst);
  let row: Row;
  try {
    if (model === 'flux' || model === 'flux3' || model === 'qwen') {
      const views = model === 'flux3' ? ['front', 'side', 'back'] : ['front'];
      const refs = views.map((v) => readRef(ch.id, v));
      const endpoint = model === 'qwen' ? QWEN.endpoint : IMAGES.editModel.endpoint;
      const settings = { image_size: { width: IMAGES.size.width, height: IMAGES.size.height }, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', sync_mode: true, seed: SEED };
      const r = await falCall(endpoint, { prompt, image_urls: refs.map((b) => `data:image/jpeg;base64,${b.toString('base64')}`), ...settings });
      const url: string = r.j.images?.[0]?.url ?? '';
      const mm = url.match(/^data:([^;]+);base64,(.+)$/);
      const units = r.billing['x-fal-billable-units'] !== undefined && Number.isFinite(Number(r.billing['x-fal-billable-units'])) ? Number(r.billing['x-fal-billable-units']) : null;
      if (!r.res.ok || !mm) {
        const refused = r.res.status === 422 || refusalText.test(r.text);
        row = { ...base, endpoint, host: 'fal.ai', request_id: r.requestId, seed: SEED, status: refused ? 'refused' : 'error', note: `${r.res.status} ${r.text.slice(0, 300)}`, cost_usd: refused ? 0 : worst, cost_source: refused ? 'fal refused before running (4xx): not billed' : 'unknown: worst case counted', worst_usd: worst, billing_headers: r.billing, at: now() };
      } else {
        const raw = Buffer.from(mm[2], 'base64');
        const nsfw = Boolean(r.j.has_nsfw_concepts?.[0]);
        const meta = await sharp(raw).metadata();
        let out = raw; let crop: unknown = null;
        if (model === 'qwen') { const w = await toWide(raw, IMAGES.size); out = w.bytes; crop = { words: w.words, ...w.crop }; }
        writeFileSync(path.join(FULL, file), out);
        const est = model === 'qwen' ? qwenCostUsd({ width: meta.width!, height: meta.height! }) : (mp(IMAGES.size) + refs.length * mp(REF_SIZE)) * IMAGES.editPricePerMp;
        row = { ...base, endpoint, host: 'fal.ai', references: views.map((v) => `${ch.id} ${v}`), request_id: r.requestId, seed: typeof r.j.seed === 'number' ? r.j.seed : SEED, status: nsfw ? 'filtered' : 'ok', note: nsfw ? 'fal safety checker flagged it (has_nsfw_concepts)' : undefined,
          cost_usd: units !== null ? units * FAL_UNIT[model] : est, cost_source: units !== null ? `fal's x-fal-billable-units (${units}) x $${FAL_UNIT[model]}/megapixel` : 'estimate: no billable units reported', estimate_usd: est, worst_usd: worst, billing_headers: r.billing,
          sha256: sha(out), original_sha256: sha(raw), original_size: `${meta.width}x${meta.height}`, crop, file, settings, at: now() };
      }
    } else {
      const m = MODEL_OF[model];
      const ref = readRef(ch.id, 'front');
      const req = challengeClosedRequest(m, prompt, ref);
      assertGatewayOptions(m.id as ClosedImageModel, req.body as never);
      const res = await fetch(req.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
      const text = await res.text();
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const reported = Number(model === 'gpt' ? j.providerMetadata?.gateway?.cost : (j.usage?.cost ?? j.providerMetadata?.gateway?.cost));
      const ok = Number.isFinite(reported);
      try {
        const pic = parseClosed({ id: m.id } as SheetModel, res.status, j);
        const meta = await sharp(pic.bytes).metadata();
        const w = await toWide(pic.bytes, IMAGES.size);
        writeFileSync(path.join(FULL, file), w.bytes);
        row = { ...base, endpoint: m.call.endpoint, host: m.call.host, request_id: pic.requestId, seed: null, status: 'ok', cost_usd: ok ? reported : worst, cost_source: ok ? 'reported by the gateway' : 'not reported: worst case counted', worst_usd: worst,
          sha256: sha(w.bytes), original_sha256: sha(pic.bytes), original_size: `${meta.width}x${meta.height}`, crop: { words: w.words, ...w.crop }, file, settings: req.settings, content_credentials: hasC2pa(pic.bytes) ? 'C2PA manifest in the original' : 'none found', usage: j.usage ?? null, at: now() };
      } catch (e) {
        const detail = JSON.stringify({ status: res.status, error: j.error ?? null, finish: j.choices?.[0]?.finish_reason ?? null, native: j.choices?.[0]?.native_finish_reason ?? null, text: typeof j.choices?.[0]?.message?.content === 'string' ? j.choices[0].message.content.slice(0, 300) : null }).slice(0, 600);
        const refused = refusalText.test(text) || (res.ok && model === 'gemini');
        row = { ...base, endpoint: m.call.endpoint, host: m.call.host, request_id: j.id ?? j.providerMetadata?.gateway?.generationId ?? null, seed: null, status: refused ? 'refused' : 'error', note: `${(e as Error).message}; ${detail}`, cost_usd: ok ? reported : (res.status >= 400 && res.status < 500 ? 0 : worst), cost_source: ok ? 'reported by the gateway' : res.status >= 400 && res.status < 500 ? `${res.status}: not billed` : 'unknown: worst case counted', worst_usd: worst, usage: j.usage ?? null, at: now() };
      }
    }
  } catch (e) {
    if (e instanceof Stop) throw e;
    row = { ...base, status: 'error', note: String((e as Error).message).slice(0, 300), cost_usd: worst, cost_source: 'unknown: worst case counted', worst_usd: worst, at: now() };
  } finally { inflight -= worst; }
  row.attempt = attempt;
  ledger.calls.push(row);
  save();
  console.log(`${model} ${ch.id} ${ci + 1}${line}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})${row.note ? ` ${String(row.note).slice(0, 160)}` : ''}`);
  if (row.status === 'error' && attempt === 1) return picture(model, ch, ci, line, 2);
}

async function pass(model: ModelKey, concurrency: number) {
  const key = (c: Row) => `${c.character}|${c.change}|${c.line}`;
  const settled = new Set<string>(); const attempts = new Map<string, number>();
  for (const c of ledger.calls) if (c.kind === 'picture' && c.model === model) { attempts.set(key(c), (attempts.get(key(c)) ?? 0) + 1); if (c.status !== 'error') settled.add(key(c)); }
  const jobs: [(typeof CHARS)[number], number, 'A' | 'B'][] = [];
  for (const ch of CHARS) {
    if (model === 'flux3' && ch.id !== 'zei') continue; // Bai's base has a front view only
    for (let ci = 0; ci < CHANGES.length; ci++) for (const line of ['A', 'B'] as const) {
      const k = `${ch.id}|${ci + 1}|${line}`;
      if (!settled.has(k) && (attempts.get(k) ?? 0) < 2) jobs.push([ch, ci, line]);
    }
  }
  console.log(`== ${model}: ${jobs.length} to make`);
  let i = 0;
  const worker = async () => {
    while (i < jobs.length && !stopped) {
      const [ch, ci, line] = jobs[i++];
      const prompt = promptFor(CHANGES[ci], ch.name, line);
      let allowed: boolean;
      try { allowed = await guard(prompt); } catch (e) { if (e instanceof Stop) throw e; console.log(`prompt check failed: ${(e as Error).message}`); continue; }
      if (!allowed) {
        if (!ledger.calls.some((c) => c.kind === 'picture' && c.model === model && key(c) === `${ch.id}|${ci + 1}|${line}`)) {
          ledger.calls.push({ kind: 'picture', model, character: ch.id, change: ci + 1, line, prompt_sha256: sha(Buffer.from(prompt)), status: 'guard-refused', note: 'the site\'s prompt check refused the prompt: no picture asked for', cost_usd: 0, cost_source: 'no call', worst_usd: 0, at: now() });
          save();
          console.log(`${model} ${ch.id} ${ci + 1}${line}: guard-refused`);
        }
        continue;
      }
      await picture(model, ch, ci, line, (attempts.get(`${ch.id}|${ci + 1}|${line}`) ?? 0) + 1);
    }
  };
  const safe = async () => { try { await worker(); } catch (e) { if (e instanceof Stop) stopped = e.message; else throw e; } };
  await Promise.all(Array.from({ length: concurrency }, safe));
  if (stopped) throw new Stop(stopped);
}

async function guardAll() {
  // Every distinct prompt checked first, before any picture.
  for (const ch of CHARS) for (let ci = 0; ci < CHANGES.length; ci++) for (const line of ['A', 'B'] as const) {
    try { await guard(promptFor(CHANGES[ci], ch.name, line)); } catch (e) { if (e instanceof Stop) throw e; console.log(`prompt check failed: ${(e as Error).message}`); }
  }
  const refused = ledger.calls.filter((c) => c.kind === 'guard' && c.status !== 'ok').length;
  console.log(`prompt checks: ${Object.keys(ledger.prompts).length} prompts, ${refused} refused`);
}

async function endpointList(model: 'gpt' | 'gemini') {
  const { refusal, retention } = await retentionCheck(MODEL_OF[model].id as ClosedImageModel);
  ledger.calls.push({ kind: 'endpoint-list', model, status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, cost_source: 'free GET', worst_usd: 0, at: now() });
  save();
  if (refusal) throw new Stop(refusal);
}

const only = (process.env.ONLY ?? 'guard,flux,flux3,qwen,gpt,gemini').split(',');
try {
  for (const step of only) {
    if (step === 'guard') { await guardAll(); continue; }
    const model = step as ModelKey;
    if (model === 'gpt' || model === 'gemini') await endpointList(model);
    await pass(model, model === 'gpt' || model === 'gemini' ? 4 : 3);
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
} catch (e) {
  if (e instanceof Stop) { console.log(e.message); save(); process.exit(2); }
  throw e;
}
