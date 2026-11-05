/**
 * Bai's front, made again from a crop of Garance's edit of the owner's picture (owner, 2026-11-05): Garance darkened
 * Bai's skin to match her sheet, and agreed to the edit's use in the project and as a Midjourney reference; every recipe
 * that uses it credits him. Made the same way as her current front (directions/bai-animated-gpt.jpg): GPT Image 2.5
 * Sunburst, a closed model by OpenAI, editing a crop of the picture, with her current front's prompt word for word.
 *
 * The edit is brought in byte for byte (~/Downloads/zei and bai.jpg, the owner's file, 2752 × 1536). It is the owner's
 * Midjourney picture (2576 × 1438) scaled by exactly 1.0683, so Bai's crop box is the original box scaled the same way.
 * Its own metadata says "Made with Google AI": the tool and prompt Garance used are not reported.
 *
 * Drafts only: nothing published. Calls go only through scripts/lib/batch-model.ts. Cap: $0.10 for this one picture
 * (owner: about $0.05), prompt check included, counted from the ledger's rows tagged `baiGarance`.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/redo-bai-front-garance.ts [--dry]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { checkPrompt } from '../src/lib/images/guard';
import { CLOSED_IMAGE_MODELS, closedImage, retentionRefusal } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/starting-sheet-drafts/directions');
const LEDGER = path.join(DIR, 'ledger.json');
const CAP = 0.1;
const GUARD_WORST = 0.0015;
const DRY = process.argv.includes('--dry');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const SOURCE = path.join(os.homedir(), 'Downloads', 'zei and bai.jpg');
const CREDIT =
  "Garance's edit of the owner's picture (Garance darkened Bai's skin to match her sheet; he agreed to its use in the project and as a Midjourney reference, owner, 2026-11-05). The owner's picture was made outside the site with Midjourney, a closed model by Midjourney. The edit's own metadata says \"Made with Google AI\"; the tool and prompt Garance used are not reported.";

delete process.env.GROQ_API_KEY;
if (!DRY && !process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script');

type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { calls: Row[]; brought_in_garance?: unknown } & Record<string, unknown>;
const save = () => { if (!DRY) writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); };
const spent = () => ledger.calls.filter((c) => c.baiGarance === true).reduce((n, c) => n + c.costUsd, 0);
const gate = (what: string, worst: number) => {
  if (spent() + worst > CAP + 1e-9) {
    console.log(`STOP before ${what}: spent $${spent().toFixed(5)} + worst $${worst} > $${CAP}`);
    save();
    process.exit(0);
  }
};

// The edit, brought in byte for byte, and Bai's crop (no model).
const edit = readFileSync(SOURCE);
const meta = await sharp(edit).metadata();
if (meta.width !== 2752 || meta.height !== 1536) throw new Error(`unexpected size ${meta.width}×${meta.height}`);
const BOX = { left: 1560, top: 0, width: 1192, height: 1536 }; // the original box {1460, 0, 1116, 1438} × 2752/2576
mkdirSync(path.join(DIR, 'brought-in'), { recursive: true });
const editFile = 'brought-in/zei-bai-garance-edit.jpg';
if (!DRY) writeFileSync(path.join(DIR, editFile), edit);
const crop = await sharp(edit).extract(BOX).resize({ height: 1024 }).jpeg({ quality: 88 }).toBuffer();
const cropFile = 'reference-crop-bai-garance.jpg';
if (!DRY) writeFileSync(path.join(DIR, cropFile), crop);
ledger.brought_in_garance = {
  file: `directions/${editFile}`, sha256: sha(edit), size: { width: meta.width, height: meta.height },
  credit: CREDIT, original_filename: 'zei and bai.jpg',
  crop: { file: `directions/${cropFile}`, box: BOX, sha256: sha(crop), note: 'cropped at this box, resized to 1024 high, JPEG; no model' },
};

// Her current front's recipe: the prompt and model, word for word.
const current = ledger.calls.filter((c) => c.kind === 'image' && c.file === 'directions/bai-animated-gpt.jpg').pop() as (Row & { recipe: { prompt: string; style: unknown; assist: unknown } }) | undefined;
if (!current) throw new Error('no recipe for bai-animated-gpt.jpg');
const prompt = current.recipe.prompt;
const model = 'gpt-image-2.5-sunburst' as const;
const m = CLOSED_IMAGE_MODELS[model];
const file = 'bai-animated-gpt-garance.jpg';
const tag = { char: 'bai', direction: 'animated', baiGarance: true, model, from: 'crop:bai-garance' };
console.log(`edit sha256 ${sha(edit).slice(0, 16)}…, crop ${sha(crop).slice(0, 16)}…; spent so far $${spent().toFixed(5)} of $${CAP}`);
if (DRY) { console.log(`${file}: ${model}, worst $${m.worstUsd} + check $${GUARD_WORST}`); process.exit(0); }
if (existsSync(path.join(DIR, file))) { console.log('exists', file); process.exit(0); }
{ const r = await retentionRefusal(model); if (r) throw new Error(r); }

gate('prompt check', GUARD_WORST);
const g = await checkPrompt(prompt, fakeRequest, IMAGES.designs.guardMaxTokens);
ledger.calls.push({ ...tag, kind: 'prompt-check', model: IMAGES.guardModel, allow: g.allow, category: g.category, provider: g.provider, costUsd: g.costUsd, worstUsd: GUARD_WORST, at: new Date().toISOString() });
save();
if (!g.allow) { console.log('prompt check did not pass'); process.exit(1); }
gate(file, m.worstUsd);
const at = new Date().toISOString();
const made = await closedImage(model, prompt, { bytes: crop, contentType: 'image/jpeg' }, { aspect: '3:4' });
const { data } = await sharp(made.bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const bg = { r: data[0], g: data[1], b: data[2] };
const jpeg = await sharp(made.bytes).resize(576, 768, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 88 }).toBuffer();
writeFileSync(path.join(DIR, file), jpeg);
ledger.calls.push({
  ...tag, kind: 'image', file: `directions/${file}`, sha256: sha(jpeg), closed_model: true, maker: m.maker, costUsd: made.costUsd, worstUsd: m.worstUsd,
  recipe: {
    prompt, model, endpoint: m.slug, host: 'Vercel AI Gateway',
    settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: { width: 576, height: 768 }, fit: "contain, padded with the picture's own corner colour" } },
    seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: 576, height: 768,
    references: [{ sha256: sha(crop), what: `Brought in: a crop (box ${JSON.stringify(BOX)}) of ${CREDIT} Edit sha256 ${sha(edit)}.` }],
    credit: ['Garance (the edit used as reference)'],
    style: current.recipe.style, checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' },
    assist: current.recipe.assist,
    remade_from: { file: 'directions/bai-animated-gpt.jpg', why: "owner, 2026-11-05: made again from Garance's edit, so her skin matches her sheet" },
  },
  response_meta: made.meta, at,
});
save();
console.log(`done ${file} | $${made.costUsd.toFixed(5)} | spent $${spent().toFixed(5)} of $${CAP}`);
