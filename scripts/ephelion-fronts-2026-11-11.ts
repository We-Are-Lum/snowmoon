/**
 * Lord Ephelion, step 2 (owner, 2026-11-11): portrait A again from text ("too pretty boy": short silver-grey hair, neatly
 * combed and clean-cut; a long narrow face with visible lines of his age; still kind, a faint smile, sharp grey eyes; the
 * whole head in the frame with space above), then for A (new), B and C a full-body front view as an edit of its
 * portrait: the same coat and face, a plain background, fitted to 3:4 (576 x 768) like the other bases. The look is
 * this edition's invention (the book never describes him; only "a man", c21-b76). GPT Image 2.5 Sunburst through the
 * Vercel AI Gateway, pinned to openai, no training. Prompt check first. Cap $0.40 for all of it, each picture counted at
 * its worst price before it is made. Settings read in place, never copied. Test pictures only. Drafted by the coding
 * agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/ephelion-fronts-2026-11-11.ts <portraits dir> <outdir>
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
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/ephelion-fronts-2026-11-11');
const LEDGER = path.join(DOC, 'ledger.json');
const [PORTRAITS, OUT] = process.argv.slice(2);
if (!PORTRAITS || !OUT) throw new Error('usage: ephelion-fronts-2026-11-11.ts <portraits dir> <outdir>');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 0.4;
const WORST = 0.08;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const VIEW = { width: 576, height: 768 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('missing the gateway key');
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const fakeRequest = new Request('http://localhost/local-script');

/** Book-based: a man (c21-b76). Invented (this edition's). A again, with the owner's changes; B and C as they were. */
export const A2 = "a man in his early fifties with fair skin, a kind, open face with visible lines of his age, warm crow's feet and a faint smile at rest, sharp attentive grey eyes looking directly at the viewer, short silver-grey hair, neatly combed and clean-cut, clean-shaven, a long narrow face, slim build with a scholar's slight stoop, one gloved hand raised mid-explanation";
export const CLOTHES = 'wearing an immaculate ice-blue high-collared formal coat over a white waistcoat, with silver trim and white gloves; the collar is modest and frames the face without towering over it, with a small lion emblem at the collar';
export const portraitPrompt = () => [
  'Head-and-shoulders portrait, three-quarter view, framed down to mid-chest so the hands show, with the whole head inside the frame and space above it: one person, on a plain flat off-white background with no scenery, even lighting.',
  `The person is ${A2}, ${CLOTHES}.`,
  BASE_STYLE.text,
  IMAGES.suffix,
].join('\n\n');
export const POSES: Record<'a' | 'b' | 'c', string> = { a: 'one gloved hand raised mid-explanation', b: 'gloved hands loosely clasped in front', c: 'one gloved hand raised mid-explanation' };
export const frontPrompt = (v: 'a' | 'b' | 'c') => [
  'The person in reference image 1, full body from head to shoes: the same face, hair and glasses or beard (if any), and exactly the same clothes as in reference image 1 (an immaculate ice-blue high-collared formal coat over a white waistcoat, with silver trim and white gloves, a small lion emblem at the collar), with trousers and shoes that match.',
  `Standing and facing the front, slim, with a scholar's slight stoop, ${POSES[v]}, on a plain flat light grey background with no scenery, the whole figure inside the frame with space above the head and below the shoes.`,
  BASE_STYLE.text,
  IMAGES.suffix,
].join('\n\n');
/** Short look lines, the characters' shape (skin and eyes, plus B's beard and C's glasses). DRAFT. */
export const LOOK_LINES: Record<'a' | 'b' | 'c', string> = {
  a: 'Unless the change says otherwise: a man with fair skin and grey eyes.',
  b: 'Unless the change says otherwise: a man with deep brown skin, a short grey beard and dark eyes.',
  c: 'Unless the change says otherwise: a man with light golden-brown skin, thin wire-rimmed glasses and dark brown eyes.',
};

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: "Lord Ephelion, step 2 (owner, 2026-11-11): portrait A again from text, then full-body fronts of A, B and C as edits of their portraits, GPT Image 2.5. The look is this edition's invention (the book never describes him). Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.",
  cap_usd: 0.4, stop_at_usd: STOP_AT, clothes: CLOTHES, base_style: BASE_STYLE, book_based: { detail: 'a man', block: 'c21-b76' }, a2: A2, poses: POSES, look_lines: LOOK_LINES, prompts: {}, calls: [],
};
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
const gate = (what: string, worst: number) => { if (spent() + worst > STOP_AT + 1e-9) { console.log(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${STOP_AT}`); save(); process.exit(2); } };

/** One picture: text alone (ref null) or an edit of ref; recorded in the ledger; the 576 x 768 file written to OUT/full. */
async function make(file: string, prompt: string, ref: { bytes: Buffer; sha256: string } | null, extra: Record<string, unknown>): Promise<Buffer | null> {
  const done = ledger.calls.find((x: any) => x.file === file && x.status === 'ok'); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (done) return readFileSync(path.join(OUT, 'full', file));
  const h = sha(Buffer.from(prompt));
  ledger.prompts[h] = prompt;
  const bn = blockedName(prompt);
  if (bn) { ledger.calls.push({ kind: 'guard', file, prompt_sha256: h, status: 'blocked-name', note: bn, cost_usd: 0, at: now() }); save(); return null; }
  const w = guardWorstUsd(prompt.length, GUARD_TOKENS);
  gate('a prompt check', w);
  const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
  ledger.calls.push({ kind: 'guard', file, prompt_sha256: h, max_tokens: GUARD_TOKENS, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, cost_usd: g.costUsd, cost_source: 'reported', worst_usd: w, at: now() }); save();
  if (!g.allow) return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    gate(file, WORST);
    const req = closedImageRequest('gpt-image-2.5-sunburst', prompt, ref ? { bytes: ref.bytes, contentType: 'image/jpeg' } : null, '3:4');
    assertGatewayOptions('gpt-image-2.5-sunburst', req.body as never);
    const res = await fetch(req.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }).catch(() => null);
    const text = res ? await res.text() : '';
    let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { j = JSON.parse(text); } catch { /* not json */ }
    const reported = Number(j.providerMetadata?.gateway?.cost);
    const b64 = j.data?.[0]?.b64_json;
    if (!res || !res.ok || typeof b64 !== 'string') {
      const refused = /safety|moderat|policy|blocked|prohibit/i.test(text);
      ledger.calls.push({ kind: 'picture', model: 'gpt', file, ...extra, prompt_sha256: h, status: refused ? 'refused' : 'error', note: `${res?.status ?? 'no answer'} ${text.slice(0, 300)}`, cost_usd: Number.isFinite(reported) ? reported : (res && res.status >= 400 && res.status < 500 ? 0 : WORST), cost_source: Number.isFinite(reported) ? 'reported by the gateway' : 'not reported', attempt, at: now() }); save();
      console.log(`${file}: ${refused ? 'refused' : 'error'} (spent $${spent().toFixed(4)})`);
      if (refused) return null;
      continue;
    }
    const orig = Buffer.from(b64, 'base64');
    const meta = await sharp(orig).metadata();
    const out = await toView(orig, VIEW);
    writeFileSync(path.join(OUT, 'full', file), out);
    ledger.calls.push({ kind: 'picture', model: 'gpt', file, ...extra, prompt_sha256: h, ...(ref ? { reference_sha256: ref.sha256 } : {}), endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', request_id: j.providerMetadata?.gateway?.generationId ?? null, status: 'ok',
      cost_usd: Number.isFinite(reported) ? reported : WORST, cost_source: Number.isFinite(reported) ? 'reported by the gateway' : 'worst counted', sha256: sha(out), original_sha256: sha(orig), original_size: `${meta.width}x${meta.height}`,
      converted: `toView to ${VIEW.width}x${VIEW.height} (contain, padded with its own corner colour)`, settings: req.settings, content_credentials: hasC2pa(orig) ? 'C2PA manifest in the original' : 'none found', attempt, at: now() }); save();
    console.log(`${file}: ok $${ledger.calls.at(-1).cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})`);
    return out;
  }
  return null;
}

async function main() {
  const { refusal, retention } = await retentionCheck('gpt-image-2.5-sunburst');
  ledger.calls.push({ kind: 'endpoint-list', model: 'gpt', status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, at: now() }); save();
  if (refusal) throw new Error(refusal);
  const a2 = await make('ephelion-portrait-a2-gpt.jpg', portraitPrompt(), null, { step: 'portrait', variant: 'a2' });
  const B_SHA = 'd9ea996f56544a83dc78e8956d80e83cb4da8f5cb60a86da606a2fc5a89d55e6', C_SHA = '9c96a75316fa24a04245bba319edba9d475249a598ec4240a22c04a94a669255';
  const portraits: Record<'a' | 'b' | 'c', { bytes: Buffer; sha256: string } | null> = {
    a: a2 ? { bytes: a2, sha256: sha(a2) } : null,
    b: { bytes: readFileSync(path.join(PORTRAITS, 'ephelion-portrait-b-gpt.jpg')), sha256: B_SHA },
    c: { bytes: readFileSync(path.join(PORTRAITS, 'ephelion-portrait-c-gpt.jpg')), sha256: C_SHA },
  };
  for (const v of ['b', 'c'] as const) if (sha(portraits[v]!.bytes) !== portraits[v]!.sha256) throw new Error(`portrait ${v} isn't the recorded one`);
  for (const v of ['a', 'b', 'c'] as const) {
    if (!portraits[v]) { console.log(`${v}: no portrait`); continue; }
    await make(`ephelion-front-${v}-gpt.jpg`, frontPrompt(v), portraits[v], { step: 'front', variant: v, from_portrait: v === 'a' ? 'a2' : v });
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
}
main();
