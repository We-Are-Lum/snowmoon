/**
 * The challenge's style test of 2026-11-08 (owner-approved; widened the same day): one picture per style (15) from each
 * of the six characters' current default look (CHALLENGE.defaultLooks, its front view) on each of the four challenge
 * models (src/lib/challenge/models.ts), with the prompt the remix screen would build with an empty change box. The
 * project's own test pictures: NO database, NO storage, nothing published. Drafted by the coding agent (Claude, a closed
 * model by Anthropic).
 *
 * Cap: $25 in all; the script stops before any call that would take spent + in-flight worst cases + that call's worst
 * case past $23.50 (the owner is asked before the last stretch). Spent counts each call's reported cost, or its worst
 * case when none is reported (an error with unknown billing counts its worst case too).
 *
 * Calls: the site's prompt check (blockedName, then checkPrompt through the Vercel AI Gateway; GROQ_API_KEY removed: the
 * site's chat key is never used for batch jobs), the open models on fal.ai (sync mode, X-Fal-Store-IO: 0, the safety
 * checker on, one fixed seed), the closed models only through the Vercel AI Gateway with the site's own challenge request
 * (src/lib/images/closed.ts challengeClosedRequest: GPT pinned to openai, no prompt training; Gemini pinned to vertex,
 * zero data retention, no prompt training), each body checked by scripts/lib/batch-model.ts assertGatewayOptions and
 * each model's provider checked on the gateway's endpoint list first (retentionCheck).
 *
 * Order: FLUX (all characters), Qwen, GPT, Gemini; ledger written after every call; one retry on an error, none on a
 * refusal. Re-running resumes: done or refused pictures are skipped.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/style-test-2026-11-08.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { CHALLENGE_MODELS, QWEN, type ChallengeModel } from '../src/lib/challenge/models';
import { challengeClosedRequest, hasC2pa, parseClosed, toView } from '../src/lib/images/closed';
import type { SheetModel } from '../src/lib/images/sheet-models';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, retentionCheck, type ClosedImageModel } from './lib/batch-model';
import { STYLES_LIST } from './style-test-2026-11-08-styles';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/style-test-2026-11-08');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: style-test-2026-11-08.ts <outdir with refs/>');
const FULL = path.join(OUT, 'full');
mkdirSync(FULL, { recursive: true });
mkdirSync(DOC, { recursive: true });

const CAP = 25;
const STOP_AT = 23.5;
const SEED = 20261108;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
if (!GW_KEY || !FAL_KEY) throw new Error('missing a key');
const fakeRequest = new Request('http://localhost/local-script');

// The characters, their call names, and their default looks' fronts (read from the public reference pages, sha256 checked).
const CHARS = ['zei', 'gladias', 'bai', 'seila', 'deluin', 'mu'] as const;
const CALL: Record<string, string> = { zei: 'Zei', gladias: 'Gladias', bai: 'Bai', seila: 'Seila', deluin: 'Deluin', mu: 'Mu' };
const REFS = JSON.parse(readFileSync(path.join(OUT, 'refs/refs.json'), 'utf8')) as Record<string, { version: string; url: string; sha256: string }>;
const refBytes = (c: string) => {
  const b = readFileSync(path.join(OUT, 'refs', `${c}.jpg`));
  if (sha(b) !== REFS[c].sha256) throw new Error(`${c}: reference sha256 differs`);
  return b;
};
const REF_SIZE = { width: 576, height: 768 };

export const STYLES = STYLES_LIST;

/** The remix prompt with an empty change box: the keep-the-character line, the style, the keep line, the no-words line. */
export const promptFor = (name: string, style: string) => [
  `${name} is the person in reference image 1, the main figure, in the foreground: keep their face, hair and clothes exactly as in reference image 1.`,
  `Style: ${style}`,
  'Keep the same character: face, hair, build and clothes, unless the change says otherwise.',
  IMAGES.suffix,
].join('\n\n');

type ModelKey = 'flux' | 'qwen' | 'gpt' | 'gemini';
const MODEL_OF: Record<ModelKey, ChallengeModel> = {
  flux: CHALLENGE_MODELS.find((m) => m.id === 'flux2-klein-4b-edit')!,
  qwen: CHALLENGE_MODELS.find((m) => m.id === 'qwen-image-edit')!,
  gpt: CHALLENGE_MODELS.find((m) => m.id === 'gpt-image-2.5-sunburst')!,
  gemini: CHALLENGE_MODELS.find((m) => m.id === 'gemini-3.1-flash-image')!,
};
const mp = (s: { width: number; height: number }) => (s.width * s.height) / 1e6;
const FLUX_EST = (mp(IMAGES.size) + mp(REF_SIZE)) * IMAGES.editPricePerMp; // $0.0103
/** fal's listed unit prices (GET api.fal.ai/v1/models/pricing, read 2026-11-08): USD per megapixel. */
const FAL_UNIT: Record<string, number> = { flux: 0.01, qwen: 0.03 };
const WORST: Record<ModelKey, number> = {
  flux: 0.0125,
  qwen: QWEN.pricePerMp * 2, // both megapixel counts rounded up to 1: $0.06 (the safe ceiling; fal's rounding is being measured)
  gpt: 0.08,
  gemini: 0.09,
};

