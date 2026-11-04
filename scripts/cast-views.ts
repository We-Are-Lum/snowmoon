/**
 * Side and back views of the six bases (owner, 2026-11-04, after the restart): one base per character, all in Animated
 * series. Zei and Bai: their MJ·GPT fronts (GPT Image 2.5 Sunburst). Gladias, Seila, Deluin and Mu: their Animated
 * series fronts (Gemini 3.1 Flash Image, per the ledger's recipes). Each view is made from its front, with the model
 * that made the front, using the site's own view lines (src/lib/images/design-rules.ts, VIEW_LINES) and the front's
 * own style text and descriptor, word for word from the front's recipe.
 *
 * Drafts only: no database, no storage, nothing published. Calls go only through scripts/lib/batch-model.ts (the
 * gateway; Google on Vertex with ZDR, OpenAI with no training and its retention recorded). The site's Groq key is
 * removed before anything runs.
 *
 * Cap: the styles cap, raised to $1.75 by the owner, 2026-11-04. Before every call: spent so far (the ledger) plus that
 * call's worst case must stay within it, or the script stops. Order: Zei, Bai, Gladias, Seila, Deluin, Mu; side, then
 * back. Appends to directions/ledger.json.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/cast-views.ts [--dry]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { SAMPLE_ASSIST, VIEW_LINES, viewPrompt } from '../src/lib/images/design-rules';
import { checkPrompt } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CLOSED_IMAGE_MODELS, closedImage, retentionRefusal, type ClosedImageModel } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/starting-sheet-drafts/directions');
const LEDGER = path.join(DIR, 'ledger.json');
const CAP = 1.75; // raised to $1.75 by the owner, 2026-11-04 (was $1)
const GUARD_WORST = 0.0015;
const DRY = process.argv.includes('--dry');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY; // batch calls go through the gateway only
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script');

/** The six bases, in the owner's order. */
const BASES: { char: string; front: string }[] = [
  { char: 'zei', front: 'directions/zei-animated-gpt.jpg' },
  { char: 'bai', front: 'directions/bai-animated-gpt.jpg' },
  { char: 'gladias', front: 'directions/gladias-animated-gemini.jpg' },
  { char: 'seila', front: 'directions/seila-animated-gemini.jpg' },
  { char: 'deluin', front: 'directions/deluin-animated-gemini.jpg' },
  { char: 'mu', front: 'directions/mu-animated-gemini.jpg' },
];

type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { calls: Row[] } & Record<string, unknown>;
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n, c) => n + c.costUsd, 0);
const gate = (what: string, worst: number) => {
  const after = spent() + worst;
  if (after > CAP + 1e-9) {
    console.log(`STOP before ${what}: spent $${spent().toFixed(5)} + worst $${worst} = $${after.toFixed(5)} > $${CAP}`);
    save();
    process.exit(0);
  }
};

async function toView(bytes: Buffer): Promise<Buffer> {
  const { data } = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(bytes).resize(IMAGES.viewSize.width, IMAGES.viewSize.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 88 }).toBuffer();
}

if (!DRY) for (const r of await Promise.all((['gpt-image-2.5-sunburst', 'gemini-3.1-flash-image'] as const).map((m) => retentionRefusal(m)))) if (r) throw new Error(r);
console.log(`spent so far $${spent().toFixed(5)}; cap $${CAP}`);

for (const b of BASES) {
  const frontRow = ledger.calls.find((c) => c.kind === 'image' && c.file === b.front) as (Row & { model: ClosedImageModel; sha256: string; recipe: { prompt: string; style: { title: string } } }) | undefined;
  if (!frontRow) throw new Error(`no recipe for ${b.front}`);
  const frontBytes = readFileSync(path.join(DIR, '..', b.front));
  if (sha(frontBytes) !== frontRow.sha256) throw new Error(`${b.front} changed since it was made`);
  const parts = frontRow.recipe.prompt.split('\n\n');
  if (parts.length !== 4 || parts[3] !== IMAGES.suffix) throw new Error(`${b.front}: unexpected prompt shape`);
  const [, style, descriptor] = parts;
  const model = frontRow.model;
  const m = CLOSED_IMAGE_MODELS[model];
  const short = model === 'gemini-3.1-flash-image' ? 'gemini' : 'gpt';
  for (const slot of ['side', 'back'] as const) {
    const file = `${b.char}-animated-${slot}-${short}.jpg`;
    if (existsSync(path.join(DIR, file))) { console.log('exists', file); continue; }
    const prompt = viewPrompt(VIEW_LINES[slot], style, descriptor);
    const tag = { char: b.char, direction: 'animated', view: slot, model, from: `front:${b.front}` };
    if (DRY) { console.log(`${file}: ${model}, worst $${m.worstUsd} + check $${GUARD_WORST}`); continue; }
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
    gate(file, m.worstUsd);
    const at = new Date().toISOString();
    try {
      const made = await closedImage(model, prompt, { bytes: frontBytes, contentType: 'image/jpeg' }, { aspect: '3:4' });
      const jpeg = await toView(made.bytes);
      writeFileSync(path.join(DIR, file), jpeg);
      const recipe = {
        prompt, model, endpoint: m.slug, host: 'Vercel AI Gateway',
        settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: IMAGES.viewSize, fit: 'contain, padded with the picture\'s own corner colour' } },
        seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: IMAGES.viewSize.width, height: IMAGES.viewSize.height,
        references: [{ sha256: frontRow.sha256, what: `the base's front, ${b.front}, made by ${model} (its recipe is in this ledger)` }],
        style: { version_id: 'unpublished: docs/starting-sheet-drafts/directions/plan.json', title: frontRow.recipe.style.title, text: style },
        checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' },
        assist: { ...SAMPLE_ASSIST, drafted: [...SAMPLE_ASSIST.drafted, 'style text', 'character descriptor', 'view line (the site\'s own)'] },
      };
      ledger.calls.push({ ...tag, kind: 'image', file: `directions/${file}`, sha256: sha(jpeg), closed_model: true, maker: m.maker, costUsd: made.costUsd, worstUsd: m.worstUsd, recipe, response_meta: made.meta, at });
    } catch (e) {
      ledger.calls.push({ ...tag, kind: 'image-failed', error: String(e).slice(0, 400), costUsd: 0, worstUsd: m.worstUsd, at });
      console.log('FAILED', file, String(e).slice(0, 400));
      save();
      console.log('stopping: a failed call may still have been charged; check the gateway before running again');
      process.exit(1);
    }
    save();
    console.log(`done ${file} | spent $${spent().toFixed(5)} of $${CAP}`);
  }
}
save();
console.log(`total spent $${spent().toFixed(5)} of $${CAP}; ${ledger.calls.length} calls`);
