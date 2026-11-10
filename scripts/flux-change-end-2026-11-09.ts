/**
 * FLUX change-at-the-end test (2026-11-09, owner-approved, hard cap $0.20): the re-test's 7 cases on FLUX.2 [klein] 4B
 * edit only, with the change words moved out of the first place and written as "The change: {change}".
 *   E (end):           reference line; look line; scene line; (no style); KEEP_LINE; IMAGES.suffix; "The change: …"
 *   S (before suffix): reference line; look line; scene line; (no style); KEEP_LINE; "The change: …"; IMAGES.suffix
 * Same seed as the re-test's FLUX pictures (20261108), Bai's or Zei's base front only. Prompt check (1,200 tokens)
 * first. Test pictures only: NO database, nothing published. Drafted by the coding agent (Claude, a closed model by
 * Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/flux-change-end-2026-11-09.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { IMAGES } from '../src/lib/config';
import { KEEP_LINE } from '../src/lib/challenge/styles';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CASES, LOOKS, SCENE_LINE } from './retest-2026-11-09-cases';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/flux-change-end-2026-11-09');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: flux-change-end-2026-11-09.ts <outdir>');
const REFS = path.join(OUT, '..', 'look-test', 'refs');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const STOP_AT = 0.19;
const SEED = 20261108;
const WORST = 0.0125;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY || !process.env.AI_GATEWAY_API_KEY) throw new Error('missing a key');
const fakeRequest = new Request('http://localhost/local-script');
const FRONT_SHA: Record<string, string> = { zei: '131f235227a54b06f6f11253f37a09b5001bf5f72326a6c9949a21800990dc7c', bai: '01538922456b9bf61192ed291b8f26595c694599b94eb95be8b60ce931b76a96' };
const NAME: Record<string, string> = { zei: 'Zei', bai: 'Bai' };

export function promptFor(c: (typeof CASES)[number], variant: 'E' | 'S'): string {
  const head = [`${NAME[c.ch]} is the person in reference image 1, the main figure.`, LOOKS[c.ch], SCENE_LINE, KEEP_LINE];
  const change = `The change: ${c.words.trim()}`;
  return (variant === 'E' ? [...head, IMAGES.suffix, change] : [...head, change, IMAGES.suffix]).join('\n\n');
}

const ledger: { about: string; cap_usd: number; stop_at_usd: number; seed: number; prompts: Record<string, string>; calls: any[] } = existsSync(LEDGER) // eslint-disable-line @typescript-eslint/no-explicit-any
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { about: 'FLUX change-at-the-end test 2026-11-09: variants E (after the no-words line) and S (just before it). Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.', cap_usd: 0.2, stop_at_usd: STOP_AT, seed: SEED, prompts: {}, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
const gate = (what: string, worst: number) => { if (spent() + worst > STOP_AT + 1e-9) { console.log(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst.toFixed(4)} > $${STOP_AT}`); save(); process.exit(2); } };

async function main() {
  for (const variant of ['E', 'S'] as const) for (const c of CASES) {
    const file = `fluxend-${variant}-c${String(c.change).padStart(2, '0')}-${c.ch}.jpg`;
    const prior = ledger.calls.filter((x: any) => x.file === file && x.kind === 'picture'); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (prior.some((x: any) => x.status !== 'error') || prior.length >= 2) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
    const prompt = promptFor(c, variant);
    const h = sha(Buffer.from(prompt));
    ledger.prompts[h] = prompt;
    const bn = blockedName(prompt);
    if (bn) { ledger.calls.push({ kind: 'guard', prompt_sha256: h, status: 'blocked-name', note: bn, cost_usd: 0, at: now() }); save(); continue; }
    const gw = guardWorstUsd(prompt.length, GUARD_TOKENS);
    gate('a prompt check', gw + WORST);
    const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
    ledger.calls.push({ kind: 'guard', prompt_sha256: h, max_tokens: GUARD_TOKENS, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, cost_usd: g.costUsd, cost_source: 'reported', at: now() });
    save();
    if (!g.allow) { console.log(`${file}: prompt check refused (${g.category})`); continue; }
    for (let attempt = prior.length + 1; attempt <= 2; attempt++) {
      gate(file, WORST);
      const ref = readFileSync(path.join(REFS, `${c.ch}-front.jpg`));
      if (sha(ref) !== FRONT_SHA[c.ch]) throw new Error('reference sha256 differs');
      const endpoint = IMAGES.editModel.endpoint;
      const settings = { image_size: { width: IMAGES.size.width, height: IMAGES.size.height }, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', sync_mode: true, seed: SEED };
      let row: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        const res = await fetch(`https://fal.run/${endpoint}`, { method: 'POST', headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' }, body: JSON.stringify({ prompt, image_urls: [`data:image/jpeg;base64,${ref.toString('base64')}`], ...settings }) });
        const units = Number(res.headers.get('x-fal-billable-units') ?? NaN);
        const text = await res.text();
        let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
        try { j = JSON.parse(text); } catch { /* not json */ }
        const mm = String(j.images?.[0]?.url ?? '').match(/^data:([^;]+);base64,(.+)$/);
        if (!res.ok || !mm) {
          const refused = res.status === 422 || /content|policy|safety|nsfw/i.test(text);
          row = { kind: 'picture', variant, character: c.ch, change: c.change, words: c.words, file, prompt_sha256: h, endpoint, status: refused ? 'refused' : 'error', note: `${res.status} ${text.slice(0, 300)}`, cost_usd: refused ? 0 : WORST, cost_source: refused ? '4xx: not billed' : 'worst counted', at: now(), attempt };
        } else {
          const raw = Buffer.from(mm[2], 'base64');
          writeFileSync(path.join(OUT, 'full', file), raw);
          row = { kind: 'picture', variant, character: c.ch, change: c.change, words: c.words, file, prompt_sha256: h, endpoint, host: 'fal.ai', request_id: res.headers.get('x-fal-request-id'), seed: j.seed ?? SEED, status: j.has_nsfw_concepts?.[0] ? 'filtered' : 'ok', cost_usd: Number.isFinite(units) ? units * IMAGES.editPricePerMp : WORST, cost_source: Number.isFinite(units) ? `fal's x-fal-billable-units (${units}) x $${IMAGES.editPricePerMp}/megapixel` : 'worst counted', sha256: sha(raw), settings, at: now(), attempt };
        }
      } catch (e) {
        row = { kind: 'picture', variant, character: c.ch, change: c.change, file, status: 'error', note: String((e as Error).message).slice(0, 300), cost_usd: WORST, cost_source: 'worst counted', at: now(), attempt };
      }
      ledger.calls.push(row); save();
      console.log(`${file}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)})`);
      if (row.status !== 'error') break;
    }
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
}
main();