interface Row {
  kind: 'guard' | 'picture' | 'endpoint-list' | 'adjustment';
  model?: ModelKey; character?: string; style?: string; prompt_sha256?: string;
  endpoint?: string; host?: string; request_id?: string | null; seed?: number | null;
  status: 'ok' | 'refused' | 'filtered' | 'error' | 'blocked-name' | 'guard-refused';
  cost_usd: number; cost_source: string; worst_usd: number;
  sha256?: string; original_sha256?: string; file?: string; out_size?: string; crop?: string; note?: string; billing_headers?: Record<string, string>;
  at: string; [k: string]: unknown;
}
const ledger: { about: string; cap_usd: number; stop_at_usd: number; seed: number; refs: typeof REFS; prompts: Record<string, string>; calls: Row[] } = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { about: 'Style test 2026-11-08: 15 styles x 6 characters x 4 models, empty change box. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only: nothing published, no database.', cap_usd: CAP, stop_at_usd: STOP_AT, seed: SEED, refs: REFS, prompts: {}, calls: [] };
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

// ---- prompt check: once per distinct prompt, as the site would before a picture.
/**
 * The prompt check's token budget. The challenge route (src/app/api/challenge/make/route.ts on challenge-models) passes
 * none, so checkPrompt's default of 400 applies; at 400, 62 of the first 90 checks spent every token reasoning and gave no
 * answer ('unclear', a refusal). Remix and sheet views pass 1,200 (REMIX.guardMaxTokens, IMAGES.designs.guardMaxTokens);
 * this test asks again at 1,200, and both runs stay in the ledger (a finding for the challenge route).
 */
const GUARD_TOKENS = 1200;
const guardOk = new Map<string, boolean>();
// A check at 400 tokens that ran out before answering ('unclear') is asked again at 1,200 (see GUARD_TOKENS).
for (const c of ledger.calls) if ((c.kind === 'guard' || c.status === 'blocked-name') && !c.superseded) guardOk.set(c.prompt_sha256!, c.status === 'ok');
async function guard(prompt: string): Promise<boolean> {
  const h = sha(Buffer.from(prompt));
  ledger.prompts[h] = prompt;
  if (guardOk.has(h)) return guardOk.get(h)!;
  const name = blockedName(prompt);
  if (name) {
    ledger.calls.push({ kind: 'guard', prompt_sha256: h, status: 'blocked-name', note: `blocked name: ${name}`, cost_usd: 0, cost_source: 'no call', worst_usd: 0, at: now() });
    guardOk.set(h, false); save(); return false;
  }
  const worst = guardWorstUsd(prompt.length, GUARD_TOKENS);
  reserve('a prompt check', worst);
  try {
    const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
    ledger.calls.push({ kind: 'guard', prompt_sha256: h, endpoint: IMAGES.guardModel, host: `Vercel AI Gateway${g.provider ? ` (${g.provider})` : ''}`, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, max_tokens: GUARD_TOKENS, cost_usd: g.costUsd, cost_source: 'reported', worst_usd: worst, at: now() });
    guardOk.set(h, g.allow);
    return g.allow;
  } finally { inflight -= worst; save(); }
}

// ---- the open models on fal.ai, as src/lib/images/fal.ts calls them, with one fixed seed.
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

