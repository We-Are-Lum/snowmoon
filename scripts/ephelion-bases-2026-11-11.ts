/**
 * Lord Ephelion base candidates (2026-11-11, owner-approved overnight task; cap $1.50, stop before $1.40): three
 * full-figure fronts in the challenge's "Animated series" look (BASE_STYLE.text, src/lib/challenge/base-style.ts on
 * origin/main), one per variant of the invented details (a, b, c). The book never describes his appearance; the only
 * book-based detail used is that he is a man (c21-b76, "So he's openly saying ..."). Everything visual is this
 * edition's invention, recorded per variant in the ledger.
 *
 * GPT Image 2.5 Sunburst from text alone (no reference), through the Vercel AI Gateway, pinned to openai, no training
 * (scripts/lib/batch-model.ts closedImageRequest, 1024 x 1536), fitted to the bases' 576 x 768 by the site's toView.
 * Prompt check (1,200 tokens) first. Settings read in place (--env-file=/Users/nathan/snowmoon/.env.local), never copied;
 * GROQ_API_KEY and VERCEL_OIDC_TOKEN removed from the process. Test pictures only: NO database, nothing published.
 * Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/ephelion-bases-2026-11-11.ts <outdir>
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
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/ephelion-2026-11-11');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: ephelion-bases-2026-11-11.ts <outdir>');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 1.4;
const WORST = 0.08;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const VIEW = { width: 576, height: 768 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('missing the gateway key');
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const fakeRequest = new Request('http://localhost/local-script');

/** Book-based: a man (c21-b76). Invented (this edition's), per variant. */
export const VARIANTS: Record<'a' | 'b' | 'c', string> = {
  a: 'a tall man in his fifties with pale skin, long platinum-white hair swept back to the shoulders and pale-blue eyes, wearing a long ice-blue high-collared coat with silver seams over a white suit, and white gloves',
  b: 'a tall man in his fifties with deep brown skin, close-cropped grey hair, a short grey beard and dark eyes, wearing a long charcoal-grey high-collared coat with silver trim over a dark suit',
  c: 'a tall man in his forties with olive skin, slicked-back black hair and grey eyes, wearing a long white high-collared coat with ice-blue panels over a white suit',
};
export const promptFor = (v: 'a' | 'b' | 'c') => [
  'Full body from head to shoes: one person, standing and facing the front, arms relaxed, on a plain flat light grey background with no scenery.',
  `The person is ${VARIANTS[v]}.`,
  BASE_STYLE.text,
  IMAGES.suffix,
].join('\n\n');

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: 'Lord Ephelion base candidates (2026-11-11): GPT Image 2.5, text only, Animated series, three variants of invented details. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.',
  cap_usd: 1.5, stop_at_usd: STOP_AT, base_style: BASE_STYLE, book_based: { detail: 'a man', block: 'c21-b76' }, variants: VARIANTS, prompts: {}, calls: [],
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
    const file = `ephelion-${v}-gpt.jpg`;
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
