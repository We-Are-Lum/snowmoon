/**
 * Three looks each for Zei, Bai, Seila and Mu (owner, 2026-11-05: "approved as proposed, up to $1.60";
 * docs/starting-sheet-drafts/three-looks-proposal.md). FRONTS ONLY in this run: the owner's rethink of the challenge
 * (moments, not turnaround sheets) may make side and back views unnecessary, so they wait for the owner.
 * Only skin, hair and eyes change; everything else in each front's prompt stays word for word. All eight are made the
 * way Deluin's and Gladias's recasts were (Gemini 3.1 Flash Image from words, the same prompt shape, style text and
 * settings), so the six sets match; Zei's and Bai's current fronts were GPT Image from a crop of the owner's picture,
 * so their recipe prompt is reused as words.
 *
 * Drafts only: no database, no storage, nothing published. Calls go only through scripts/lib/batch-model.ts (the
 * gateway; Google on Vertex with ZDR). The site's Groq key is removed before anything runs.
 *
 * Cap: $0.60 for this batch (part of the owner's $1.60), prompt checks included, counted from the ledger's rows tagged
 * `looks3`. Before every call, spending plus that call's worst case must stay within it, or the script stops.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/three-looks-fronts.ts [--dry]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { checkPrompt } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CLOSED_IMAGE_MODELS, closedImage, retentionRefusal, type ClosedImageModel } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/starting-sheet-drafts/directions');
const LEDGER = path.join(DIR, 'ledger.json');
const CAP = 0.75; // $0.60 for the eight fronts, +$0.15 for Bai's two redone looks (owner, 2026-11-05), within the owner's $1.60; // this batch's own cap (owner, 2026-11-05: three looks up to $1.60; fronts only in this run)
const GUARD_WORST = 0.0015;
const DRY = process.argv.includes('--dry');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

delete process.env.GROQ_API_KEY; // batch calls go through the gateway only
if (!DRY && !process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script');

/** Each option replaces exactly `was` (the skin, hair and eyes words) in the current front's descriptor. */
const RECASTS: { char: string; front: string; was: string; clothes?: { was: string; now: string; why: string }; options: { id: string; now: string }[] }[] = [
  {
    char: 'zei', front: 'directions/zei-animated-gpt.jpg',
    was: 'light golden-tan skin, tall spiky black hair swept up and back with a broad teal-blue streak and close-cut sides, warm brown eyes',
    options: [
      { id: 'a', now: 'deep brown skin, short black twists with one electric-blue streak, quick dark eyes' },
      { id: 'b', now: 'fair skin, spiky ash-brown hair with one electric-blue streak, quick grey eyes' },
    ],
  },
  {
    char: 'bai', front: 'directions/bai-animated-gpt.jpg',
    was: 'dark brown skin, a long sleek magenta ponytail pulled high with the sides of her head shaved close, dark eyes',
    options: [
      { id: 'a', now: 'light olive skin, long straight black hair in a high ponytail dyed magenta at the ends, dark eyes' },
      { id: 'b', now: 'fair freckled skin, a high ponytail of loose auburn curls dyed magenta at the ends, hazel eyes' },
    ],
  },
  {
    // Redone once (owner, 2026-11-05): a's skin came out yellowish; every look keeps the clothes of her original front,
    // whose prompt said only "dark trousers and boots" (GPT drew cargo pants from the owner's picture), so these say what
    // the front shows. Nothing else in the clothes changes.
    char: 'bai', front: 'directions/bai-animated-gpt.jpg',
    was: 'dark brown skin, a long sleek magenta ponytail pulled high with the sides of her head shaved close, dark eyes',
    clothes: { was: 'dark trousers and boots', now: 'dark cargo trousers and chunky laced boots', why: "owner, 2026-11-05: every look keeps the clothes of the character's original front (Bai keeps her cargo pants)" },
    options: [
      { id: 'a2', now: 'light olive skin, long straight black hair in a high ponytail dyed magenta at the ends, dark eyes' },
      { id: 'b2', now: 'fair freckled skin, a high ponytail of loose auburn curls dyed magenta at the ends, hazel eyes' },
    ],
  },
  {
    char: 'seila', front: 'directions/seila-animated-gemini.jpg',
    was: 'deep brown skin, black hair in shoulder-length braids gathered loosely back, alert dark eyes',
    options: [
      { id: 'a', now: 'light tan skin, shoulder-length wavy black hair gathered loosely back, alert dark eyes' },
      { id: 'b', now: 'fair skin, shoulder-length auburn hair in a loose braid, alert green eyes' },
    ],
  },
  {
    char: 'mu', front: 'directions/mu-animated-gemini.jpg',
    was: 'medium brown skin, short silver hair in a sharp asymmetric cut, keen eyes',
    options: [
      { id: 'a', now: 'pale skin, short silver hair in a sharp asymmetric cut, keen grey eyes' },
      { id: 'b', now: 'deep brown skin, short silver coils in a sharp asymmetric cut, keen dark eyes' },
    ],
  },
];

