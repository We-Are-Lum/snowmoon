/**
 * Lord Ephelion: two more base candidates in candidate a's outfit (owner, 2026-11-11: "keep candidate 1's outfit (the
 * ice-blue high-collared coat) and make two more in that same outfit with candidates 2 and 3's looks"; GPT, cap $0.30).
 * GPT Image 2.5 Sunburst EDIT from candidate a's front (sha256 858fa6dc…, docs/starting-sheet-drafts/ephelion-2026-11-11),
 * through the Vercel AI Gateway, pinned to openai, no training (scripts/lib/batch-model.ts closedImageRequest), fitted to
 * the bases' 576 x 768 by the site's toView. Prompt check first. Everything visual is this edition's invention; the only
 * book-based detail is that he is a man (c21-b76). Settings read in place (--env-file=/Users/nathan/snowmoon/.env.local),
 * never copied; GROQ_API_KEY and VERCEL_OIDC_TOKEN removed from the process. Test pictures only: no database, nothing
 * published. Stops before the $0.30 cap counting each picture at its worst price. Drafted by the coding agent (Claude, a
 * closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/ephelion-recast-2026-11-11.ts <candidate a full jpg> <outdir>
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
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/ephelion-recast-2026-11-11');
const LEDGER = path.join(DOC, 'ledger.json');
const [REF, OUT] = process.argv.slice(2);
if (!REF || !OUT) throw new Error('usage: ephelion-recast-2026-11-11.ts <candidate a full jpg> <outdir>');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const CAP = 0.3;
const WORST = 0.08;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const VIEW = { width: 576, height: 768 };
const REF_SHA = '858fa6dc49f0b26434e46d9bf0ccecc576941a0eaac54ac5d2e8b304db3fc28f';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('missing the gateway key');
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const fakeRequest = new Request('http://localhost/local-script');
const ref = readFileSync(REF);
if (sha(ref) !== REF_SHA) throw new Error(`the reference is not candidate a (sha256 ${sha(ref)})`);

/** Candidate a's outfit, exactly as its prompt said; the looks of candidates b and c, exactly as theirs said. */
const OUTFIT = 'a long ice-blue high-collared coat with silver seams over a white suit, and white gloves';
export const LOOKS: Record<'b' | 'c', string> = {
  b: 'a tall man in his fifties with deep brown skin, close-cropped grey hair, a short grey beard and dark eyes',
  c: 'a tall man in his forties with olive skin, slicked-back black hair and grey eyes',
};
export const promptFor = (v: 'b' | 'c') => [
  `The person in reference image 1, recast as ${LOOKS[v]}, wearing exactly the same clothes as in reference image 1: ${OUTFIT}.`,
  'Full body from head to shoes: one person, standing and facing the front, arms relaxed, on a plain flat light grey background with no scenery.',
  `Keep the drawing style of reference image 1. ${BASE_STYLE.text}`,
  IMAGES.suffix,
].join('\n\n');

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: "Lord Ephelion: candidates b and c's looks in candidate a's outfit (owner, 2026-11-11), GPT Image 2.5 edit from candidate a's front. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.",
  cap_usd: CAP, reference: { file: 'ephelion-2026-11-11/ephelion-a-gpt.jpg', sha256: REF_SHA, what: "candidate a's front (its outfit kept)" },
  book_based: { detail: 'a man', block: 'c21-b76' }, outfit: OUTFIT, looks: LOOKS, prompts: {}, calls: [],
};
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
const gate = (what: string, worst: number) => { if (spent() + worst > CAP + 1e-9) { console.log(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${CAP}`); save(); process.exit(2); } };

async function main() {
  const ok = new Map<string, boolean>();
  for (const v of ['b', 'c'] as const) {
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
  for (const v of ['b', 'c'] as const) {
    if (!ok.get(v)) { console.log(`${v}: the prompt check refused it`); continue; }
    const file = `ephelion-coat-${v}-gpt.jpg`;
    if (ledger.calls.some((x: any) => x.file === file && x.status === 'ok')) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let attempt = 1; attempt <= 2; attempt++) {
      gate(file, WORST);
      const prompt = promptFor(v);
      const req = closedImageRequest('gpt-image-2.5-sunburst', prompt, { bytes: ref, contentType: 'image/jpeg' });
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
        row = { kind: 'picture', model: 'gpt', variant: v, file, prompt_sha256: sha(Buffer.from(prompt)), reference_sha256: REF_SHA, endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', request_id: j.providerMetadata?.gateway?.generationId ?? null, status: 'ok',
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
