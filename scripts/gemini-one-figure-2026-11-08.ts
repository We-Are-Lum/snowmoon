/**
 * The Gemini "one figure only" test of 2026-11-08 (owner-approved, cap $3.50, stop before $3.30): in the look test,
 * Gemini 3.1 Flash Image drew a row of 2-3 copies of the character in about 6 of 48 pictures. Fix F1 adds "Show one
 * figure only." right after the reference line. Fix F2 (crop the reference to its front figure) is not run: both base
 * fronts (Zei bffc7b6a, Bai 110d5973) show a single figure, so the crop would send the same picture. Fix F3 (FIX=F3) keeps line B with no added sentence and sends the
 * base front contain-padded to 16:9 (IMAGES.size) with its own corner colour, by the site's own toView
 * (src/lib/images/closed.ts); the route today sends the front as it is, 576 x 768 (3:4).
 *
 * Prompts as the route builds them (src/lib/challenge/make.ts remixPrompt, origin/challenge-models 0a2aa6ce), with
 * line B in KEEP_LINE's place and F1's sentence added; style Mood, as in the look test. Changes 2, 3, 4, 8 (where the
 * copies appeared) and 1, 7, 11, 12 (to check F1 doesn't hurt), Zei and Bai, line B, one picture each. Gemini only,
 * through the Vercel AI Gateway, pinned to vertex with zero data retention and no training (the site's own request,
 * checked by scripts/lib/batch-model.ts). Prompt check at 1,200 tokens first. NO database, nothing published.
 * Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/gemini-one-figure-2026-11-08.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { remixPrompt } from '../src/lib/challenge/make';
import { CHALLENGE_MODELS } from '../src/lib/challenge/models';
import { KEEP_LINE } from '../src/lib/challenge/styles';
import { challengeClosedRequest, hasC2pa, parseClosed, toView, toWide } from '../src/lib/images/closed';
import type { SheetModel } from '../src/lib/images/sheet-models';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, retentionCheck } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/gemini-one-figure-2026-11-08');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: gemini-one-figure-2026-11-08.ts <outdir>');
const LOOK_REFS = path.join(OUT, '..', 'look-test', 'refs');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 3.3;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const WORST = 0.09;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
if (!GW_KEY) throw new Error('missing the gateway key');
const fakeRequest = new Request('http://localhost/local-script');

const FRONT_SHA: Record<string, string> = { zei: '131f235227a54b06f6f11253f37a09b5001bf5f72326a6c9949a21800990dc7c', bai: '01538922456b9bf61192ed291b8f26595c694599b94eb95be8b60ce931b76a96' };
const CHARS = [{ id: 'zei', name: 'Zei' }, { id: 'bai', name: 'Bai' }];
const STYLE = 'Intense, highly detailed graphic novel look. Moody. Expressive. Dark lines, bold colors. Visible brushstrokes.';
const LINE_B = 'Keep the face recognisable; change anything else the words describe.';
export const F1 = 'Show one figure only.';
const FIX = (process.env.FIX ?? 'F1') as 'F1' | 'F3';
if (FIX !== 'F1' && FIX !== 'F3') throw new Error('FIX is F1 or F3');
export const CHANGES: Record<number, string> = {
  1: 'in a long winter coat and scarf, snow on the shoulders', 2: 'dressed all in bright red and gold', 3: 'aged about 70', 4: 'much taller, with a heavy, broad-shouldered build',
  7: 'shaved head', 8: 'as a medieval knight in armour', 11: 'as a deep-sea diver in a brass helmet, underwater', 12: 'as a fox',
};
const ORDER = [2, 3, 4, 8, 1, 7, 11, 12];

/** remixPrompt with line B in KEEP_LINE's place and F1's sentence after the reference line. */
export function promptF1(change: string, name: string): string {
  const ref = `${name} is the person in reference image 1, the main figure.`;
  const base = remixPrompt({ words: change, name, style: STYLE });
  if (!base.includes(ref) || !base.includes(KEEP_LINE)) throw new Error('remixPrompt changed shape');
  return base.replace(ref, `${ref} ${F1}`).replace(KEEP_LINE, LINE_B);
}

/** remixPrompt with line B in KEEP_LINE's place, nothing added (F3). */
export function promptB(change: string, name: string): string {
  const base = remixPrompt({ words: change, name, style: STYLE });
  if (!base.includes(KEEP_LINE)) throw new Error('remixPrompt changed shape');
  return base.replace(KEEP_LINE, LINE_B);
}