type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { calls: Row[] } & Record<string, unknown>;
const save = () => { if (!DRY) writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); };
const spent = () => ledger.calls.filter((c) => c.looks3 === true).reduce((n, c) => n + c.costUsd, 0);
const gate = (what: string, worst: number) => {
  const after = spent() + worst;
  if (after > CAP + 1e-9) {
    console.log(`STOP before ${what}: recast spent $${spent().toFixed(5)} + worst $${worst} = $${after.toFixed(5)} > $${CAP}`);
    save();
    process.exit(0);
  }
};

async function toFront(bytes: Buffer, size: { width: number; height: number }): Promise<Buffer> {
  const { data } = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(bytes).resize(size.width, size.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 88 }).toBuffer();
}

// Worst case of the whole run, checked before anything is called.
const worstRun = RECASTS.reduce((n, r) => n + r.options.length, 0) * (CLOSED_IMAGE_MODELS['gemini-3.1-flash-image'].worstUsd + GUARD_WORST);
console.log(`recast spent so far $${spent().toFixed(5)}; cap $${CAP}; this run's worst case $${worstRun.toFixed(4)}`);

if (!DRY) { const r = await retentionRefusal('gemini-3.1-flash-image'); if (r) throw new Error(r); }

for (const rc of RECASTS) {
  const frontRow = ledger.calls.find((c) => c.kind === 'image' && c.file === rc.front) as (Row & { model: ClosedImageModel; recipe: { prompt: string; settings: { converted: { resized_to: { width: number; height: number } } }; style: { title: string; text: string; version_id: string }; assist: unknown } }) | undefined;
  if (!frontRow) throw new Error(`no recipe for ${rc.front}`);
  const parts = frontRow.recipe.prompt.split('\n\n');
  if (parts.length !== 4 || parts[3] !== IMAGES.suffix) throw new Error(`${rc.front}: unexpected prompt shape`);
  const [subject, style, descriptor] = parts;
  if (descriptor.split(rc.was).length !== 2) throw new Error(`${rc.char}: the skin, hair and eyes words aren't in the front's descriptor exactly once`);
  const model: ClosedImageModel = 'gemini-3.1-flash-image'; // all eight from words, as the other recasts
  const m = CLOSED_IMAGE_MODELS[model];
  for (const o of rc.options) {
    const file = `${rc.char}-look-${o.id}-gemini.jpg`;
    if (existsSync(path.join(DIR, file))) { console.log('exists', file); continue; }
    if (rc.clothes && descriptor.split(rc.clothes.was).length !== 2) throw new Error(`${rc.char}: the clothes words aren't in the descriptor exactly once`);
    const newDescriptor = (rc.clothes ? descriptor.replace(rc.clothes.was, rc.clothes.now) : descriptor).replace(rc.was, o.now);
    const prompt = [subject, style, newDescriptor, parts[3]].join('\n\n');
    const tag = { char: rc.char, direction: 'animated', looks3: true, option: o.id, model, from: 'text', changed: { was: rc.was, now: o.now }, ...(rc.clothes ? { clothes_described: rc.clothes } : {}), based_on: rc.front };
    if (DRY) { console.log(`${file}: ${model}, worst $${m.worstUsd} + check $${GUARD_WORST}\n  ${newDescriptor}`); continue; }
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
      const made = await closedImage(model, prompt, null, { aspect: '3:4' });
      const size = frontRow.recipe.settings.converted.resized_to;
      const jpeg = await toFront(made.bytes, size);
      writeFileSync(path.join(DIR, file), jpeg);
      const recipe = {
        prompt, model, endpoint: m.slug, host: 'Vercel AI Gateway',
        settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: size, fit: 'contain, padded with the picture\'s own corner colour' } },
        seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: size.width, height: size.height,
        style: frontRow.recipe.style,
        checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' },
        assist: frontRow.recipe.assist,
        looks3: { owner_decision: '2026-11-05: three looks for Zei, Bai, Seila and Mu, approved as proposed; only skin tone, hair and eyes change', was: rc.was, now: o.now, current_front_made_with: frontRow.model },
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
    console.log(`done ${file} | recast spent $${spent().toFixed(5)} of $${CAP}`);
  }
}
save();
console.log(`recast spent $${spent().toFixed(5)} of $${CAP}`);
