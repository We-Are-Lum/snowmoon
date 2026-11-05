/**
 * Deluin b without the green shoulder bag (owner, 2026-11-05): one new front, then its side and back views from that
 * front, the same model and settings as Deluin b3 (Gemini 3.1 Flash Image on Vertex, zero retention, through
 * scripts/lib/batch-model.ts), with only a negative added: no bag, no shoulder strap, nothing carried. Drafts only.
 * Capped at $0.25 for every call this script makes (prompt checks included), checked before each call on the worst case.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/deluin-b4.ts front [label]
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/deluin-b4.ts views <front label>
 * label: b4 (first try) or b5 (the one retry).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { SAMPLE_ASSIST } from '../src/lib/images/design-rules';
import { checkPrompt } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CLOSED_IMAGE_MODELS, closedImage, retentionRefusal } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/starting-sheet-drafts/directions');
const LEDGER = path.join(DIR, 'ledger.json');
const CAP = 0.25;
const GUARD_WORST = 0.0015;
const MODEL = 'gemini-3.1-flash-image' as const;
// Reserve per picture: the gateway's list price for a 1K Gemini image, $0.067, plus input tokens ($0.50 per million; one
// 576 x 768 reference is about 1,120 tokens, the prompt a few hundred) and a margin: $0.075 (b3 and its views cost
// $0.0671 to $0.0677). The batch path's general $0.09 would not let three pictures fit the owner's $0.25.
const WORST = 0.075;
const NO_BAG = 'No bag, no shoulder strap, nothing carried.';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY;
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script');

type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { calls: Row[] };
const mine = () => ledger.calls.filter((c) => c.task === 'deluin-b-no-bag');
const tot = (k: 'costUsd' | 'worstUsd') => mine().reduce((n, c) => n + c[k], 0);
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const gate = (what: string, worst: number) => {
  const after = tot('worstUsd') + worst;
  if (after > CAP + 1e-9) { console.log(`STOP before ${what}: worst-case total would be $${after.toFixed(4)} > $${CAP}`); save(); process.exit(0); }
};

// b3's own prompts, read from its recipes: the same words, plus the negative before the no-words line.
const b3 = ledger.calls.find((c) => c.kind === 'image' && c.file === 'directions/deluin-recast-b3-gemini.jpg') as Row & { recipe: { prompt: string } };
const b3side = ledger.calls.find((c) => c.kind === 'image' && c.file === 'directions/deluin-recast-b-side-gemini.jpg') as Row & { recipe: { prompt: string } };
const b3back = ledger.calls.find((c) => c.kind === 'image' && c.file === 'directions/deluin-recast-b-back-gemini.jpg') as Row & { recipe: { prompt: string } };
if (!b3 || !b3side || !b3back) throw new Error('b3 recipes not found');
const withNoBag = (p: string) => {
  if (!p.endsWith(IMAGES.suffix)) throw new Error('unexpected prompt end');
  return p.slice(0, -IMAGES.suffix.length) + `${NO_BAG}\n\n${IMAGES.suffix}`;
};
const STYLE_TEXT = b3.recipe.prompt.split('\n\n')[1];

async function toView(bytes: Buffer): Promise<Buffer> {
  const { data } = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(bytes).resize(IMAGES.viewSize.width, IMAGES.viewSize.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 88 }).toBuffer();
}

async function make(tag: Record<string, unknown>, file: string, prompt: string, ref: { file: string; bytes: Buffer } | null) {
  if (existsSync(path.join(DIR, file))) { console.log('exists', file); return; }
  if (blockedName(prompt)) throw new Error('blocked name');
  let ok = false;
  for (let a = 0; a < 3 && !ok; a++) {
    gate(`${file} check`, GUARD_WORST);
    const g = await checkPrompt(prompt, fakeRequest, IMAGES.designs.guardMaxTokens);
    ledger.calls.push({ ...tag, task: 'deluin-b-no-bag', kind: 'prompt-check', model: IMAGES.guardModel, allow: g.allow, category: g.category, provider: g.provider, costUsd: g.costUsd, worstUsd: GUARD_WORST, at: new Date().toISOString() });
    save();
    if (g.allow) ok = true; else if (g.category !== 'unclear') break;
  }
  if (!ok) { console.log('prompt check did not pass', file); return; }
  gate(file, WORST);
  const at = new Date().toISOString();
  try {
    const made = await closedImage(MODEL, prompt, ref ? { bytes: ref.bytes, contentType: 'image/jpeg' } : null, { aspect: '3:4' });
    const jpeg = await toView(made.bytes);
    writeFileSync(path.join(DIR, file), jpeg);
    const recipe = {
      prompt, model: MODEL, endpoint: CLOSED_IMAGE_MODELS[MODEL].slug, host: 'Vercel AI Gateway',
      settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: IMAGES.viewSize, fit: 'contain, padded with the picture\'s own corner colour' } },
      seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: IMAGES.viewSize.width, height: IMAGES.viewSize.height,
      ...(ref ? { references: [{ sha256: sha(ref.bytes), what: `the base's front, ${ref.file}, made by ${MODEL} (its recipe is in this ledger)` }] } : {}),
      style: { version_id: 'unpublished: docs/starting-sheet-drafts/directions/plan.json', title: 'Animated series', text: STYLE_TEXT },
      checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' },
      assist: { ...SAMPLE_ASSIST, drafted: [...SAMPLE_ASSIST.drafted, 'style text', 'character descriptor'] },
    };
    ledger.calls.push({ ...tag, task: 'deluin-b-no-bag', kind: 'image', file: `directions/${file}`, sha256: sha(jpeg), closed_model: true, maker: 'Google', costUsd: made.costUsd, worstUsd: WORST, recipe, response_meta: made.meta, at });
  } catch (e) {
    ledger.calls.push({ ...tag, task: 'deluin-b-no-bag', kind: 'image-failed', error: String(e).slice(0, 400), costUsd: 0, worstUsd: WORST, at });
    console.log('FAILED', file, String(e).slice(0, 400));
  }
  save();
  console.log(`done ${file} | spent $${tot('costUsd').toFixed(5)} (worst $${tot('worstUsd').toFixed(4)} of $${CAP})`);
}

const why = await retentionRefusal(MODEL);
if (why) throw new Error(why);
const [mode, label = 'b4'] = process.argv.slice(2);
if (!['b4', 'b5'].includes(label)) throw new Error('label must be b4 or b5');
const frontFile = `deluin-recast-${label}-gemini.jpg`;
const base = { char: 'deluin', direction: 'animated', recast: true, option: label, model: MODEL, replaces: 'directions/deluin-recast-b3-gemini.jpg (a green shoulder bag not in his clothes)' };
if (mode === 'front') {
  await make({ ...base, from: 'text' }, frontFile, withNoBag(b3.recipe.prompt), null);
} else if (mode === 'views') {
  const front = readFileSync(path.join(DIR, frontFile));
  await make({ ...base, view: 'side', from: `front:directions/${frontFile}`, base: `deluin-recast-${label}` }, `deluin-recast-${label}-side-gemini.jpg`, withNoBag(b3side.recipe.prompt), { file: `directions/${frontFile}`, bytes: front });
  await make({ ...base, view: 'back', from: `front:directions/${frontFile}`, base: `deluin-recast-${label}` }, `deluin-recast-${label}-back-gemini.jpg`, withNoBag(b3back.recipe.prompt), { file: `directions/${frontFile}`, bytes: front });
} else throw new Error('mode: front or views');
console.log(`total $${tot('costUsd').toFixed(5)}; worst $${tot('worstUsd').toFixed(4)}`);
