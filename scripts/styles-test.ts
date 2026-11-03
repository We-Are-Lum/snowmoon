/**
 * The challenge's style test (owner, 2026-11-04; docs/starting-sheet-drafts/styles-proposal.md): one Zei front per row of
 * styles-plan.json's style_test, made from Zei's original sheet, drafts only. Capped at $0.35: before every call (prompt
 * check or picture) the worst case of everything so far plus that call's reserve must stay within the cap, or it stops.
 *
 * Calls: the site's prompt check (blockedName, checkPrompt through the Vercel AI Gateway; GROQ_API_KEY removed), the open
 * edit model on fal.ai (makeEdit, the site's own path), and closed models only through scripts/lib/batch-model.ts (ZDR,
 * no training, provider pinned; refused unless the gateway lists that provider with both). NO database, NO storage:
 * nothing is published. Output: docs/starting-sheet-drafts/styles-test/ (JPEGs at the view size, ledger.json).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/styles-test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import type { DesignPicture } from '../src/lib/element-body';
import { SAMPLE_ASSIST, VIEW_LINES, viewPrompt } from '../src/lib/images/design-rules';
import { makeEdit } from '../src/lib/images/fal';
import { checkPrompt } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CLOSED_IMAGE_MODELS, closedImage, retentionRefusal, type ClosedImageModel } from './lib/batch-model';
import { readPlan } from './lib/bases-plan';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs/starting-sheet-drafts/styles-test');
const LEDGER = path.join(OUT, 'ledger.json');
const ORIGINALS = '/Users/nathan/snowmoon-starting-drafts/originals';
const CAP = 0.35;
const GUARD_WORST = 0.0015;
const EDIT_WORST = 0.02;
mkdirSync(OUT, { recursive: true });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY; // batch calls go through the gateway only
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script'); // no OIDC header: the gateway key is used

type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger: { cap_usd: number; calls: Row[] } = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { cap_usd: CAP, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const tot = (k: 'costUsd' | 'worstUsd') => ledger.calls.reduce((n, c) => n + c[k], 0);
const gate = (what: string, worst: number) => {
  const after = tot('worstUsd') + worst;
  if (after > CAP + 1e-9) { console.log(`STOP before ${what}: worst-case total would be $${after.toFixed(4)} > $${CAP}`); save(); process.exit(0); }
};

// Zei's original sheet and its text, as the drafts used them.
const cast = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/recipes/images/cast.json'), 'utf8'));
const r = cast.images.find((x: { id: string }) => x.id === 'zei-sheet');
const sheet = readFileSync(path.join(ORIGINALS, r.file));
if (sha(sheet) !== r.sha256) throw new Error('zei sheet sha256 differs from cast.json');
const sheetText = r.prompt.match(/(The person is .*?)\s*Detailed science fiction comic art/)![1].trim() as string;
const EDIT_FRONT = VIEW_LINES.side.replace('seen from the side', 'seen from the front');

const plan = readPlan(ROOT);
const styleText = (name: string) => {
  const s = plan.styles.find((x) => x.name === name);
  if (!s?.text) throw new Error(`no text for ${name}`);
  return s.text;
};

async function check(tag: Record<string, unknown>, prompt: string): Promise<boolean> {
  if (blockedName(prompt)) { console.log('BLOCKED NAME', tag); return false; }
  for (let a = 0; a < 3; a++) {
    gate(`${JSON.stringify(tag)} check`, GUARD_WORST);
    const g = await checkPrompt(prompt, fakeRequest, IMAGES.designs.guardMaxTokens);
    ledger.calls.push({ ...tag, kind: 'prompt-check', model: IMAGES.guardModel, allow: g.allow, category: g.category, provider: g.provider, costUsd: g.costUsd, worstUsd: GUARD_WORST, at: new Date().toISOString() });
    save();
    console.log(`check ${JSON.stringify(tag)} allow=${g.allow} ${g.category ?? ''} $${g.costUsd.toFixed(6)}`);
    if (g.allow) return true;
    if (g.category !== 'unclear') return false;
  }
  return false;
}

/** The whole picture, never cropped: scaled to fit 576 x 768 and padded with its own corner colour (no model). */
async function toView(original: Buffer): Promise<Buffer> {
  const { data } = await sharp(original).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(original).resize(IMAGES.viewSize.width, IMAGES.viewSize.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 90 }).toBuffer();
}