async function picture(model: ModelKey, character: string, style: (typeof STYLES)[number], attempt = 1): Promise<void> {
  const prompt = promptFor(CALL[character], style.text);
  const h = sha(Buffer.from(prompt));
  const m = MODEL_OF[model];
  const ref = refBytes(character);
  const file = `${style.id}-${character}-${model}.jpg`;
  const base: Partial<Row> = { kind: 'picture', model, character, style: style.id, prompt_sha256: h, endpoint: m.call.endpoint, host: m.call.host };
  const worst = WORST[model];
  reserve(`${model} ${character} ${style.id}`, worst);
  let row: Row;
  try {
    if (model === 'flux' || model === 'qwen') {
      const settings = { image_size: { width: IMAGES.size.width, height: IMAGES.size.height }, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', sync_mode: true, seed: SEED };
      const r = await falCall(m.call.endpoint, { prompt, image_urls: [`data:image/jpeg;base64,${ref.toString('base64')}`], ...settings });
      const est = model === 'flux' ? FLUX_EST : QWEN.pricePerMp * (Math.max(1, mp(IMAGES.size)) + mp(REF_SIZE));
      const url: string = r.j.images?.[0]?.url ?? '';
      const mm = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!r.res.ok || !mm) {
        const refused = r.res.status === 422 || refusalText.test(r.text);
        // A failed fal call isn't billed as a rule, but nothing reports it: count the worst case unless it was a 4xx validation refusal.
        row = { ...base, request_id: r.requestId, seed: SEED, status: refused ? 'refused' : 'error', note: `${r.res.status} ${r.text.slice(0, 300)}`, cost_usd: refused ? 0 : worst, cost_source: refused ? 'fal refused before running (4xx): not billed' : 'unknown: worst case counted', worst_usd: worst, billing_headers: r.billing, at: now() } as Row;
      } else {
        const bytes = Buffer.from(mm[2], 'base64');
        const nsfw = Boolean(r.j.has_nsfw_concepts?.[0]);
        const units = r.billing['x-fal-billable-units'] !== undefined && Number.isFinite(Number(r.billing['x-fal-billable-units'])) ? Number(r.billing['x-fal-billable-units']) : null;
        writeFileSync(path.join(FULL, file), bytes);
        const meta = await sharp(bytes).metadata();
        row = { ...base, request_id: r.requestId, seed: typeof r.j.seed === 'number' ? r.j.seed : SEED, status: nsfw ? 'filtered' : 'ok', note: nsfw ? 'fal safety checker flagged it (has_nsfw_concepts)' : undefined, cost_usd: units !== null ? units * FAL_UNIT[model] : est, cost_source: units !== null ? `fal's x-fal-billable-units (${units}) x its listed unit price ($${FAL_UNIT[model]}/megapixel, fal pricing API)` : 'estimate: fal reported no billable units', estimate_usd: est, worst_usd: worst, billing_headers: r.billing, sha256: sha(bytes), file, out_size: `${meta.width}x${meta.height}`, settings, at: now() } as Row;
      }
    } else {
      const body = challengeClosedRequest(m, prompt, ref);
      assertGatewayOptions(m.id as ClosedImageModel, body.body as never);
      const res = await fetch(body.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body.body) });
      const text = await res.text();
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const reported = Number(model === 'gpt' ? j.providerMetadata?.gateway?.cost : (j.usage?.cost ?? j.providerMetadata?.gateway?.cost));
      try {
        const pic = parseClosed({ id: m.id } as SheetModel, res.status, j);
        const meta = await sharp(pic.bytes).metadata();
        let out: Buffer; let crop: string;
        if (model === 'gpt') {
          // Owner's decision: 3:2 to 16:9 by cropping, most of the removed height from the bottom (heads kept).
          const W = meta.width!, H = meta.height!, keep = Math.round((W * 9) / 16), cut = H - keep, top = Math.round(cut / 4);
          out = await sharp(pic.bytes).extract({ left: 0, top, width: W, height: keep }).resize(IMAGES.size.width, IMAGES.size.height).jpeg({ quality: 92 }).toBuffer();
          crop = `${W}x${H} cropped to ${W}x${keep}: ${top}px off the top, ${cut - top}px off the bottom (owner's decision: heads kept), then scaled to ${IMAGES.size.width}x${IMAGES.size.height}`;
        } else {
          out = await toView(pic.bytes, IMAGES.size);
          crop = `${meta.width}x${meta.height} not cropped: scaled to fit ${IMAGES.size.width}x${IMAGES.size.height}, padded with its own corner colour (the site's toView)`;
        }
        writeFileSync(path.join(FULL, file), out);
        const ok = Number.isFinite(reported);
        row = { ...base, request_id: pic.requestId, seed: null, status: 'ok', cost_usd: ok ? reported : worst, cost_source: ok ? 'reported by the gateway' : 'not reported: worst case counted', worst_usd: worst, sha256: sha(out), original_sha256: sha(pic.bytes), file, out_size: `${IMAGES.size.width}x${IMAGES.size.height}`, original_size: `${meta.width}x${meta.height}`, crop, settings: body.settings, content_credentials: hasC2pa(pic.bytes) ? 'C2PA manifest in the original' : 'none found', usage: j.usage ?? null, at: now() } as Row;
      } catch (e) {
        const msgText = JSON.stringify({ status: res.status, error: j.error ?? null, finish: j.choices?.[0]?.finish_reason ?? null, native: j.choices?.[0]?.native_finish_reason ?? null, text: typeof j.choices?.[0]?.message?.content === 'string' ? j.choices[0].message.content.slice(0, 300) : null }).slice(0, 600) || text.slice(0, 400);
        const refused = refusalText.test(text) || (res.ok && model === 'gemini'); // a 200 with no picture is the model declining
        const ok = Number.isFinite(reported);
        row = { ...base, request_id: j.id ?? j.providerMetadata?.gateway?.generationId ?? null, seed: null, status: refused ? 'refused' : 'error', note: `${(e as Error).message}; ${msgText}`, cost_usd: ok ? reported : (res.status >= 400 && res.status < 500 ? 0 : worst), cost_source: ok ? 'reported by the gateway' : res.status >= 400 && res.status < 500 ? `${res.status}: not billed` : 'unknown: worst case counted', worst_usd: worst, usage: j.usage ?? null, at: now() } as Row;
      }
    }
  } catch (e) {
    if (e instanceof Stop) throw e;
    row = { ...base, status: 'error', note: String((e as Error).message).slice(0, 300), cost_usd: worst, cost_source: 'unknown: worst case counted', worst_usd: worst, at: now() } as Row;
  } finally { inflight -= worst; }
  row.attempt = attempt;
  ledger.calls.push(row);
  save();
  console.log(`${model} ${character} ${style.id}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})${row.note ? ` ${String(row.note).slice(0, 160)}` : ''}`);
  if (row.status === 'error' && attempt === 1) return picture(model, character, style, 2);
}

