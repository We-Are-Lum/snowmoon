/**
 * Lord Ephelion, step 3 (owner, 2026-11-11): his three approved fronts with dark charcoal trousers and black shoes instead
 * of ice-blue and white ("so he reads as a diplomat rather than a costume"). Each an edit of its approved front; nothing
 * else changes. The look is this edition's invention (only "a man", c21-b76). GPT Image 2.5 Sunburst through the Vercel AI
 * Gateway, pinned to openai, no training; fitted to 576 x 768. Cap $0.20, each picture counted at $0.06 before it is made
 * (edits cost $0.048 today). Settings read in place, never copied. Test pictures only. Drafted by the coding agent
 * (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/ephelion-trousers-2026-11-11.ts <fronts dir> <outdir>
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
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/ephelion-trousers-2026-11-11');
const LEDGER = path.join(DOC, 'ledger.json');
const [PORTRAITS, OUT] = process.argv.slice(2);
if (!PORTRAITS || !OUT) throw new Error('usage: ephelion-trousers-2026-11-11.ts <fronts dir> <outdir>');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 0.2;
const WORST = 0.06;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const VIEW = { width: 576, height: 768 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('missing the gateway key');
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const fakeRequest = new Request('http://localhost/local-script');

export const EDIT = 'The same person as in reference image 1, exactly as he is: the same face, hair, glasses or beard (if any), pose, ice-blue high-collared coat, white waistcoat, silver trim, white gloves and lion emblem, the same plain light grey background and framing. Change only his trousers to dark charcoal formal trousers and his shoes to polished black formal shoes.';
export const editPrompt = () => [EDIT, BASE_STYLE.text, IMAGES.suffix].join('\n\n');
/** The approved fronts (ephelion-fronts-2026-11-11 ledger). */
export const FRONTS: Record<'a' | 'b' | 'c', string> = {"a": "8f0044557a81570abc9398044385adb5e0c5eaefb7c3019e76b268f25811d784", "b": "5449a928ec7219d66ffb1d868d02035e25a31a899180e3882e079bf6acc151b3", "c": "cb380ee95f9fe6237f5d407003013b3e8ec797a31459125f29a935192639facc"};

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: "Lord Ephelion, step 3 (owner, 2026-11-11): the three approved fronts with dark charcoal trousers and black shoes, each an edit of its front, GPT Image 2.5. The look is this edition's invention. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.",
  cap_usd: 0.2, stop_at_usd: STOP_AT, base_style: BASE_STYLE, book_based: { detail: 'a man', block: 'c21-b76' }, edit: EDIT, fronts: FRONTS, prompts: {}, calls: [],
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
  for (const v of ['a', 'b', 'c'] as const) {
    const bytes = readFileSync(path.join(PORTRAITS, `ephelion-front-${v}-gpt.jpg`));
    if (sha(bytes) !== FRONTS[v]) throw new Error(`front ${v} isn't the approved one`);
    await make(`ephelion-front-${v}-charcoal-gpt.jpg`, editPrompt(), { bytes, sha256: FRONTS[v] }, { step: 'trousers', variant: v });
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
}
main();
