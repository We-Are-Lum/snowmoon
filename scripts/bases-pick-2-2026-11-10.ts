/**
 * Bases pick 2 (2026-11-10, owner-approved overnight task B; the overnight cap is $3.00 for all new pictures, stop
 * before $2.80): new base candidates for Zei, Bai, Seila and Mu, recasting each published base's look the way the
 * three-looks proposal did (docs/starting-sheet-drafts/three-looks-proposal.md on origin/challenge-styles: only skin,
 * hair and eyes change; clothes and signature details stay), one per model per look (a, b), on GPT Image 2.5 Sunburst
 * and FLUX.2 [klein] 4B edit, from the base's front only.
 *
 * The prompt is the shipping remixPrompt (origin/main 6ac7084 merged in) with style "Same as this picture" (no style
 * text); the change words carry the look and ask for a usable base front: the whole body, facing the front, on a plain
 * light grey background. Portrait output, as a sheet's views (576 x 768): GPT at 1024 x 1536 through the Vercel AI
 * Gateway (pinned to openai, no training; scripts/lib/batch-model.ts closedImageRequest with the reference), fitted
 * by the site's toView; FLUX at 576 x 768 on fal.ai with one fixed seed. Prompt check (1,200 tokens) first.
 *
 * Settings are read in place from the main checkout (--env-file=/Users/nathan/snowmoon/.env.local): never copied.
 * GROQ_API_KEY and VERCEL_OIDC_TOKEN are removed from the process at start. Test pictures only: NO database, nothing
 * published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/bases-pick-2-2026-11-10.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { remixPrompt } from '../src/lib/challenge/make';
import { lookFor } from '../src/lib/challenge/looks';
import { hasC2pa, toView } from '../src/lib/images/closed';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, closedImageRequest, retentionCheck } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/bases-pick-2-2026-11-10');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: bases-pick-2-2026-11-10.ts <outdir>');
const REFS = path.join(OUT, '..', 'style-test', 'refs');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

/** The overnight cap covers every new picture tonight; this script stops at its share's end too. */
const STOP_AT = Number(process.env.STOP_AT ?? 2.8);
const SPENT_BEFORE = Number(process.env.SPENT_BEFORE ?? 0);
const SEED = 20261110;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const VIEW = { width: 576, height: 768 };
const WORST = { gpt: 0.08, flux: 0.0125 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
if (!GW_KEY || !FAL_KEY) throw new Error('missing a key');
const fakeRequest = new Request('http://localhost/local-script');
const REF_INFO = JSON.parse(readFileSync(path.join(REFS, 'refs.json'), 'utf8')) as Record<string, { version: string; url: string; sha256: string }>;
const NAME: Record<string, string> = { zei: 'Zei', bai: 'Bai', seila: 'Seila', mu: 'Mu' };

/** The three-looks proposal's a and b words, word for word (origin/challenge-styles, 2026-11-04). */
export const LOOKS: Record<string, Record<'a' | 'b', string>> = {
  zei: { a: 'deep brown skin, short black twists with one electric-blue streak, quick dark eyes', b: 'fair skin, spiky ash-brown hair with one electric-blue streak, quick grey eyes' },
  bai: { a: 'light olive skin, long straight black hair in a high ponytail dyed magenta at the ends, dark eyes', b: 'fair freckled skin, a high ponytail of loose auburn curls dyed magenta at the ends, hazel eyes' },
  seila: { a: 'light tan skin, shoulder-length wavy black hair gathered loosely back, alert dark eyes', b: 'fair skin, shoulder-length auburn hair in a loose braid, alert green eyes' },
  mu: { a: 'pale skin, short silver hair in a sharp asymmetric cut, keen grey eyes', b: 'deep brown skin, short silver coils in a sharp asymmetric cut, keen dark eyes' },
};
const KEPT: Record<string, string> = { zei: 'the electric-blue streak', bai: 'the magenta ends', seila: 'the small round gold-rimmed glasses', mu: 'the thin red-framed glasses' };
export const changeFor = (ch: string, look: 'a' | 'b') =>
  `with ${LOOKS[ch][look]}; the same clothes and ${KEPT[ch]} as in the picture; full body from head to shoes, standing and facing the front, on a plain light grey background`;
export const promptFor = (ch: string, look: 'a' | 'b') => remixPrompt({ words: changeFor(ch, look), name: NAME[ch], look: lookFor(ch), style: '' });

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: 'Bases pick 2 (2026-11-10): new base candidates for Zei, Bai, Seila, Mu, looks a and b, GPT Image 2.5 and FLUX.2 [klein] 4B, from the base front. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.',
  overnight_cap_usd: 3, stop_at_usd: STOP_AT, seed: SEED, looks: LOOKS, refs: REF_INFO, prompts: {}, calls: [],
};
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
class Stop extends Error {}
const gate = (what: string, worst: number) => { if (SPENT_BEFORE + spent() + worst > STOP_AT + 1e-9) throw new Stop(`STOP before ${what}: tonight $${(SPENT_BEFORE + spent()).toFixed(4)} + worst $${worst} > $${STOP_AT}`); };
const front = (ch: string) => {
  const b = readFileSync(path.join(REFS, `${ch}.jpg`));
  if (sha(b) !== REF_INFO[ch].sha256) throw new Error(`${ch}: reference sha256 differs`);
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

async function make(model: 'gpt' | 'flux', ch: string, look: 'a' | 'b', attempt: number): Promise<void> {
  const prompt = promptFor(ch, look);
  const h = sha(Buffer.from(prompt));
  const file = `bp2-${ch}-${look}-${model}.jpg`;
  const base = { kind: 'picture', model, character: ch, look, words: changeFor(ch, look), prompt_sha256: h, file };
  const worst = WORST[model];
  gate(file, worst);
  let row: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    if (model === 'flux') {
      const endpoint = IMAGES.editModel.endpoint;
      const settings = { image_size: VIEW, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', sync_mode: true, seed: SEED };
      const res = await fetch(`https://fal.run/${endpoint}`, { method: 'POST', headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' }, body: JSON.stringify({ prompt, image_urls: [`data:image/jpeg;base64,${front(ch).toString('base64')}`], ...settings }) });
      const units = Number(res.headers.get('x-fal-billable-units') ?? NaN);
      const text = await res.text();
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const mm = String(j.images?.[0]?.url ?? '').match(/^data:([^;]+);base64,(.+)$/);
      if (!res.ok || !mm) {
        const refused = res.status === 422 || /content|policy|safety|nsfw/i.test(text);
        row = { ...base, endpoint, host: 'fal.ai', status: refused ? 'refused' : 'error', note: `${res.status} ${text.slice(0, 300)}`, cost_usd: refused ? 0 : worst, cost_source: refused ? '4xx: not billed' : 'worst counted', at: now() };
      } else {
        const raw = Buffer.from(mm[2], 'base64');
        writeFileSync(path.join(OUT, 'full', file), raw);
        row = { ...base, endpoint, host: 'fal.ai', request_id: res.headers.get('x-fal-request-id'), seed: j.seed ?? SEED, status: j.has_nsfw_concepts?.[0] ? 'filtered' : 'ok', cost_usd: Number.isFinite(units) ? units * IMAGES.editPricePerMp : worst, cost_source: Number.isFinite(units) ? `fal's x-fal-billable-units (${units}) x $${IMAGES.editPricePerMp}/megapixel` : 'worst counted', sha256: sha(raw), settings, at: now() };
      }
    } else {
      const req = closedImageRequest('gpt-image-2.5-sunburst', prompt, { bytes: front(ch), contentType: 'image/jpeg' });
      assertGatewayOptions('gpt-image-2.5-sunburst', req.body as never);
      const res = await fetch(req.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
      const text = await res.text();
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const reported = Number(j.providerMetadata?.gateway?.cost);
      const ok = Number.isFinite(reported);
      const b64 = j.data?.[0]?.b64_json;
      if (!res.ok || typeof b64 !== 'string') {
        const refused = /safety|moderat|policy|blocked|prohibit/i.test(text);
        row = { ...base, endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', status: refused ? 'refused' : 'error', note: `${res.status} ${text.slice(0, 300)}`, cost_usd: ok ? reported : (res.status >= 400 && res.status < 500 ? 0 : worst), cost_source: ok ? 'reported by the gateway' : 'not reported', at: now() };
      } else {
        const orig = Buffer.from(b64, 'base64');
        const meta = await sharp(orig).metadata();
        const out = await toView(orig, VIEW);
        writeFileSync(path.join(OUT, 'full', file), out);
        row = { ...base, endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', request_id: j.providerMetadata?.gateway?.generationId ?? null, status: 'ok', cost_usd: ok ? reported : worst, cost_source: ok ? 'reported by the gateway' : 'worst counted', sha256: sha(out), original_sha256: sha(orig), original_size: `${meta.width}x${meta.height}`, converted: `toView to ${VIEW.width}x${VIEW.height} (contain, padded with its own corner colour)`, settings: req.settings, content_credentials: hasC2pa(orig) ? 'C2PA manifest in the original' : 'none found', at: now() };
      }
    }
  } catch (e) {
    if (e instanceof Stop) throw e;
    row = { ...base, status: 'error', note: String((e as Error).message).slice(0, 300), cost_usd: worst, cost_source: 'worst counted', at: now() };
  }
  row.attempt = attempt; row.worst_usd = worst;
  ledger.calls.push(row); save();
  console.log(`${file}: ${row.status} $${row.cost_usd.toFixed(4)} (this run $${spent().toFixed(4)})${row.note ? ` ${String(row.note).slice(0, 160)}` : ''}`);
  if (row.status === 'error' && attempt === 1) return make(model, ch, look, 2);
}

async function main() {
  try {
    for (const ch of Object.keys(LOOKS)) for (const look of ['a', 'b'] as const) if (!(await guard(promptFor(ch, look)))) console.log(`${ch} ${look}: the prompt check refused it`);
    const { refusal, retention } = await retentionCheck('gpt-image-2.5-sunburst');
    ledger.calls.push({ kind: 'endpoint-list', model: 'gpt', status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, at: now() }); save();
    if (refusal) throw new Stop(refusal);
    for (const model of ['flux', 'gpt'] as const) for (const ch of Object.keys(LOOKS)) for (const look of ['a', 'b'] as const) {
      const h = sha(Buffer.from(promptFor(ch, look)));
      const file = `bp2-${ch}-${look}-${model}.jpg`;
      if (!guardOk.get(h)) { if (!ledger.calls.some((x: any) => x.file === file)) { ledger.calls.push({ kind: 'picture', model, character: ch, look, file, prompt_sha256: h, status: 'guard-refused', cost_usd: 0, at: now() }); save(); } continue; } // eslint-disable-line @typescript-eslint/no-explicit-any
      const prior = ledger.calls.filter((x: any) => x.kind === 'picture' && x.file === file); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (prior.some((x: any) => x.status !== 'error') || prior.length >= 2) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
      await make(model, ch, look, prior.length + 1);
    }
    console.log(`DONE this run $${spent().toFixed(4)}`);
  } catch (e) {
    if (e instanceof Stop) { console.log(e.message); save(); process.exit(2); }
    throw e;
  }
}
main();