const doneKey = (c: Row) => `${c.model}|${c.character}|${c.style}`;
async function pass(model: ModelKey, concurrency: number) {
  const settled = new Set<string>();
  const attempts = new Map<string, number>();
  for (const c of ledger.calls) if (c.kind === 'picture' && c.model === model && !c.superseded) {
    attempts.set(doneKey(c), (attempts.get(doneKey(c)) ?? 0) + 1);
    if (c.status !== 'error') settled.add(doneKey(c));
  }
  const jobs: [string, (typeof STYLES)[number]][] = [];
  for (const ch of CHARS) for (const st of STYLES) {
    const k = `${model}|${ch}|${st.id}`;
    if (settled.has(k) || (attempts.get(k) ?? 0) >= 2) continue;
    jobs.push([ch, st]);
  }
  console.log(`== ${model}: ${jobs.length} to make`);
  if (process.env.LIMIT) jobs.splice(Number(process.env.LIMIT));
  let i = 0;
  const worker = async () => {
    while (i < jobs.length && !stopped) {
      const [ch, st] = jobs[i++];
      const prompt = promptFor(CALL[ch], st.text);
      let allowed: boolean;
      try { allowed = await guard(prompt); } catch (e) { if (e instanceof Stop) throw e; console.log(`prompt check failed: ${(e as Error).message}`); continue; }
      if (!allowed) {
        const h = sha(Buffer.from(prompt));
        if (!ledger.calls.some((c) => c.kind === 'picture' && doneKey(c) === `${model}|${ch}|${st.id}`)) {
          ledger.calls.push({ kind: 'picture', model, character: ch, style: st.id, prompt_sha256: h, status: 'guard-refused', note: 'the prompt check refused the prompt: no picture asked for', cost_usd: 0, cost_source: 'no call', worst_usd: 0, at: now() });
          save();
        }
        continue;
      }
      await picture(model, ch, st, (attempts.get(`${model}|${ch}|${st.id}`) ?? 0) + 1);
    }
  };
  const safe = async () => { try { await worker(); } catch (e) { if (e instanceof Stop) stopped = e.message; else throw e; } };
  await Promise.all(Array.from({ length: concurrency }, safe));
  if (stopped) throw new Stop(stopped);
}

async function endpointList(model: ModelKey) {
  const id = MODEL_OF[model].id as ClosedImageModel;
  const { refusal, retention } = await retentionCheck(id);
  ledger.calls.push({ kind: 'endpoint-list', model, status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, cost_source: 'free GET', worst_usd: 0, at: now() });
  save();
  if (refusal) throw new Stop(refusal);
}

const only = (process.env.ONLY ?? 'flux,qwen,gpt,gemini').split(',') as ModelKey[];
try {
  for (const model of only) {
    if (model === 'gpt' || model === 'gemini') await endpointList(model);
    await pass(model, model === 'gpt' || model === 'gemini' ? 4 : 3);
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
} catch (e) {
  if (e instanceof Stop) { console.log(e.message); save(); process.exit(2); }
  throw e;
}
