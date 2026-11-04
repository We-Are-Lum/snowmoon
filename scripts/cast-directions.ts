/**
 * DROPPED (owner, 2026-11-04, after the restart): Grounded and Bold are dropped; this script refuses to run. Kept as the
 * record of how the ten fronts of the stopped run were made ($0.67168; recipes in directions/ledger.json; files not
 * committed).
 *
 * Grounded and Bold fronts for Bai, Gladias, Seila, Deluin and Mu (owner's picks, 2026-11-04), on Gemini 3.1 Flash
 * Image only, from text, the same prompt shape as Zei's grounded and bold Gemini fronts (scripts/zei-directions.ts):
 * the stance line, the Neutral style text, the direction's descriptor (plan.json `fronts_next`), the no-words line.
 * Drafts only: no database, no storage, nothing published. Calls go only through scripts/lib/batch-model.ts (the
 * gateway, Vertex, ZDR, no training). The site's Groq key is removed before anything runs.
 *
 * Cap: the styles cap, raised to $1.75 by the owner, 2026-11-04. Before every call: what the ledger has spent so far
 * plus that call's worst case must stay within it, or the script stops. Appends to directions/ledger.json.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/cast-directions.ts [--checks-only]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES } from '../src/lib/config';
import { SAMPLE_ASSIST } from '../src/lib/images/design-rules';
import { checkPrompt } from '../src/lib/images/guard';
import { blockedName } from '../src/lib/images/rules';
import { CLOSED_IMAGE_MODELS, GEMINI_TEXT_WORST_USD, closedImage, retentionRefusal } from './lib/batch-model';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/starting-sheet-drafts/directions');
const LEDGER = path.join(DIR, 'ledger.json');
const CAP = 1.75; // raised to $1.75 by the owner, 2026-11-04 (was $1)
const GUARD_WORST = 0.0015;
const MODEL = 'gemini-3.1-flash-image' as const;
const CHECKS_ONLY = process.argv.includes('--checks-only');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

const DROPPED = true as boolean;
if (DROPPED) throw new Error('dropped (owner, 2026-11-04): Grounded and Bold are dropped; nothing to make');
delete process.env.GROQ_API_KEY; // batch calls go through the gateway only
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');
const fakeRequest = new Request('http://localhost/local-script');

const plan = JSON.parse(readFileSync(path.join(DIR, 'plan.json'), 'utf8')) as {
  styles: Record<string, string>; directions: { id: string; style: string }[]; descriptors: Record<string, string>;
  fronts_next: { key: string; model: string; from: string }[];
};
type Row = Record<string, unknown> & { costUsd: number; worstUsd: number };
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { cap_usd: number; cap_note?: string; calls: Row[] };
ledger.cap_usd = CAP;
ledger.cap_note = 'raised to $1.75 by the owner, 2026-11-04 (was $1). From then on each call is gated on spent so far plus its own worst case.';
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const spent = () => ledger.calls.reduce((n, c) => n + c.costUsd, 0);
const gate = (what: string, worst: number) => {
  const after = spent() + worst;
  if (after > CAP + 1e-9) { console.log(`STOP before ${what}: spent $${spent().toFixed(5)} + worst $${worst} = $${after.toFixed(4)} > $${CAP}`); save(); process.exit(0); }
};

const TEXT_LINE = 'Character reference picture: one person, full body from head to shoes, standing in a relaxed three-quarter stance with some personality, plain light grey background.';

async function toView(bytes: Buffer): Promise<Buffer> {
  const { data } = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  return sharp(bytes).resize(IMAGES.viewSize.width, IMAGES.viewSize.height, { fit: 'contain', background: bg }).flatten({ background: bg }).jpeg({ quality: 88 }).toBuffer();
}

const refusal = await retentionRefusal(MODEL);
if (refusal) throw new Error(refusal);
const worstImage = GEMINI_TEXT_WORST_USD;
console.log(`spent so far $${spent().toFixed(5)}; cap $${CAP}; ${plan.fronts_next.length} fronts, worst each $${worstImage} + up to 3 checks at $${GUARD_WORST}`);

for (const f of plan.fronts_next) {
  if (f.model !== MODEL || f.from !== 'text') throw new Error(`${f.key}: only Gemini from text here`);
  const [who, dir] = f.key.split('/');
  const direction = plan.directions.find((d) => d.id === dir)!;
  const file = `${who}-${dir}-gemini.jpg`;
  if (existsSync(path.join(DIR, file))) { console.log('exists', file); continue; }
  const prompt = [TEXT_LINE, plan.styles[direction.style], plan.descriptors[f.key], IMAGES.suffix].join('\n\n');
  const tag = { char: who, direction: dir, model: MODEL, from: 'text', prompt_sha256: sha(prompt) };
  const hit = blockedName(prompt);
  if (hit) { console.log('BLOCKED NAME', file); continue; }
  // a prompt already passed (same sha256) is not checked again
  let ok = ledger.calls.some((c) => c.kind === 'prompt-check' && c.prompt_sha256 === tag.prompt_sha256 && c.allow === true);
  for (let a = 0; a < 3 && !ok; a++) {
    gate(`${file} check`, GUARD_WORST);
    const g = await checkPrompt(prompt, fakeRequest, IMAGES.designs.guardMaxTokens);
    ledger.calls.push({ ...tag, kind: 'prompt-check', model: IMAGES.guardModel, allow: g.allow, category: g.category, provider: g.provider, costUsd: g.costUsd, worstUsd: GUARD_WORST, at: new Date().toISOString() });
    save();
    console.log(`check ${file} allow=${g.allow} ${g.category ?? ''} $${g.costUsd.toFixed(6)}`);
    if (g.allow) ok = true; else if (g.category !== 'unclear') break;
  }
  if (!ok) { console.log('prompt check did not pass', file); continue; }
  if (CHECKS_ONLY) continue;
  gate(file, worstImage);
  const at = new Date().toISOString();
  const m = CLOSED_IMAGE_MODELS[MODEL];
  try {
    const made = await closedImage(MODEL, prompt, null, { aspect: '3:4' });
    const jpeg = await toView(made.bytes);
    writeFileSync(path.join(DIR, file), jpeg);
    const recipe = {
      prompt, model: MODEL, endpoint: m.slug, host: 'Vercel AI Gateway',
      settings: { ...made.settings, converted: { from: made.contentType, sha256: sha(made.bytes), to: 'jpeg', resized_to: IMAGES.viewSize, fit: 'contain, padded with the picture\'s own corner colour' } },
      seed: null, request_id: made.requestId, cost_usd: Number(made.costUsd.toFixed(4)), made_at: at, width: IMAGES.viewSize.width, height: IMAGES.viewSize.height,
      style: { version_id: 'unpublished: docs/starting-sheet-drafts/directions/plan.json', title: direction.style, text: plan.styles[direction.style] },
      checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, host_safety_checker: 'not run' },
      assist: { ...SAMPLE_ASSIST, drafted: [...SAMPLE_ASSIST.drafted, 'style text', 'character descriptor'] },
    };
    ledger.calls.push({ ...tag, kind: 'image', file: `directions/${file}`, sha256: sha(jpeg), closed_model: true, maker: m.maker, costUsd: made.costUsd, worstUsd: worstImage, recipe, response_meta: made.meta, at });
  } catch (e) {
    ledger.calls.push({ ...tag, kind: 'image-failed', error: String(e).slice(0, 400), costUsd: 0, worstUsd: worstImage, at });
    console.log('FAILED', file, String(e).slice(0, 400));
  }
  save();
  console.log(`done ${file} | spent $${spent().toFixed(5)} of $${CAP}`);
}
save();
console.log(`total spent $${spent().toFixed(5)} of $${CAP}; ${ledger.calls.length} calls`);
