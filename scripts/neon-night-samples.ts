/**
 * Neon night's four style samples (owner, 2026-11-04): made with Gemini 3.1 Flash Image, a closed model by Google, on
 * Vertex AI only, with zero data retention and no training, through scripts/lib/batch-model.ts. Drafts only: no database,
 * no storage, nothing published. Capped at $0.35: before every call (prompt check or picture) the worst case so far plus
 * that call's reserve must stay within the cap, or it stops. The subjects are the site's fixed sample subjects
 * (SAMPLE_SUBJECTS) and the prompt the site's samplePrompt, as a sample made on the site would be.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/neon-night-samples.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { SAMPLE_ASSIST, SAMPLE_SUBJECTS, samplePrompt } from '../src/lib/images/design-rules';
import { checkPrompt } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CLOSED_IMAGE_MODELS, GEMINI_TEXT_WORST_USD, closedImage, retentionRefusal } from './lib/batch-model';
import { readPlan } from './lib/bases-plan';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs/starting-sheet-drafts/neon-night');
const LEDGER = path.join(OUT, 'ledger.json');
const CAP = 0.35;
const GUARD_WORST = 0.0015;
const MODEL = 'gemini-3.1-flash-image' as const;
const SIZE = { width: 1024, height: 576 }; // a style sample's size on the site
mkdirSync(OUT, { recursive: true });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY; // batch calls go through the gateway only
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script');

type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger: { cap_usd: number; calls: Row[] } = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { cap_usd: CAP, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const tot = (k: 'costUsd' | 'worstUsd') => ledger.calls.reduce((n, c) => n + c[k], 0);
const gate = (what: string, worst: number) => {
  const after = tot('worstUsd') + worst;
  if (after > CAP + 1e-9) { console.log(`STOP before ${what}: worst-case total would be $${after.toFixed(4)} > $${CAP}`); save(); process.exit(0); }
};

const style = readPlan(ROOT).styles.find((s) => s.name === 'Neon night');
if (!style?.text || style.model !== MODEL) throw new Error('styles-plan.json: Neon night must be made with gemini-3.1-flash-image');
const why = await retentionRefusal(MODEL);
if (why) throw new Error(why);

async function toSample(original: Buffer): Promise<Buffer> {
  const { data } = await sharp(original).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(original).resize(SIZE.width, SIZE.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 88 }).toBuffer();
}

for (const [i, subject] of SAMPLE_SUBJECTS.entries()) {
  const file = `neon-night-sample-${i + 1}.jpg`;
  if (existsSync(path.join(OUT, file))) { console.log('exists', file); continue; }
  const prompt = samplePrompt(subject, style.text);
  const tag = { style: 'Neon night', slot: 'sample', n: i + 1 };
  if (blockedName(prompt)) { console.log('BLOCKED NAME', file); continue; }
  let ok = false;
  for (let a = 0; a < 3 && !ok; a++) {
    gate(`${file} check`, GUARD_WORST);
    const g = await checkPrompt(prompt, fakeRequest);
    ledger.calls.push({ ...tag, kind: 'prompt-check', model: IMAGES.guardModel, allow: g.allow, category: g.category, provider: g.provider, costUsd: g.costUsd, worstUsd: GUARD_WORST, at: new Date().toISOString() });
    save();
    console.log(`check ${file} allow=${g.allow} ${g.category ?? ''} $${g.costUsd.toFixed(6)}`);
    if (g.allow) ok = true; else if (g.category !== 'unclear') break;
  }
  if (!ok) { console.log('prompt check did not pass', file); continue; }
  gate(file, GEMINI_TEXT_WORST_USD);
  const at = new Date().toISOString();
  try {
    const made = await closedImage(MODEL, prompt, null, { aspect: '16:9' });
    const jpeg = await toSample(made.bytes);
    writeFileSync(path.join(OUT, file), jpeg);
    const recipe = {
      prompt, model: MODEL, endpoint: CLOSED_IMAGE_MODELS[MODEL].slug, host: 'Vercel AI Gateway',
      settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: SIZE, fit: 'contain, padded with the picture\'s own corner colour' } },
      seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: SIZE.width, height: SIZE.height,
      checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' }, assist: { ...SAMPLE_ASSIST, drafted: [...SAMPLE_ASSIST.drafted, 'style text'] },
    };
    ledger.calls.push({ ...tag, kind: 'image', file: `neon-night/${file}`, sha256: sha(jpeg), closed_model: true, maker: 'Google', costUsd: made.costUsd, worstUsd: GEMINI_TEXT_WORST_USD, recipe, response_meta: made.meta, at });
  } catch (e) {
    ledger.calls.push({ ...tag, kind: 'image-failed', error: String(e).slice(0, 400), costUsd: 0, worstUsd: GEMINI_TEXT_WORST_USD, at });
    console.log('FAILED', file, String(e).slice(0, 400));
  }
  save();
  console.log(`done ${file} | spent $${tot('costUsd').toFixed(5)} (worst $${tot('worstUsd').toFixed(4)} of $${CAP})`);
}
save();
console.log(`total $${tot('costUsd').toFixed(5)}; worst $${tot('worstUsd').toFixed(4)}; ${ledger.calls.length} calls`);
