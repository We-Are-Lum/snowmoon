/**
 * Per-base look lines, a quick check (owner, 2026-11-11, PR #155): Gladias look a and Deluin look a, each remixed with
 * "at a concert" and with "shaved head", on GPT Image 2.5 Sunburst, with exactly the prompt the make route builds
 * (src/lib/challenge/make.ts remixPrompt, read from the per-base-looks branch): the words, the reference line, the base's
 * own short look line, the scene line, a drawn setting line (closed models get one), no style ("Same as this picture"),
 * the closing line and the suffix. Does the skin hold, and does the change come through? Through the Vercel AI Gateway,
 * pinned to openai, no training (scripts/lib/batch-model.ts). Cap $0.25, each picture counted at $0.06 before it is made
 * (GPT edits cost $0.048 on 10 and 11 Nov). Settings read in place, never copied. Test pictures only. Drafted by the
 * coding agent (Claude, a closed model by Anthropic). DRAFT.
 *
 *   npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local scripts/look-check-2026-11-11.ts <outdir>
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { hasC2pa } from '../src/lib/images/closed';
import { checkPrompt, guardWorstUsd } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { assertGatewayOptions, closedImageRequest, retentionCheck } from './lib/batch-model';
import { BASE_LOOKS, SCENE_LINE } from '../../snowmoon-base-looks/src/lib/challenge/looks';
import { drawSetting, settingLine } from '../../snowmoon-base-looks/src/lib/challenge/settings';

const ROOT = path.resolve(import.meta.dirname, '..');
const BRANCH = path.resolve(ROOT, '../snowmoon-base-looks');
const DOC = path.join(ROOT, 'docs/starting-sheet-drafts/look-check-2026-11-11');
const LEDGER = path.join(DOC, 'ledger.json');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: look-check-2026-11-11.ts <outdir>');
mkdirSync(path.join(OUT, 'full'), { recursive: true });
mkdirSync(DOC, { recursive: true });

const CAP = 0.25;
const WORST = 0.06;
const GUARD_TOKENS = IMAGES.designs.guardMaxTokens;
const VIEW = { width: 1024, height: 576 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
delete process.env.GROQ_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('missing the gateway key');
const GW_KEY = process.env.AI_GATEWAY_API_KEY;
const fakeRequest = new Request('http://localhost/local-script');

// The closing line, read from the branch (src/lib/challenge/styles.ts KEEP_LINE), so the prompt is the route's.
const KEEP_LINE = /export const KEEP_LINE = '([^']+)';/.exec(readFileSync(path.join(BRANCH, 'src/lib/challenge/styles.ts'), 'utf8'))![1];
const BASES = {
  gladias: { name: 'Gladias', file: 'docs/starting-sheet-drafts/directions/gladias-recast-a-gemini.jpg', sha256: 'bca41e700fdb72334d08334843e53c78381f824e0f2ea7db57eeef31dc54c4b6' },
  deluin: { name: 'Deluin', file: 'docs/starting-sheet-drafts/directions/deluin-recast-a-gemini.jpg', sha256: 'd2ebbc5fc7afc9746fc68c2ff3a6035cf885f75e8d7f5939bc4e5bbd66717b12' },
} as const;
const WORDS = ['at a concert', 'shaved head'] as const;
const front = (c: keyof typeof BASES) => {
  const b = execFileSync('git', ['show', `origin/challenge-styles:${BASES[c].file}`], { cwd: ROOT, maxBuffer: 1 << 26 });
  if (sha(b) !== BASES[c].sha256) throw new Error(`${c}: the base front isn't the pinned one`);
  return b;
};
// remixPrompt's order (src/lib/challenge/make.ts on the branch), with no style for "Same as this picture".
const promptFor = (c: keyof typeof BASES, words: string, setting: string) =>
  [words, `${BASES[c].name} is the person in reference image 1, the main figure.`, BASE_LOOKS[BASES[c].sha256], SCENE_LINE, setting, KEEP_LINE, IMAGES.suffix].filter(Boolean).join('\n\n');

const ledger: any = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { // eslint-disable-line @typescript-eslint/no-explicit-any
  about: "Per-base look lines, a quick check (owner, 2026-11-11, PR #155): Gladias look a and Deluin look a with 'at a concert' and 'shaved head', GPT Image 2.5, the make route's prompt. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT. Test pictures only.",
  cap_usd: CAP, bases: BASES, looks: { gladias: BASE_LOOKS[BASES.gladias.sha256], deluin: BASE_LOOKS[BASES.deluin.sha256] }, prompts: {}, calls: [],
};
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n: number, c: any) => n + c.cost_usd, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => new Date().toISOString();
const gate = (what: string, worst: number) => { if (spent() + worst > CAP + 1e-9) { console.log(`STOP before ${what}: spent $${spent().toFixed(4)} + worst $${worst} > $${CAP}`); save(); process.exit(2); } };

async function main() {
  const { refusal, retention } = await retentionCheck('gpt-image-2.5-sunburst');
  ledger.calls.push({ kind: 'endpoint-list', model: 'gpt', status: refusal ? 'refused' : 'ok', note: refusal ?? undefined, retention, cost_usd: 0, at: now() }); save();
  if (refusal) throw new Error(refusal);
  for (const c of ['gladias', 'deluin'] as const) {
    const ref = front(c);
    for (const words of WORDS) {
      const file = `${c}-a-${words.replace(/\s+/g, '-')}-gpt.jpg`;
      if (ledger.calls.some((x: any) => x.file === file && x.status === 'ok')) continue; // eslint-disable-line @typescript-eslint/no-explicit-any
      const s = drawSetting();
      const prompt = promptFor(c, words, settingLine(s));
      const h = sha(Buffer.from(prompt));
      ledger.prompts[h] = prompt;
      const bn = blockedName(prompt);
      if (bn) { ledger.calls.push({ kind: 'guard', file, status: 'blocked-name', note: bn, cost_usd: 0, at: now() }); save(); continue; }
      const w = guardWorstUsd(prompt.length, GUARD_TOKENS);
      gate('a prompt check', w);
      const g = await checkPrompt(prompt, fakeRequest, GUARD_TOKENS);
      ledger.calls.push({ kind: 'guard', file, prompt_sha256: h, status: g.allow ? 'ok' : 'guard-refused', note: g.category ?? undefined, cost_usd: g.costUsd, cost_source: 'reported', at: now() }); save();
      if (!g.allow) continue;
      gate(file, WORST);
      // As the make route asks (challengeClosedRequest, src/lib/images/closed.ts): a 1536 x 1024 edit, cut to 16:9.
      const req = closedImageRequest('gpt-image-2.5-sunburst', prompt, { bytes: ref, contentType: 'image/jpeg' });
      (req.body as { size: string }).size = '1536x1024';
      (req.settings as { size: string }).size = '1536x1024';
      assertGatewayOptions('gpt-image-2.5-sunburst', req.body as never);
      const res = await fetch(req.url, { method: 'POST', headers: { Authorization: `Bearer ${GW_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }).catch(() => null);
      const text = res ? await res.text() : '';
      let j: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(text); } catch { /* not json */ }
      const reported = Number(j.providerMetadata?.gateway?.cost);
      const b64 = j.data?.[0]?.b64_json;
      let row: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!res || !res.ok || typeof b64 !== 'string') {
        row = { kind: 'picture', model: 'gpt', base: c, words, file, prompt_sha256: h, setting: s.id, status: 'error', note: `${res?.status ?? 'no answer'} ${text.slice(0, 300)}`, cost_usd: Number.isFinite(reported) ? reported : WORST, cost_source: Number.isFinite(reported) ? 'reported by the gateway' : 'worst counted', at: now() };
      } else {
        const orig = Buffer.from(b64, 'base64');
        const meta = await sharp(orig).metadata();
        const out = await sharp(orig).resize(VIEW.width, VIEW.height, { fit: 'cover', position: 'top' }).jpeg({ quality: 90 }).toBuffer();
        writeFileSync(path.join(OUT, 'full', file), out);
        row = { kind: 'picture', model: 'gpt', base: c, base_sha256: BASES[c].sha256, words, setting: s.id, file, prompt_sha256: h, endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', request_id: j.providerMetadata?.gateway?.generationId ?? null, status: 'ok',
          cost_usd: Number.isFinite(reported) ? reported : WORST, cost_source: Number.isFinite(reported) ? 'reported by the gateway' : 'worst counted', sha256: sha(out), original_sha256: sha(orig), original_size: `${meta.width}x${meta.height}`,
          converted: `cut to ${VIEW.width}x${VIEW.height} (16:9, from the top)`, settings: req.settings, content_credentials: hasC2pa(orig) ? 'C2PA manifest in the original' : 'none found', at: now() };
      }
      ledger.calls.push(row); save();
      console.log(`${file}: ${row.status} $${row.cost_usd.toFixed(4)} (spent $${spent().toFixed(4)}) setting ${s.id}`);
    }
  }
  console.log(`DONE spent $${spent().toFixed(4)}`);
}
main();