const short = (m: string) => (m === 'flux2-klein-4b-edit' ? 'open' : m === 'gemini-3.1-flash-image' ? 'gemini' : 'gpt');
// The cheap open rows first, so a stop at the cap loses the dearest.
const rows = [...plan.style_test].sort((a, b) => Number(a.model !== 'flux2-klein-4b-edit') - Number(b.model !== 'flux2-klein-4b-edit'));
for (const t of rows) {
  const file = `zei-front-${t.style.toLowerCase().replace(/\s+/g, '-')}-${short(t.model)}.jpg`;
  const tag = { char: 'zei', view: 'front', style: t.style, model: t.model };
  if (existsSync(path.join(OUT, file))) { console.log('exists', file); continue; }
  const text = styleText(t.style);
  const prompt = viewPrompt(EDIT_FRONT, text, sheetText);
  const closed = t.model !== 'flux2-klein-4b-edit';
  if (closed) {
    // Free: the gateway's endpoint list. Refused here costs nothing and sends nothing.
    const why = await retentionRefusal(t.model as ClosedImageModel);
    if (why) { ledger.calls.push({ ...tag, kind: 'refused', why, costUsd: 0, worstUsd: 0, at: new Date().toISOString() }); save(); console.log('REFUSED', file, why); continue; }
  }
  if (!(await check(tag, prompt))) { console.log('prompt check did not pass', file); continue; }
  const worst = closed ? CLOSED_IMAGE_MODELS[t.model as ClosedImageModel].worstUsd : EDIT_WORST;
  gate(file, worst);
  const style = { version_id: 'unpublished: docs/starting-sheet-drafts/styles-plan.json', title: t.style, text };
  const at = new Date().toISOString();
  try {
    if (!closed) {
      const made = await makeEdit(prompt, [{ bytes: sheet, contentType: 'image/png', width: r.width, height: r.height }], IMAGES.viewSize);
      if (!made.nsfw) writeFileSync(path.join(OUT, file), made.bytes);
      const recipe = {
        prompt, model: IMAGES.editModel.id, endpoint: IMAGES.editModel.endpoint, host: IMAGES.editModel.host, settings: made.settings, seed: made.seed, request_id: made.requestId,
        cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: IMAGES.viewSize.width, height: IMAGES.viewSize.height,
        references: [{ sha256: r.sha256, what: 'the original starting sheet (content/snowmoon/recipes/images/cast.json#zei-sheet)' }], style,
        checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'passed' }, assist: { ...SAMPLE_ASSIST, drafted: [...SAMPLE_ASSIST.drafted, 'style text'] },
      } as unknown as DesignPicture['recipe'];
      ledger.calls.push({ ...tag, kind: 'image', file: made.nsfw ? null : `styles-test/${file}`, sha256: sha(made.bytes), nsfw: made.nsfw, open_weights: true, maker: 'Black Forest Labs (open weights, Apache-2.0)', costUsd: made.costUsd, worstUsd: worst, recipe, at });
    } else {
      const m = CLOSED_IMAGE_MODELS[t.model as ClosedImageModel];
      const made = await closedImage(t.model as ClosedImageModel, prompt, { bytes: sheet, contentType: 'image/png' });
      const jpeg = await toView(made.bytes);
      writeFileSync(path.join(OUT, file), jpeg);
      const recipe = {
        prompt, model: t.model, endpoint: m.slug, host: 'Vercel AI Gateway', settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: IMAGES.viewSize, fit: 'contain, padded with the picture\'s own corner colour' } },
        seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: IMAGES.viewSize.width, height: IMAGES.viewSize.height,
        references: [{ sha256: r.sha256, what: 'the original starting sheet (content/snowmoon/recipes/images/cast.json#zei-sheet)' }], style,
        checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' }, assist: { ...SAMPLE_ASSIST, drafted: [...SAMPLE_ASSIST.drafted, 'style text'] },
      } as unknown as DesignPicture['recipe'];
      ledger.calls.push({ ...tag, kind: 'image', file: `styles-test/${file}`, sha256: sha(jpeg), closed_model: true, maker: m.maker, costUsd: made.costUsd, worstUsd: worst, recipe, response_meta: made.meta, at });
    }
  } catch (e) {
    ledger.calls.push({ ...tag, kind: 'image-failed', error: String(e).slice(0, 400), costUsd: 0, worstUsd: worst, at });
    console.log('FAILED', file, String(e).slice(0, 400));
  }
  save();
  console.log(`done ${file} | spent $${tot('costUsd').toFixed(5)} (worst $${tot('worstUsd').toFixed(4)} of $${CAP})`);
}
save();
console.log(`total $${tot('costUsd').toFixed(5)}; worst $${tot('worstUsd').toFixed(4)}; ${ledger.calls.length} calls`);
