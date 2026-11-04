/**
 * Design directions and the "Animated series" fronts (owner, 2026-11-04; docs/starting-sheet-drafts/directions/plan.json):
 * Zei and Bai from crops of the owner's own reference picture (made outside the site with Midjourney, "Brought in"),
 * once with Gemini 3.1 Flash Image and once with GPT Image 2.5 Sunburst; the other four from their descriptors; then
 * Zei's two other directions from text, on both models. Drafts only: no database, no storage, nothing published.
 * Capped at $1: before every call the worst case so far plus that call's reserve must stay within it, or it stops.
 * Closed calls only through scripts/lib/batch-model.ts (Google on Vertex with ZDR; OpenAI with no training, the endpoint
 * list read and the retention recorded). Every prompt passes the site's prompt check first.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/zei-directions.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { SAMPLE_ASSIST } from '../src/lib/images/design-rules';
import { checkPrompt } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CLOSED_IMAGE_MODELS, GEMINI_TEXT_WORST_USD, closedImage, retentionRefusal, type ClosedImageModel } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/starting-sheet-drafts/directions');
const LEDGER = path.join(DIR, 'ledger.json');
const CAP = 1.0;
const GUARD_WORST = 0.0015;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY; // batch calls go through the gateway only
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script');

type Plan = {
  reference: { file: string; sha256: string; width: number; height: number; made_by: string; label: string; prompt: string | null; prompt_note: string; crops: Record<string, { left: number; top: number; width: number; height: number }> };
  styles: Record<string, string>;
  directions: { id: string; name: string; style: string }[];
  descriptors: Record<string, string>;
  fronts: { key: string; model: ClosedImageModel; from: string }[];
};
const plan = JSON.parse(readFileSync(path.join(DIR, 'plan.json'), 'utf8')) as Plan;

type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger: { cap_usd: number; brought_in?: unknown; calls: Row[] } = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { cap_usd: CAP, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const tot = (k: 'costUsd' | 'worstUsd') => ledger.calls.reduce((n, c) => n + c[k], 0);
const gate = (what: string, worst: number) => {
  const after = tot('worstUsd') + worst;
  if (after > CAP + 1e-9) { console.log(`STOP before ${what}: worst-case total would be $${after.toFixed(4)} > $${CAP}`); save(); process.exit(0); }
};

// ---- The owner's reference picture, brought in, and its two crops (no model) ----
const original = readFileSync(plan.reference.file);
if (sha(original) !== plan.reference.sha256) throw new Error('the reference picture changed');
const small = await sharp(original).resize({ width: 1288 }).jpeg({ quality: 85 }).toBuffer();
writeFileSync(path.join(DIR, 'reference-small.jpg'), small);
const crops: Record<string, { bytes: Buffer; sha256: string; box: unknown }> = {};
for (const [who, box] of Object.entries(plan.reference.crops)) {
  const bytes = await sharp(original).extract(box).resize({ height: 1024 }).jpeg({ quality: 88 }).toBuffer();
  writeFileSync(path.join(DIR, `reference-crop-${who}.jpg`), bytes);
  crops[who] = { bytes, sha256: sha(bytes), box };
}
ledger.brought_in = {
  what: 'the owner\'s own reference picture, made outside the site',
  label: plan.reference.label, made_by: plan.reference.made_by, original: { sha256: plan.reference.sha256, width: plan.reference.width, height: plan.reference.height },
  prompt: plan.reference.prompt, prompt_note: plan.reference.prompt_note,
  small_copy: { file: 'directions/reference-small.jpg', sha256: sha(small), note: 'resized to 1288 wide, JPEG; no model' },
  crops: Object.fromEntries(Object.entries(crops).map(([w, c]) => [w, { file: `directions/reference-crop-${w}.jpg`, box: c.box, sha256: c.sha256, note: 'cropped from the original at this box, resized to 1024 high, JPEG; no model; this is the picture sent as the reference' }])),
};
save();

const REF_LINE = 'The same person as in the reference picture, full body from head to shoes, standing in a relaxed three-quarter stance with some personality, plain light grey background. Keep the face, hair, skin and clothes the same.';
const TEXT_LINE = 'Character reference picture: one person, full body from head to shoes, standing in a relaxed three-quarter stance with some personality, plain light grey background.';
const descriptorOf = (key: string) => {
  const [who] = key.split('/');
  if (plan.descriptors[key]) return plan.descriptors[key];
  const c = JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/designs/characters/${who}.json`), 'utf8')) as { descriptor: string };
  return c.descriptor; // word for word from the character file
};

async function toView(bytes: Buffer): Promise<Buffer> {
  const { data } = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(bytes).resize(IMAGES.viewSize.width, IMAGES.viewSize.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 88 }).toBuffer();
}

for (const r of await Promise.all((['gemini-3.1-flash-image', 'gpt-image-2.5-sunburst'] as const).map((m) => retentionRefusal(m)))) if (r) throw new Error(r);

for (const f of plan.fronts) {
  const [who, dir] = f.key.split('/');
  const direction = plan.directions.find((d) => d.id === dir)!;
  const short = f.model === 'gemini-3.1-flash-image' ? 'gemini' : 'gpt';
  const file = `${who}-${dir}-${short}.jpg`;
  if (existsSync(path.join(DIR, file))) { console.log('exists', file); continue; }
  const fromCrop = f.from.startsWith('crop:');
  const prompt = [fromCrop ? REF_LINE : TEXT_LINE, plan.styles[direction.style], descriptorOf(f.key), IMAGES.suffix].join('\n\n');
  const tag = { char: who, direction: dir, model: f.model, from: f.from };
  if (blockedName(prompt)) { console.log('BLOCKED NAME', file); continue; }
  let ok = false;
  for (let a = 0; a < 3 && !ok; a++) {
    gate(`${file} check`, GUARD_WORST);
    const g = await checkPrompt(prompt, fakeRequest, IMAGES.designs.guardMaxTokens);
    ledger.calls.push({ ...tag, kind: 'prompt-check', model: IMAGES.guardModel, allow: g.allow, category: g.category, provider: g.provider, costUsd: g.costUsd, worstUsd: GUARD_WORST, at: new Date().toISOString() });
    save();
    console.log(`check ${file} allow=${g.allow} ${g.category ?? ''} $${g.costUsd.toFixed(6)}`);
    if (g.allow) ok = true; else if (g.category !== 'unclear') break;
  }
  if (!ok) { console.log('prompt check did not pass', file); continue; }
  const m = CLOSED_IMAGE_MODELS[f.model];
  const worst = fromCrop ? m.worstUsd : f.model === 'gemini-3.1-flash-image' ? GEMINI_TEXT_WORST_USD : m.worstUsd;
  gate(file, worst);
  const at = new Date().toISOString();
  const crop = fromCrop ? crops[f.from.slice(5)] : null;
  try {
    const made = await closedImage(f.model, prompt, crop ? { bytes: crop.bytes, contentType: 'image/jpeg' } : null, { aspect: '3:4' });
    const jpeg = await toView(made.bytes);
    writeFileSync(path.join(DIR, file), jpeg);
    const recipe = {
      prompt, model: f.model, endpoint: m.slug, host: 'Vercel AI Gateway',
      settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: IMAGES.viewSize, fit: 'contain, padded with the picture\'s own corner colour' } },
      seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: IMAGES.viewSize.width, height: IMAGES.viewSize.height,
      ...(crop ? { references: [{ sha256: crop.sha256, what: `Brought in: a crop (box ${JSON.stringify(crop.box)}) of the owner's picture made outside the site with ${plan.reference.made_by} (original sha256 ${plan.reference.sha256}); its prompt: not given yet` }] } : {}),
      style: { version_id: 'unpublished: docs/starting-sheet-drafts/directions/plan.json', title: direction.style, text: plan.styles[direction.style] },
      checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' },
      assist: { ...SAMPLE_ASSIST, drafted: [...SAMPLE_ASSIST.drafted, 'style text', 'character descriptor'] },
    };
    ledger.calls.push({ ...tag, kind: 'image', file: `directions/${file}`, sha256: sha(jpeg), closed_model: true, maker: m.maker, costUsd: made.costUsd, worstUsd: worst, recipe, response_meta: made.meta, at });
  } catch (e) {
    ledger.calls.push({ ...tag, kind: 'image-failed', error: String(e).slice(0, 400), costUsd: 0, worstUsd: worst, at });
    console.log('FAILED', file, String(e).slice(0, 400));
  }
  save();
  console.log(`done ${file} | spent $${tot('costUsd').toFixed(5)} (worst $${tot('worstUsd').toFixed(4)} of $${CAP})`);
}
save();
console.log(`total $${tot('costUsd').toFixed(5)}; worst $${tot('worstUsd').toFixed(4)}; ${ledger.calls.length} calls`);
