/**
 * Re-test of 2026-11-09 (owner-approved, cap $1.50, stop before $1.35): shorter look lines and a scene line. Test
 * pictures only: NO database, NO storage, nothing published. Drafted by the coding agent (Claude, a closed model by
 * Anthropic). DRAFT.
 *
 * The prompt, built here from the coordinator's strings in this order (the release branch is being updated to match):
 * the change words; "{Name} is the person in reference image 1, the main figure."; the new look line; the scene line;
 * no style text ("Same as this picture"); KEEP_LINE ("Keep the face recognisable; change anything else the words
 * describe."); IMAGES.suffix.
 *
 * Models, each with the base front only, as the route sends it (576 x 768): FLUX.2 [klein] 4B edit on fal.ai (seed
 * 20261108), GPT Image 2.5 Sunburst and Gemini 3.1 Flash Image through the Vercel AI Gateway with the site's own request
 * (GPT pinned to openai, no training; Gemini pinned to vertex, zero data retention, no training), both cropped to 16:9
 * by the route's toWide (a quarter of the removed height from the top). Prompt check (1,200 tokens) first.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/retest-2026-11-09.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { CHALLENGE_MODELS } from '../src/lib/challenge/models';
import { KEEP_LINE } from '../src/lib/challenge/styles';
import { challengeClosedRequest, hasC2pa, parseClosed, toWide } from '../src/lib/images/closed';
import type { SheetModel } from '../src/lib/images/sheet-models';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, retentionCheck, type ClosedImageModel } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/retest-2026-11-09');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: retest-2026-11-09.ts <outdir>');
const REFS = path.join(OUT, '..', 'look-test', 'refs');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 1.35;
const SEED = 20261108;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const WORST = { flux: 0.0125, gpt: 0.08, gemini: 0.09 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
if (!GW_KEY || !FAL_KEY) throw new Error('missing a key');
const fakeRequest = new Request('http://localhost/local-script');

const FRONT_SHA: Record<string, string> = { zei: '131f235227a54b06f6f11253f37a09b5001bf5f72326a6c9949a21800990dc7c', bai: '01538922456b9bf61192ed291b8f26595c694599b94eb95be8b60ce931b76a96' };
const NAME: Record<string, string> = { zei: 'Zei', bai: 'Bai' };
export const LOOKS: Record<string, string> = {
  bai: 'Unless the change says otherwise: a woman with dark brown skin, tattooed arms and gold earrings.',
  zei: 'Unless the change says otherwise: a man with light golden-tan skin and dark eyes.',
};
export const SCENE_LINE = 'Unless the change says otherwise: one figure, in a scene that suits the change, not a character sheet.';
const LINE_B = 'Keep the face recognisable; change anything else the words describe.';
if (KEEP_LINE !== LINE_B) throw new Error('KEEP_LINE is not line B');
export const CASES: { ch: string; change: number; words: string }[] = [
  { ch: 'bai', change: 8, words: 'as a medieval knight in armour' },
  { ch: 'bai', change: 11, words: 'as a deep-sea diver in a brass helmet, underwater' },
  { ch: 'bai', change: 4, words: 'much taller, with a heavy, broad-shouldered build' },
  { ch: 'bai', change: 3, words: 'aged about 70' },
  { ch: 'bai', change: 7, words: 'shaved head' },
  { ch: 'zei', change: 3, words: 'aged about 70' },
  { ch: 'zei', change: 7, words: 'shaved head' },
];
export const promptFor = (c: (typeof CASES)[number]) => [c.words.trim(), `${NAME[c.ch]} is the person in reference image 1, the main figure.`, LOOKS[c.ch], SCENE_LINE, KEEP_LINE, IMAGES.suffix].join('\n\n');

const ledger: { about: string; cap_usd: number; stop_at_usd: number; seed: number; looks: typeof LOOKS; scene_line: string; prompts: Record<string, string>; calls: any[] } = existsSync(LEDGER) // eslint-disable-line @typescript-eslint/no-explicit-any
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { about: 'Re-test 2026-11-09: shorter look lines + scene line; Bai (5 changes) and Zei (2) on FLUX, GPT, Gemini, base front only. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.', cap_usd: 1.5, stop_at_usd: STOP_AT, seed: SEED, looks: LOOKS, scene_line: SCENE_LINE, prompts: {}, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
class Stop extends Error {}
const gate = (what: string, worst: number) => { if (spent() + worst > STOP_AT + 1e-9) throw new Stop(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${STOP_AT}`); };
const front = (ch: string) => {
  const b = readFileSync(path.join(REFS, `${ch}-front.jpg`));
  if (sha(b) !== FRONT_SHA[ch]) throw new Error(`${ch}: reference sha256 differs`);
  return b;
};

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

type ModelKey = 'flux' | 'gpt' | 'gemini';
async function make(model: ModelKey, c: (typeof CASES)[number], attempt: number): Promise<void> {
  const prompt = promptFor(c);
  const h = sha(Buffer.from(prompt));
  const file = `retest-c${String(c.change).padStart(2, '0')}-${c.ch}-${model}.jpg`;
  const base = { kind: 'picture', model, character: c.ch, change: c.change, words: c.words, prompt_sha256: h, file };
  if (!(await guard(prompt))) { ledger.calls.push({ ...base, status: 'guard-refused', cost_usd: 0, at: now() }); save(); return; }
  const worst = WORST[model];
  gate(file, worst);
  let row: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    if (model === 'flux') {
      const endpoint = IMAGES.editModel.endpoint;
      const settings = { image_size: { width: IMAGES.size.width, height: IMAGES.size.height }, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', sync_mode: true, seed: SEED };
      const res = await fetch(`https://fal.run/${endpoint}`, { method: 'POST', headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' }, body: JSON.stringify({ prompt, image_urls: [`data:image/jpeg;base64,${front(c.ch).toString('base64')}`], ...settings }) });
      const units = Number(res.headers.get('x-fal-billable-units') ?? NaN);
      const text = await res.text();
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const mm = String(j.images?.[0]?.url ?? '').match(/^data:([^;]+);base64,(.+)$/);
      if (!res.ok || !mm) {
        const refused = res.status === 422 || /content|policy|safety|nsfw/i.test(text);
        row = { ...base, endpoint, host: 'fal.ai', status: refused ? 'refused' : 'error', note: `${res.status} ${text.slice(0, 300)}`, cost_usd: refused ? 0 : worst, cost_source: refused ? '4xx: not billed' : 'unknown: worst counted', at: now() };
      } else {
        const raw = Buffer.from(mm[2], 'base64');
        writeFileSync(path.join(OUT, 'full', file), raw);
        row = { ...base, endpoint, host: 'fal.ai', request_id: res.headers.get('x-fal-request-id'), seed: j.seed ?? SEED, status: j.has_nsfw_concepts?.[0] ? 'filtered' : 'ok', cost_usd: Number.isFinite(units) ? units * IMAGES.editPricePerMp : worst, cost_source: Number.isFinite(units) ? `fal's x-fal-billable-units (${units}) x $${IMAGES.editPricePerMp}/megapixel` : 'worst counted', sha256: sha(raw), settings, at: now() };
      }
    } else {
      const m = CHALLENGE_MODELS.find((x) => x.id === (model === 'gpt' ? 'gpt-image-2.5-sunburst' : 'gemini-3.1-flash-image'))!;
      const req = challengeClosedRequest(m, prompt, front(c.ch));
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
        writeFileSync(path.join(OUT, 'full', file), w.bytes);
        row = { ...base, endpoint: m.call.endpoint, host: m.call.host, request_id: pic.requestId, status: 'ok', cost_usd: ok ? reported : worst, cost_source: ok ? 'reported by the gateway' : 'worst counted', sha256: sha(w.bytes), original_sha256: sha(pic.bytes), original_size: `${meta.width}x${meta.height}`, crop: { words: w.words, ...w.crop }, settings: req.settings, content_credentials: hasC2pa(pic.bytes) ? 'C2PA manifest in the original' : 'none found', at: now() };
      } catch (e) {
        const refused = (res.ok && model === 'gemini') || /safety|moderat|policy|blocked|prohibit/i.test(text);
        row = { ...base, endpoint: m.call.endpoint, host: m.call.host, status: refused ? 'refused' : 'error', note: `${(e as Error).message} ${text.slice(0, 300)}`, cost_usd: ok ? reported : (res.status >= 400 && res.status < 500 ? 0 : worst), cost_source: ok ? 'reported by the gateway' : 'not reported', at: now() };
      }
    }
  } catch (e) {
    if (e instanceof Stop) throw e;
    row = { ...base, status: 'error', note: String((e as Error).message).slice(0, 300), cost_usd: worst, cost_source: 'unknown: worst counted', at: now() };
  }
  row.attempt = attempt; row.worst_usd = worst;
  ledger.calls.push(row); save();
  console.log(`${file}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})${row.note ? ` ${String(row.note).slice(0, 140)}` : ''}`);
  if (row.status === 'error' && attempt === 1) return make(model, c, 2);
}

async function main() {
  try {
    for (const model of ['flux', 'gpt', 'gemini'] as const) {
      if (model !== 'flux') {
        const { refusal, retention } = await retentionCheck(model === 'gpt' ? 'gpt-image-2.5-sunburst' : 'gemini-3.1-flash-image');
        ledger.calls.push({ kind: 'endpoint-list', model, status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, at: now() }); save();
        if (refusal) throw new Stop(refusal);
      }
      for (const c of CASES) {
        const file = `retest-c${String(c.change).padStart(2, '0')}-${c.ch}-${model}.jpg`;
        const prior = ledger.calls.filter((x: any) => x.kind === 'picture' && x.file === file); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (prior.some((x: any) => x.status !== 'error') || prior.length >= 2) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
        await make(model, c, prior.length + 1);
      }
    }
    console.log(`DONE spent $${spent().toFixed(4)}`);
  } catch (e) {
    if (e instanceof Stop) { console.log(e.message); save(); process.exit(2); }
    throw e;
  }
}
main();