const ledger: { about: string; cap_usd: number; stop_at_usd: number; f2: string; prompts: Record<string, string>; calls: any[] } = existsSync(LEDGER) // eslint-disable-line @typescript-eslint/no-explicit-any
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { about: 'Gemini one-figure test 2026-11-08: line B + "Show one figure only." (F1), Zei and Bai, changes 1, 2, 3, 4, 7, 8, 11, 12. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.', cap_usd: 3.5, stop_at_usd: STOP_AT,
    f2: 'not run: both base fronts show one figure (checked by eye), so cropping to the front figure would send the same picture', prompts: {}, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
const gate = (what: string, worst: number) => {
  if (spent() + worst > STOP_AT + 1e-9) { console.log(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${STOP_AT}`); save(); process.exit(2); }
};

const m = CHALLENGE_MODELS.find((x) => x.id === 'gemini-3.1-flash-image')!;
async function main() {
  const { refusal, retention } = await retentionCheck('gemini-3.1-flash-image');
  ledger.calls.push({ kind: 'endpoint-list', status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, cost_source: 'free GET', at: now() });
  save();
  if (refusal) throw new Error(refusal);
  for (const c of ORDER) for (const ch of CHARS) {
    const prompt = FIX === 'F1' ? promptF1(CHANGES[c], ch.name) : promptB(CHANGES[c], ch.name);
    const h = sha(Buffer.from(prompt));
    ledger.prompts[h] = prompt;
    if (ledger.calls.some((x: any) => x.kind === 'picture' && (x.fix ?? 'F1') === FIX && x.change === c && x.character === ch.id && x.status !== 'error')) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
    const bn = blockedName(prompt);
    if (bn) { ledger.calls.push({ kind: 'guard', prompt_sha256: h, status: 'blocked-name', note: bn, cost_usd: 0, at: now() }); save(); continue; }
    const gw = guardWorstUsd(prompt.length, GUARD_TOKENS);
    gate('a prompt check', gw);
    const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
    ledger.calls.push({ kind: 'guard', prompt_sha256: h, max_tokens: GUARD_TOKENS, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, cost_usd: g.costUsd, cost_source: 'reported', worst_usd: gw, at: now() });
    save();
    if (!g.allow) { console.log(`${c} ${ch.id}: prompt check refused (${g.category})`); continue; }
    for (let attempt = 1; attempt <= 2; attempt++) {
      gate(`gemini ${c} ${ch.id}`, WORST);
      const front = readFileSync(path.join(LOOK_REFS, `${ch.id}-front.jpg`));
      if (sha(front) !== FRONT_SHA[ch.id]) throw new Error(`${ch.id}: reference sha256 differs`);
      const ref = FIX === 'F3' ? await toView(front, IMAGES.size) : front;
      const req = challengeClosedRequest(m, prompt, ref);
      assertGatewayOptions('gemini-3.1-flash-image', req.body as never);
      const file = `c${String(c).padStart(2, '0')}-${ch.id}-B-gemini-${FIX}.jpg`;
      let row: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const res = await fetch(req.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }).catch(() => null);
      const text = res ? await res.text() : '';
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const reported = Number(j.usage?.cost ?? j.providerMetadata?.gateway?.cost);
      const ok = Number.isFinite(reported);
      try {
        if (!res) throw new Error('no answer');
        const pic = parseClosed({ id: m.id } as SheetModel, res.status, j);
        const meta = await sharp(pic.bytes).metadata();
        const w = await toWide(pic.bytes, IMAGES.size);
        writeFileSync(path.join(OUT, 'full', file), w.bytes);
        row = { kind: 'picture', model: 'gemini', fix: FIX, reference: FIX === 'F3' ? { from_sha256: FRONT_SHA[ch.id], sent_sha256: sha(ref), how: `toView(front, ${IMAGES.size.width}x${IMAGES.size.height}): contain, padded with its own top-left colour, JPEG q92` } : { sent_sha256: FRONT_SHA[ch.id], how: 'the front as published, 576x768' }, line: 'B', change: c, character: ch.id, prompt_sha256: h, endpoint: m.call.endpoint, host: m.call.host, request_id: pic.requestId, status: 'ok', cost_usd: ok ? reported : WORST, cost_source: ok ? 'reported by the gateway' : 'worst case counted', worst_usd: WORST,
          sha256: sha(w.bytes), original_sha256: sha(pic.bytes), original_size: `${meta.width}x${meta.height}`, crop: { words: w.words, ...w.crop }, file, settings: req.settings, content_credentials: hasC2pa(pic.bytes) ? 'C2PA manifest in the original' : 'none found', usage: j.usage ?? null, at: now(), attempt };
      } catch (e) {
        const refused = res?.ok === true || /safety|policy|blocked|prohibit/i.test(text);
        row = { kind: 'picture', model: 'gemini', fix: FIX, reference: FIX === 'F3' ? { from_sha256: FRONT_SHA[ch.id], sent_sha256: sha(ref), how: `toView(front, ${IMAGES.size.width}x${IMAGES.size.height}): contain, padded with its own top-left colour, JPEG q92` } : { sent_sha256: FRONT_SHA[ch.id], how: 'the front as published, 576x768' }, line: 'B', change: c, character: ch.id, prompt_sha256: h, status: refused ? 'refused' : 'error', note: `${(e as Error).message} ${text.slice(0, 300)}`, cost_usd: ok ? reported : (res && res.status >= 400 && res.status < 500 ? 0 : WORST), cost_source: ok ? 'reported by the gateway' : 'not reported', worst_usd: WORST, at: now(), attempt };
      }
      ledger.calls.push(row);
      save();
      console.log(`gemini ${FIX} ${c} ${ch.id}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})`);
      if (row.status !== 'error') break;
    }
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
}
main();
