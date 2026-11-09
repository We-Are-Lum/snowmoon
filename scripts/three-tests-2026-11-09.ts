/**
 * Three owner-approved tests (2026-11-09), cap $3.00 for the run, stop before $2.80. Test pictures only: NO database,
 * NO storage, nothing published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 * Prompts are the route's own (src/lib/challenge/make.ts remixPrompt, origin/challenge-models 9294643d merged in):
 * the change words, the reference line, the character's look line (src/lib/challenge/looks.ts, lookFor), no style text
 * ("Same as this picture", the default), KEEP_LINE (now line B), the no-lettering line.
 *
 * 1. flux: FLUX.2 [klein] 4B edit, Bai's base front only, 5 changes, BEFORE (no look line) and AFTER (Bai's look line),
 *    the same seed for both.
 * 2. qwen2511: fal-ai/qwen-image-edit-2511, Bai, the look test's 12 changes, look line on; fal's billed units recorded;
 *    cropped to 16:9 as the route crops Qwen (toWide).
 * 3. geminiF3: Gemini 3.1 Flash Image through the Vercel AI Gateway (vertex only, zero data retention, no training),
 *    the base front contain-padded to 16:9 with its own corner colour by the site's toView (src/lib/images/closed.ts),
 *    look line on, Zei and Bai, changes 2, 3, 4, 8, 1, 7, 11, 12.
 * Prompt check (1,200 tokens) on every prompt first. Ledger after every call; one retry on an error, none on a refusal.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/three-tests-2026-11-09.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { remixPrompt } from '../src/lib/challenge/make';
import { lookFor } from '../src/lib/challenge/looks';
import { CHALLENGE_MODELS, QWEN } from '../src/lib/challenge/models';
import { challengeClosedRequest, hasC2pa, parseClosed, toView, toWide } from '../src/lib/images/closed';
import type { SheetModel } from '../src/lib/images/sheet-models';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, retentionCheck } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/three-tests-2026-11-09');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: three-tests-2026-11-09.ts <outdir>');
const REFS = path.join(OUT, '..', 'look-test', 'refs');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 2.8;
const SEED = 20261108;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const QWEN_2511 = 'fal-ai/qwen-image-edit-2511';
const WORST = { flux: 0.0125, qwen2511: 0.09, geminiF3: 0.09 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
if (!GW_KEY || !FAL_KEY) throw new Error('missing a key');
const fakeRequest = new Request('http://localhost/local-script');

const FRONT_SHA: Record<string, string> = { zei: '131f235227a54b06f6f11253f37a09b5001bf5f72326a6c9949a21800990dc7c', bai: '01538922456b9bf61192ed291b8f26595c694599b94eb95be8b60ce931b76a96' };
const NAME: Record<string, string> = { zei: 'Zei', bai: 'Bai' };
export const CHANGES = [
  'in a long winter coat and scarf, snow on the shoulders', 'dressed all in bright red and gold', 'aged about 70', 'much taller, with a heavy, broad-shouldered build',
  'mid-leap over a wall, seen from below', 'furious and shouting', 'shaved head', 'as a medieval knight in armour', 'sitting on a rooftop at night in the rain',
  'with a robot arm and goggles', 'as a deep-sea diver in a brass helmet, underwater', 'as a fox',
];
const FLUX_CHANGES = [8, 11, 4, 3, 7];
const GEMINI_CHANGES = [2, 3, 4, 8, 1, 7, 11, 12];

/** The route's prompt: remixPrompt with "Same as this picture" (no style text), with or without the look line. */
export const promptFor = (change: number, ch: string, look: boolean) => remixPrompt({ words: CHANGES[change - 1], name: NAME[ch], look: look ? lookFor(ch) : '', style: '' });

