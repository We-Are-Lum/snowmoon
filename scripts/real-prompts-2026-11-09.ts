/**
 * Real-prompts test (2026-11-09, owner-approved, cap $2.00, stop before $1.85): 12 cases a person might type, two per
 * character, each from the character's default base front (as the route sends it), on FLUX.2 [klein] 4B edit, GPT Image
 * 2.5 Sunburst and Gemini 3.1 Flash Image. Every prompt is the route's own remixPrompt (origin/challenge-models 9e0ef303
 * merged in), in the shipping order: the change, the reference line, the look line, the scene line, the style, line B,
 * the no-words line. Style row: "Same as this picture" (no style text), "Animated series" (BASE_STYLE.text), or Random,
 * recorded as drawing "Animated series" (the coordinator: Random draws only from the offered styles; see the ledger's
 * random_note). Prompt check (1,200 tokens) on every prompt first, as the site does. Test pictures only: NO database,
 * nothing published. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/real-prompts-2026-11-09.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { remixPrompt } from '../src/lib/challenge/make';
import { BASE_STYLE } from '../src/lib/challenge/base-style';
import { lookFor } from '../src/lib/challenge/looks';
import { CHALLENGE_MODELS } from '../src/lib/challenge/models';
import { challengeClosedRequest, hasC2pa, parseClosed, toWide } from '../src/lib/images/closed';
import type { SheetModel } from '../src/lib/images/sheet-models';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, retentionCheck, type ClosedImageModel } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/real-prompts-2026-11-09');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: real-prompts-2026-11-09.ts <outdir>');
const REFS = path.join(OUT, '..', 'style-test', 'refs');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 1.85;
const SEED = 20261109;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const WORST = { flux: 0.0125, gpt: 0.08, gemini: 0.09 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const FAL_KEY = process.env.FAL_KEY;
if (!GW_KEY || !FAL_KEY) throw new Error('missing a key');
const fakeRequest = new Request('http://localhost/local-script');
const REF_INFO = JSON.parse(readFileSync(path.join(REFS, 'refs.json'), 'utf8')) as Record<string, { version: string; url: string; sha256: string }>;
const NAME: Record<string, string> = { zei: 'Zei', gladias: 'Gladias', bai: 'Bai', seila: 'Seila', deluin: 'Deluin', mu: 'Mu' };

type StyleRow = 'Same' | 'Animated series' | 'Random';
export const CASES: { n: number; ch: string; words: string; style: StyleRow }[] = [
  { n: 1, ch: 'zei', words: 'with Bai', style: 'Same' },
  { n: 2, ch: 'zei', words: 'riding a motorcycle through a city at sunset', style: 'Animated series' },
  { n: 3, ch: 'gladias', words: 'as a wizard casting a spell', style: 'Random' },
  { n: 4, ch: 'gladias', words: 'dressed up for a fancy party', style: 'Same' },
  { n: 5, ch: 'bai', words: 'make her a villain', style: 'Animated series' },
  { n: 6, ch: 'bai', words: 'fighting a dragon', style: 'Random' },
  { n: 7, ch: 'seila', words: 'cozy, reading in a café on a rainy day', style: 'Same' },
  { n: 8, ch: 'seila', words: 'as an astronaut on the moon', style: 'Animated series' },
  { n: 9, ch: 'deluin', words: 'make him cooler', style: 'Random' },
  { n: 10, ch: 'deluin', words: 'at a crowded night market, eating noodles', style: 'Same' },
  { n: 11, ch: 'mu', words: 'in winter gear on a snowy mountain at night', style: 'Animated series' },
  { n: 12, ch: 'mu', words: 'as a pirate captain on a ship in a storm', style: 'Random' },
];
const styleText = (s: StyleRow) => (s === 'Same' ? '' : BASE_STYLE.text);
export const promptFor = (c: (typeof CASES)[number]) => remixPrompt({ words: c.words, name: NAME[c.ch], look: lookFor(c.ch), style: styleText(c.style) });

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: 'Real-prompts test 2026-11-09: 12 cases x FLUX, GPT, Gemini, base front only, prompts by remixPrompt in the shipping order. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.',
  cap_usd: 2, stop_at_usd: STOP_AT, seed: SEED, base_style: BASE_STYLE,
  random_note: 'Random recorded as drawing "Animated series", as the coordinator instructed (Random draws only from the offered styles). On challenge-models 9e0ef303 the code (make.ts drawStyle over publishedStyles) draws from every published style with text; whether that list is only "Animated series" in production was not checked here.',
  refs: REF_INFO, prompts: {}, calls: [],
};
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
class Stop extends Error {}
const gate = (what: string, worst: number) => { if (spent() + worst > STOP_AT + 1e-9) throw new Stop(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${STOP_AT}`); };
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

type ModelKey = 'flux' | 'gpt' | 'gemini';
async function make(model: ModelKey, c: (typeof CASES)[number], attempt: number): Promise<void> {
  const prompt = promptFor(c);
  const h = sha(Buffer.from(prompt));
  const file = `rp-${String(c.n).padStart(2, '0')}-${c.ch}-${model}.jpg`;
  const base = { kind: 'picture', model, case: c.n, character: c.ch, words: c.words, style_row: c.style, style_used: c.style === 'Same' ? null : BASE_STYLE.title, prompt_sha256: h, file };
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
        row = { ...base, endpoint, host: 'fal.ai', status: refused ? 'refused' : 'error', note: `${res.status} ${text.slice(0, 300)}`, cost_usd: refused ? 0 : worst, cost_source: refused ? '4xx: not billed' : 'worst counted', at: now() };
      } else {
        const raw = Buffer.from(mm[2], 'base64');
        writeFileSync(path.join(OUT, 'full', file), raw);
        const nsfw = Boolean(j.has_nsfw_concepts?.[0]);
        row = { ...base, endpoint, host: 'fal.ai', request_id: res.headers.get('x-fal-request-id'), seed: j.seed ?? SEED, status: nsfw ? 'filtered' : 'ok', note: nsfw ? 'fal safety checker flagged it' : undefined, cost_usd: Number.isFinite(units) ? units * IMAGES.editPricePerMp : worst, cost_source: Number.isFinite(units) ? `fal's x-fal-billable-units (${units}) x $${IMAGES.editPricePerMp}/megapixel` : 'worst counted', sha256: sha(raw), settings, at: now() };
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
        row = { ...base, endpoint: m.call.endpoint, host: m.call.host, status: refused ? 'refused' : 'error', note: `${(e as Error).message} ${text.slice(0, 400)}`, cost_usd: ok ? reported : (res.status >= 400 && res.status < 500 ? 0 : worst), cost_source: ok ? 'reported by the gateway' : 'not reported', at: now() };
      }
    }
  } catch (e) {
    if (e instanceof Stop) throw e;
    row = { ...base, status: 'error', note: String((e as Error).message).slice(0, 300), cost_usd: worst, cost_source: 'worst counted', at: now() };
  }
  row.attempt = attempt; row.worst_usd = worst;
  ledger.calls.push(row); save();
  console.log(`${file}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})${row.note ? ` ${String(row.note).slice(0, 160)}` : ''}`);
  if (row.status === 'error' && attempt === 1) return make(model, c, 2);
}

async function main() {
  try {
    for (const c of CASES) if (!(await guard(promptFor(c)))) console.log(`case ${c.n}: the prompt check refused it`);
    for (const model of ['flux', 'gpt', 'gemini'] as const) {
      if (model !== 'flux') {
        const { refusal, retention } = await retentionCheck(model === 'gpt' ? 'gpt-image-2.5-sunburst' : 'gemini-3.1-flash-image');
        ledger.calls.push({ kind: 'endpoint-list', model, status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, at: now() }); save();
        if (refusal) throw new Stop(refusal);
      }
      for (const c of CASES) {
        const h = sha(Buffer.from(promptFor(c)));
        const file = `rp-${String(c.n).padStart(2, '0')}-${c.ch}-${model}.jpg`;
        if (!guardOk.get(h)) {
          if (!ledger.calls.some((x: any) => x.file === file)) { ledger.calls.push({ kind: 'picture', model, case: c.n, character: c.ch, words: c.words, file, prompt_sha256: h, status: 'guard-refused', cost_usd: 0, at: now() }); save(); } // eslint-disable-line @typescript-eslint/no-explicit-any
          continue;
        }
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
