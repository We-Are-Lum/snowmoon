/**
 * Lord Ephelion portraits, step 1 (owner's brief, 2026-11-11): three head-and-shoulders portraits, three-quarter view,
 * framed down to mid-chest so the hands show, plain flat off-white background, even lighting, in the challenge's
 * "Animated series" look (BASE_STYLE.text). Each from text alone, so the three are different people. The same clothes on
 * all three, so the faces are compared. The book never describes him (the only book-based detail: a man, c21-b76);
 * everything visual is this edition's invention. GPT Image 2.5 Sunburst through the Vercel AI Gateway, pinned to openai,
 * no training (scripts/lib/batch-model.ts closedImageRequest, 1024 x 1536), fitted to 576 x 768 (3:4) by the site's
 * toView. Prompt check first. Cap $0.30, each picture counted at its worst price before it is made. Settings read in
 * place (--env-file=/Users/nathan/snowmoon/.env.local), never copied. Test pictures only. Stops after the three for the
 * owner's pick. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/ephelion-portraits-2026-11-11.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { BASE_STYLE } from '../src/lib/challenge/base-style';
import { hasC2pa, toView } from '../src/lib/images/closed';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, closedImageRequest, retentionCheck } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/ephelion-portraits-2026-11-11');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: ephelion-portraits-2026-11-11.ts <outdir>');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 0.3;
const WORST = 0.08;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const VIEW = { width: 576, height: 768 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('missing the gateway key');
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const fakeRequest = new Request('http://localhost/local-script');

/** Book-based: a man (c21-b76). Invented (this edition's), per candidate: the owner's words, unchanged. */
export const VARIANTS: Record<'a' | 'b' | 'c', string> = {
  a: "a man in his early fifties with fair skin, a kind, open face, warm crow's feet and a faint smile at rest, sharp attentive grey eyes looking directly at the viewer, short neat silver-grey hair, clean-shaven, a long narrow face, slim build with a scholar's slight stoop, one gloved hand raised mid-explanation",
  b: "a man in his early fifties with deep brown skin, a kind, open face, warm crow's feet and a faint smile at rest, sharp attentive dark eyes looking directly at the viewer, close-cropped grey hair and a short neat grey beard, a broad gentle face, slim build with a scholar's slight stoop, gloved hands loosely clasped in front",
  c: "a man in his early fifties with light golden-brown skin, a kind, open face, warm crow's feet and a faint smile at rest, sharp attentive dark-brown eyes looking directly at the viewer, short neat black hair greying at the temples, clean-shaven, a rounder face with high cheekbones, thin wire-rimmed glasses, slim build with a scholar's slight stoop, one gloved hand raised mid-explanation",
};
export const CLOTHES = 'wearing an immaculate ice-blue high-collared formal coat over a white waistcoat, with silver trim and white gloves; the collar is modest and frames the face without towering over it, with a small lion emblem at the collar';
export const promptFor = (v: 'a' | 'b' | 'c') => [
  'Head-and-shoulders portrait, three-quarter view, framed down to mid-chest so the hands show: one person, on a plain flat off-white background with no scenery, even lighting.',
  `The person is ${VARIANTS[v]}, ${CLOTHES}.`,
  BASE_STYLE.text,
  IMAGES.suffix,
].join('\n\n');

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: "Lord Ephelion portraits, step 1 (owner's brief, 2026-11-11): three head-and-shoulders portraits from text, GPT Image 2.5, Animated series. The look is this edition's invention (the book never describes him). Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.",
  cap_usd: 0.3, stop_at_usd: STOP_AT, clothes: CLOTHES, base_style: BASE_STYLE, book_based: { detail: 'a man', block: 'c21-b76' }, variants: VARIANTS, prompts: {}, calls: [],
};
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
const gate = (what: string, worst: number) => { if (spent() + worst > STOP_AT + 1e-9) { console.log(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${STOP_AT}`); save(); process.exit(2); } };

async function main() {
  const ok = new Map<string, boolean>();
  for (const v of ['a', 'b', 'c'] as const) {
    const prompt = promptFor(v);
    const h = sha(Buffer.from(prompt));
    ledger.prompts[h] = prompt;
    const bn = blockedName(prompt);
    if (bn) { ledger.calls.push({ kind: 'guard', variant: v, prompt_sha256: h, status: 'blocked-name', note: bn, cost_usd: 0, at: now() }); ok.set(v, false); save(); continue; }
    const w = guardWorstUsd(prompt.length, GUARD_TOKENS);
    gate('a prompt check', w);
    const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
    ledger.calls.push({ kind: 'guard', variant: v, prompt_sha256: h, max_tokens: GUARD_TOKENS, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, cost_usd: g.costUsd, cost_source: 'reported', worst_usd: w, at: now() });
    ok.set(v, g.allow); save();
  }
  const { refusal, retention } = await retentionCheck('gpt-image-2.5-sunburst');
  ledger.calls.push({ kind: 'endpoint-list', model: 'gpt', status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, at: now() }); save();
  if (refusal) throw new Error(refusal);
  for (const v of ['a', 'b', 'c'] as const) {
    if (!ok.get(v)) { console.log(`${v}: the prompt check refused it`); continue; }
    const file = `ephelion-portrait-${v}-gpt.jpg`;
    if (ledger.calls.some((x: any) => x.file === file && x.status === 'ok')) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let attempt = 1; attempt <= 2; attempt++) {
      gate(file, WORST);
      const prompt = promptFor(v);
      const req = closedImageRequest('gpt-image-2.5-sunburst', prompt, null, '3:4');
      assertGatewayOptions('gpt-image-2.5-sunburst', req.body as never);
      const res = await fetch(req.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }).catch(() => null);
      const text = res ? await res.text() : '';
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const reported = Number(j.providerMetadata?.gateway?.cost);
      const b64 = j.data?.[0]?.b64_json;
      let row: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!res || !res.ok || typeof b64 !== 'string') {
        const refused = /safety|moderat|policy|blocked|prohibit/i.test(text);
        row = { kind: 'picture', model: 'gpt', variant: v, file, prompt_sha256: sha(Buffer.from(prompt)), status: refused ? 'refused' : 'error', note: `${res?.status ?? 'no answer'} ${text.slice(0, 300)}`, cost_usd: Number.isFinite(reported) ? reported : (res && res.status >= 400 && res.status < 500 ? 0 : WORST), cost_source: Number.isFinite(reported) ? 'reported by the gateway' : 'not reported', attempt, at: now() };
      } else {
        const orig = Buffer.from(b64, 'base64');
        const meta = await sharp(orig).metadata();
        const out = await toView(orig, VIEW);
        writeFileSync(path.join(OUT, 'full', file), out);
        row = { kind: 'picture', model: 'gpt', variant: v, file, prompt_sha256: sha(Buffer.from(prompt)), endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', request_id: j.providerMetadata?.gateway?.generationId ?? null, status: 'ok',
          cost_usd: Number.isFinite(reported) ? reported : WORST, cost_source: Number.isFinite(reported) ? 'reported by the gateway' : 'worst counted', sha256: sha(out), original_sha256: sha(orig), original_size: `${meta.width}x${meta.height}`,
          converted: `toView to ${VIEW.width}x${VIEW.height} (contain, padded with its own corner colour)`, settings: req.settings, content_credentials: hasC2pa(orig) ? 'C2PA manifest in the original' : 'none found', attempt, at: now() };
      }
      ledger.calls.push(row); save();
      console.log(`${file}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})${row.note ? ` ${String(row.note).slice(0, 160)}` : ''}`);
      if (row.status !== 'error') break;
    }
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
}
main();