const ledger: { about: string; cap_usd: number; stop_at_usd: number; seed: number; prompts: Record<string, string>; calls: any[] } = existsSync(LEDGER) // eslint-disable-line @typescript-eslint/no-explicit-any
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { about: 'Three tests 2026-11-09: FLUX look line before/after (Bai), Qwen-Image-Edit 2511 (Bai), Gemini F3 (padded reference). Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.', cap_usd: 3, stop_at_usd: STOP_AT, seed: SEED, prompts: {}, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
class Stop extends Error {}
const gate = (what: string, worst: number) => { if (spent() + worst > STOP_AT + 1e-9) throw new Stop(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${STOP_AT}`); };

const guardOk = new Map<string, boolean>();
for (const c of ledger.calls) if (c.kind === 'guard') guardOk.set(c.prompt_sha256, c.status === 'ok');
async function guard(prompt: string): Promise<boolean> {
  const h = sha(Buffer.from(prompt));
  ledger.prompts[h] = prompt;
  if (guardOk.has(h)) return guardOk.get(h)!;
  const bn = blockedName(prompt);
  if (bn) { ledger.calls.push({ kind: 'guard', prompt_sha256: h, status: 'blocked-name', note: bn, cost_usd: 0, at: now() }); guardOk.set(h, false); save(); return false; }
  const w = guardWorstUsd(prompt.length, GUARD_TOKENS);
  gate('a prompt check', w);
  const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
  ledger.calls.push({ kind: 'guard', prompt_sha256: h, max_tokens: GUARD_TOKENS, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, cost_usd: g.costUsd, cost_source: 'reported', worst_usd: w, at: now() });
  guardOk.set(h, g.allow); save();
  return g.allow;
}

const front = (ch: string) => {
  const b = readFileSync(path.join(REFS, `${ch}-front.jpg`));
  if (sha(b) !== FRONT_SHA[ch]) throw new Error(`${ch}: reference sha256 differs`);
  return b;
};

async function fal(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`https://fal.run/${endpoint}`, { method: 'POST', headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' }, body: JSON.stringify(body) });
  const billing: Record<string, string> = {};
  res.headers.forEach((v, k) => { if (/bill|cost|unit|price/i.test(k)) billing[k] = v; });
  const text = await res.text();
  let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = JSON.parse(text); } catch { /* not json */ }
  return { res, j, text, billing, requestId: res.headers.get('x-fal-request-id') };
}

type Job = { test: 'flux' | 'qwen2511' | 'geminiF3'; ch: string; change: number; look: boolean; file: string };
async function make(job: Job, attempt: number): Promise<void> {
  const prompt = promptFor(job.change, job.ch, job.look);
  const h = sha(Buffer.from(prompt));
  if (!(await guard(prompt))) {
    ledger.calls.push({ kind: 'picture', ...job, prompt_sha256: h, status: 'guard-refused', cost_usd: 0, cost_source: 'no call', at: now() }); save();
    console.log(`${job.file}: prompt check refused`); return;
  }
  const worst = WORST[job.test];
  gate(job.file, worst);
  let row: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    if (job.test === 'flux' || job.test === 'qwen2511') {
      const endpoint = job.test === 'flux' ? IMAGES.editModel.endpoint : QWEN_2511;
      const settings = { image_size: { width: IMAGES.size.width, height: IMAGES.size.height }, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', sync_mode: true, seed: SEED };
      const r = await fal(endpoint, { prompt, image_urls: [`data:image/jpeg;base64,${front(job.ch).toString('base64')}`], ...settings });
      const units = r.billing['x-fal-billable-units'] !== undefined && Number.isFinite(Number(r.billing['x-fal-billable-units'])) ? Number(r.billing['x-fal-billable-units']) : null;
      const unit = job.test === 'flux' ? IMAGES.editPricePerMp : QWEN.pricePerMp;
      const url: string = r.j.images?.[0]?.url ?? '';
      const mm = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!r.res.ok || !mm) {
        const refused = r.res.status === 422 || /content|policy|safety|nsfw/i.test(r.text);
        row = { kind: 'picture', ...job, endpoint, host: 'fal.ai', prompt_sha256: h, request_id: r.requestId, status: refused ? 'refused' : 'error', note: `${r.res.status} ${r.text.slice(0, 300)}`, cost_usd: refused ? 0 : worst, cost_source: refused ? '4xx: not billed' : 'unknown: worst counted', billing_headers: r.billing, at: now() };
      } else {
        const raw = Buffer.from(mm[2], 'base64');
        const meta = await sharp(raw).metadata();
        const nsfw = Boolean(r.j.has_nsfw_concepts?.[0]);
        let out = raw; let crop: unknown = null;
        if (job.test === 'qwen2511') { const w = await toWide(raw, IMAGES.size); out = w.bytes; crop = { words: w.words, ...w.crop }; }
        writeFileSync(path.join(OUT, 'full', job.file), out);
        row = { kind: 'picture', ...job, endpoint, host: 'fal.ai', prompt_sha256: h, request_id: r.requestId, seed: typeof r.j.seed === 'number' ? r.j.seed : SEED, status: nsfw ? 'filtered' : 'ok',
          cost_usd: units !== null ? units * unit : worst, cost_source: units !== null ? `fal's x-fal-billable-units (${units}) x $${unit}/megapixel` : 'no billable units reported: worst counted', billing_headers: r.billing,
          sha256: sha(out), original_sha256: sha(raw), original_size: `${meta.width}x${meta.height}`, crop, settings, at: now() };
      }
    } else {
      const m = CHALLENGE_MODELS.find((x) => x.id === 'gemini-3.1-flash-image')!;
      const ref = await toView(front(job.ch), IMAGES.size);
      const req = challengeClosedRequest(m, prompt, ref);
      assertGatewayOptions('gemini-3.1-flash-image', req.body as never);
      const res = await fetch(req.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
      const text = await res.text();
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const reported = Number(j.usage?.cost ?? j.providerMetadata?.gateway?.cost);
      const ok = Number.isFinite(reported);
      const reference = { from_sha256: FRONT_SHA[job.ch], sent_sha256: sha(ref), how: `toView(front, ${IMAGES.size.width}x${IMAGES.size.height}): contain, padded with its own top-left colour, JPEG q92` };
      try {
        const pic = parseClosed({ id: m.id } as SheetModel, res.status, j);
        const meta = await sharp(pic.bytes).metadata();
        const w = await toWide(pic.bytes, IMAGES.size);
        writeFileSync(path.join(OUT, 'full', job.file), w.bytes);
        row = { kind: 'picture', ...job, endpoint: m.call.endpoint, host: m.call.host, prompt_sha256: h, reference, request_id: pic.requestId, status: 'ok', cost_usd: ok ? reported : worst, cost_source: ok ? 'reported by the gateway' : 'worst counted',
          sha256: sha(w.bytes), original_sha256: sha(pic.bytes), original_size: `${meta.width}x${meta.height}`, crop: { words: w.words, ...w.crop }, settings: req.settings, content_credentials: hasC2pa(pic.bytes) ? 'C2PA manifest in the original' : 'none found', usage: j.usage ?? null, at: now() };
      } catch (e) {
        const refused = res.ok || /safety|policy|blocked|prohibit/i.test(text);
        row = { kind: 'picture', ...job, endpoint: m.call.endpoint, host: m.call.host, prompt_sha256: h, reference, status: refused ? 'refused' : 'error', note: `${(e as Error).message} ${text.slice(0, 300)}`, cost_usd: ok ? reported : (res.status >= 400 && res.status < 500 ? 0 : worst), cost_source: ok ? 'reported by the gateway' : 'not reported', at: now() };
      }
    }
  } catch (e) {
    if (e instanceof Stop) throw e;
    row = { kind: 'picture', ...job, prompt_sha256: h, status: 'error', note: String((e as Error).message).slice(0, 300), cost_usd: worst, cost_source: 'unknown: worst counted', at: now() };
  }
  row.attempt = attempt; row.worst_usd = worst;
  ledger.calls.push(row); save();
  console.log(`${job.file}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})${row.note ? ` ${String(row.note).slice(0, 140)}` : ''}`);
  if (row.status === 'error' && attempt === 1) return make(job, 2);
}

const jobs: Job[] = [];
for (const c of FLUX_CHANGES) for (const look of [false, true]) jobs.push({ test: 'flux', ch: 'bai', change: c, look, file: `flux-c${String(c).padStart(2, '0')}-bai-${look ? 'look' : 'nolook'}.jpg` });
for (let c = 1; c <= 12; c++) jobs.push({ test: 'qwen2511', ch: 'bai', change: c, look: true, file: `qwen2511-c${String(c).padStart(2, '0')}-bai.jpg` });
for (const c of GEMINI_CHANGES) for (const ch of ['zei', 'bai']) jobs.push({ test: 'geminiF3', ch, change: c, look: true, file: `geminiF3-c${String(c).padStart(2, '0')}-${ch}.jpg` });

async function main() {
  const only = (process.env.ONLY ?? 'flux,qwen2511,geminiF3').split(',');
  try {
    for (const test of ['flux', 'qwen2511', 'geminiF3'] as const) {
      if (!only.includes(test)) continue;
      if (test === 'geminiF3') {
        const { refusal, retention } = await retentionCheck('gemini-3.1-flash-image');
        ledger.calls.push({ kind: 'endpoint-list', status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, cost_source: 'free GET', at: now() }); save();
        if (refusal) throw new Stop(refusal);
      }
      for (const job of jobs.filter((j) => j.test === test)) {
        if (ledger.calls.some((c: any) => c.kind === 'picture' && c.file === job.file && c.status !== 'error')) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
        const tries = ledger.calls.filter((c: any) => c.kind === 'picture' && c.file === job.file).length; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (tries >= 2) continue;
        await make(job, tries + 1);
      }
    }
    console.log(`DONE spent $${spent().toFixed(4)}`);
  } catch (e) {
    if (e instanceof Stop) { console.log(e.message); save(); process.exit(2); }
    throw e;
  }
}
main();
