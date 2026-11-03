// Bases drafts (overnight 2026-11-03, for the owner's pick): fronts in the five published styles, closed-model front
// concepts, and three Zei side seeds, through the site's own functions, locally:
//   blockedName + checkPrompt (the prompt check, through the Vercel AI Gateway; GROQ_API_KEY removed),
//   viewPrompt + VIEW_LINES (the prompt), makeEdit / makeImage (the open models on fal.ai, unchanged),
//   and the publish route's recipeOf (copied verbatim, checked against the route's source at start).
// NO database writes, NO storage: paidPicture/reserve/settle/recordGuard/putPublic/makeDesign are not called; db() is
// never opened (the styles were read once, read-only, into styles.json). So nothing counts toward the site's caps.
// Run from the starting-sheet-drafts worktree root:
//   npx tsx --conditions=react-server --env-file=.env.local /Users/nathan/snowmoon-starting-drafts/bases/make-bases.mts <mode> ...
//   modes: open <edit|text> <chars,..> <styles,..> | side <n> | closed <gpt|gemini> <chars,..> <style>
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from '/Users/nathan/snowmoon/node_modules/sharp/dist/index.mjs';
import { IMAGES } from '/Users/nathan/snowmoon-starting-sheet-drafts/src/lib/config';
import { SAMPLE_ASSIST, VIEW_LINES, viewPrompt } from '/Users/nathan/snowmoon-starting-sheet-drafts/src/lib/images/design-rules';
import { makeEdit, makeImage, type Made } from '/Users/nathan/snowmoon-starting-sheet-drafts/src/lib/images/fal';
import { checkPrompt } from '/Users/nathan/snowmoon-starting-sheet-drafts/src/lib/images/guard';
import { blockedName } from '/Users/nathan/snowmoon-starting-sheet-drafts/src/lib/images/rules';
import type { DesignPicture } from '/Users/nathan/snowmoon-starting-sheet-drafts/src/lib/element-body';
import type { SampleTicket } from '/Users/nathan/snowmoon-starting-sheet-drafts/src/lib/images/ticket';

const OUT = '/Users/nathan/snowmoon-starting-drafts';
const B = `${OUT}/bases`;
const LEDGER = `${B}/ledger.json`;
const CAP = 3.0; // the whole task's hard cap, worst case, every call counted
const GUARD_WORST = 0.0015; // what the site reserves for one prompt check
const EDIT_WORST = IMAGES.editReserveUsd(1) - 0.0015; // $0.02
const TEXT_WORST = IMAGES.reserveUsd - 0.0015; // $0.005 (fal may round up to 1 MP)
const CLOSED = {
  gpt: { id: 'gpt-image-2.5-sunburst', slug: 'openai/gpt-image-2.5-sunburst', worst: 0.08 },
  gemini: { id: 'gemini-3.1-flash-image', slug: 'google/gemini-3.1-flash-image', worst: 0.09 },
} as const;
mkdirSync(B, { recursive: true });

// ---- the publish route's recipeOf, verbatim (src/app/api/designs/route.ts) ----
const recipeOf = (t: SampleTicket): DesignPicture['recipe'] => ({
  prompt: t.prompt, model: t.model, endpoint: t.endpoint, host: t.host, settings: t.settings, seed: t.seed, request_id: t.requestId,
  cost_usd: Number(t.costUsd.toFixed(4)), made_at: t.at, width: t.width, height: t.height, ...(t.references ? { references: t.references } : {}),
  ...(t.style ? { style: { version_id: t.style.versionId, title: t.style.title, text: t.style.text } } : {}),
  checks: { prompt: t.guard, host_safety_checker: 'passed' }, assist: SAMPLE_ASSIST as unknown as DesignPicture['recipe']['assist'],
});
const route = readFileSync('src/app/api/designs/route.ts', 'utf8');
const mine = readFileSync(new URL(import.meta.url).pathname, 'utf8');
const grab = (s: string) => s.slice(s.indexOf('const recipeOf'), s.indexOf('});', s.indexOf('const recipeOf')) + 3);
if (grab(route) !== grab(mine)) throw new Error('recipeOf differs from the route; stop');

// ---- the five published styles, newest version of each (read from production, read-only, 2026-11-03) ----
type StyleRow = { name: string; version_id: string; version_no: number; status: string; body: { title: string; text: string } };
const rows = (JSON.parse(readFileSync(`${B}/styles.json`, 'utf8')) as StyleRow[]).filter((r) => r.status === 'published');
const STYLES: Record<string, { versionId: string; title: string; text: string; name: string }> = {};
for (const r of [...rows].sort((x, y) => x.version_no - y.version_no)) STYLES[r.name.toLowerCase()] = { versionId: r.version_id, title: r.body.title, text: r.body.text, name: r.name };

// The v2 lines: the front from a reference takes the side line's form; side and back word for word.
const EDIT_FRONT = VIEW_LINES.side.replace('seen from the side', 'seen from the front');
const cast = JSON.parse(readFileSync('content/snowmoon/recipes/images/cast.json', 'utf8'));
const textFor = (c: string, prompt: string) => {
  let t = prompt.match(/(The person is .*?)\s*Detailed science fiction comic art/)![1].trim();
  if (c === 'mu') { const a = 'with one sculpted shoulder panel'; if (!t.includes(a)) throw new Error('mu'); t = t.replace(a, 'with one shoulder panel'); }
  return t;
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const sheetOf = (c: string) => {
  const r = cast.images.find((x: { id: string }) => x.id === `${c}-sheet`);
  const bytes = readFileSync(`${OUT}/originals/${r.file}`);
  if (sha(bytes) !== r.sha256) throw new Error(`${c}: sheet sha256 differs from cast.json`);
  return { r, bytes, text: textFor(c, r.prompt) };
};

type Row = Record<string, unknown> & { worstUsd: number; costUsd: number };
const ledger: { cap_usd: number; calls: Row[] } = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { cap_usd: CAP, calls: [] };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const tot = (k: 'worstUsd' | 'costUsd') => ledger.calls.reduce((n, c) => n + c[k], 0);
const gate = (what: string, worst: number) => {
  const after = tot('worstUsd') + worst;
  if (after > CAP) { console.log(`STOP before ${what}: worst-case total would be $${after.toFixed(4)} > $${CAP}`); save(); process.exit(0); }
};
const fakeRequest = new Request('http://localhost/local-script'); // no OIDC header: gatewayToken() uses AI_GATEWAY_API_KEY
delete process.env.GROQ_API_KEY; // batch calls go through the gateway only, never the site's Groq key
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('no gateway key');

/** The site's prompt check, asked again on "unclear" as a visitor's retry would (up to 3 times). */
async function check(tag: Record<string, unknown>, prompt: string): Promise<boolean> {
  if (prompt.length > 2000) throw new Error('long');
  if (blockedName(prompt)) { console.log('BLOCKED NAME', tag); return false; }
  for (let a = 0; a < 3; a++) {
    gate(`${JSON.stringify(tag)} check`, GUARD_WORST);
    const g = await checkPrompt(prompt, fakeRequest);
    ledger.calls.push({ ...tag, kind: 'prompt-check', model: IMAGES.guardModel, allow: g.allow, category: g.category, provider: g.provider, costUsd: g.costUsd, worstUsd: GUARD_WORST, at: new Date().toISOString() });
    save();
    console.log(`check ${JSON.stringify(tag)} allow=${g.allow} ${g.category ?? ''} $${g.costUsd.toFixed(6)} | running $${tot('costUsd').toFixed(5)} (worst $${tot('worstUsd').toFixed(4)})`);
    if (g.allow) return true;
    if (g.category !== 'unclear') return false;
  }
  return false;
}

function record(tag: Record<string, unknown>, file: string, made: Made, ticket: Omit<SampleTicket, 'sha256' | 'at' | 'seed' | 'requestId' | 'costUsd' | 'settings'>, worst: number, extra: Record<string, unknown> = {}) {
  const sha256 = sha(made.bytes);
  const t = { ...ticket, settings: made.settings, seed: made.seed, requestId: made.requestId, costUsd: made.costUsd, sha256, at: new Date().toISOString() } as SampleTicket;
  if (!made.nsfw) writeFileSync(`${B}/${file}`, made.bytes);
  const recipe = recipeOf(t);
  ledger.calls.push({ ...tag, kind: 'image', file: made.nsfw ? null : `bases/${file}`, sha256, nsfw: made.nsfw, costUsd: made.costUsd, worstUsd: worst, recipe, ...extra });
  save();
  console.log(`image ${JSON.stringify(tag)} nsfw=${made.nsfw} seed=${made.seed} $${made.costUsd.toFixed(5)} | running $${tot('costUsd').toFixed(5)} (worst $${tot('worstUsd').toFixed(4)}, ${ledger.calls.length} calls)`);
  return sha256;
}

const base = (c: string, slot: 'front' | 'side', subject: string, prompt: string, text: string, style: { versionId: string; title: string; text: string }) =>
  ({ v: 1, kind: 'design-sample', fid: 6786, slot, text, subject, prompt, width: IMAGES.viewSize.width, height: IMAGES.viewSize.height, style, guard: { model: IMAGES.guardModel, verdict: 'ok' } }) as const;

// ---- closed models through the Vercel AI Gateway (AI_GATEWAY_API_KEY; never printed) ----
const GATEWAY_OPTIONS = { gateway: { disallowPromptTraining: true } }; // as the GPT cut (owner, 2026-10-19)
async function closedCall(which: keyof typeof CLOSED, prompt: string, ref: Buffer): Promise<Made & { meta: unknown }> {
  const key = process.env.AI_GATEWAY_API_KEY!;
  const m = CLOSED[which];
  if (which === 'gpt') {
    const settings = { size: '1024x1536', quality: 'high', n: 1, output_format: 'png', providerOptions: GATEWAY_OPTIONS };
    const res = await fetch('https://ai-gateway.vercel.sh/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m.slug, prompt, images: [{ image_url: `data:image/png;base64,${ref.toString('base64')}` }], ...settings }) });
    const body = await res.json().catch(() => ({})) as any;
    if (!res.ok || !body.data?.[0]?.b64_json) throw new Error(`gpt ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
    const meta = { ...body, data: undefined };
    return { bytes: Buffer.from(body.data[0].b64_json, 'base64'), contentType: 'image/png', seed: null, requestId: meta.providerMetadata?.gateway?.generationId ?? null, nsfw: false,
      costUsd: Number(meta.providerMetadata?.gateway?.cost ?? m.worst), settings: { ...settings, providerOptions: undefined, gateway: GATEWAY_OPTIONS.gateway }, meta };
  }
  const settings = { modalities: ['text', 'image'], aspect_ratio: '3:4' };
  const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: m.slug, modalities: settings.modalities, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${ref.toString('base64')}` } }, { type: 'text', text: prompt }] }],
      providerOptions: { ...GATEWAY_OPTIONS, google: { imageConfig: { aspectRatio: '3:4' } } } }) });
  const body = await res.json().catch(() => ({})) as any;
  const url: string = body.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? '';
  const mm = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!res.ok || !mm) throw new Error(`gemini ${res.status} ${JSON.stringify({ ...body, choices: body.choices?.map((c: any) => ({ ...c, message: { ...c.message, images: undefined } })) }).slice(0, 400)}`);
  const cost = Number(body.usage?.cost ?? body.providerMetadata?.gateway?.cost ?? NaN);
  const meta = { id: body.id, model: body.model, usage: body.usage, text: body.choices?.[0]?.message?.content ?? null, provider_metadata: body.choices?.[0]?.message?.provider_metadata ?? body.providerMetadata ?? null };
  return { bytes: Buffer.from(mm[2], 'base64'), contentType: mm[1], seed: null, requestId: body.id ?? null, nsfw: false, costUsd: Number.isFinite(cost) ? cost : m.worst, settings: { ...settings, gateway: GATEWAY_OPTIONS.gateway }, meta };
}

/** The whole picture, never cropped: scaled to fit 576 x 768 and padded with its own top-left colour (no model). */
async function toView(original: Buffer): Promise<Buffer> {
  const { data } = await sharp(original).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return sharp(original).resize(IMAGES.viewSize.width, IMAGES.viewSize.height, { fit: 'contain', background: { r: data[0], g: data[1], b: data[2] } }).flatten({ background: { r: data[0], g: data[1], b: data[2] } }).jpeg({ quality: 92 }).toBuffer();
}

const [mode, a1, a2, a3] = process.argv.slice(2);
if (mode === 'reconvert') {
  // No model call: redo the JPEG of closed-model pictures already made (the first conversion cropped; 2026-11-03).
  for (const c of ledger.calls) {
    if (!c.closed_model || c.kind !== 'image' || !c.file) continue;
    const orig = `${OUT}/${String(c.file).replace(/\.jpg$/, '.original.png')}`;
    const jpeg = await toView(readFileSync(orig));
    writeFileSync(`${OUT}/${c.file}`, jpeg);
    c.sha256 = sha(jpeg);
    const r = c.recipe as any;
    r.settings.converted = { ...r.settings.converted, fit: 'contain, padded with the picture\'s own corner colour' };
    console.log('reconverted', c.file);
  }
  save(); process.exit(0);
}
if (mode === 'open') {
  const path = a1 as 'edit' | 'text';
  for (const c of a2.split(',')) {
    const s = sheetOf(c);
    for (const st of a3.split(',')) {
      const style = STYLES[st];
      if (!style) throw new Error(`no style ${st}`);
      const subject = path === 'edit' ? EDIT_FRONT : VIEW_LINES.front;
      const prompt = viewPrompt(subject, style.text, s.text);
      const tag = { char: c, view: 'front', style: style.name, path };
      const file = `${c}-front-${st}-${path}.jpg`;
      if (existsSync(`${B}/${file}`)) { console.log('exists', file); continue; }
      if (!(await check(tag, prompt))) continue;
      const worst = path === 'edit' ? EDIT_WORST : TEXT_WORST;
      gate(`${file}`, worst);
      const made = path === 'edit'
        ? await makeEdit(prompt, [{ bytes: s.bytes, contentType: 'image/png', width: s.r.width, height: s.r.height }], IMAGES.viewSize)
        : await makeImage(prompt, IMAGES.viewSize);
      const m = path === 'edit' ? IMAGES.editModel : IMAGES.model;
      record(tag, file, made, { ...base(c, 'front', subject, prompt, s.text, style), model: m.id, endpoint: m.endpoint, host: m.host, ...(path === 'edit' ? { references: [{ sha256: s.r.sha256 }] } : {}) }, worst);
    }
  }
} else if (mode === 'side') {
  // Zei side, redone from the v2 front, the way v2 was made (style "Techno vistas, views"; no seed sent, fal picks one).
  const L2 = JSON.parse(readFileSync(`${OUT}/v2/ledger.json`, 'utf8'));
  const v2side = L2.calls.find((x: any) => x.char === 'zei' && x.view === 'side' && x.kind === 'image').recipe;
  const front = readFileSync(`${OUT}/v2/zei-front.jpg`);
  const s = sheetOf('zei');
  const style = { versionId: v2side.style.version_id, title: v2side.style.title, text: v2side.style.text };
  const prompt = viewPrompt(VIEW_LINES.side, style.text, s.text);
  if (prompt !== v2side.prompt) throw new Error('side prompt differs from v2');
  for (let i = 0; i < Number(a1); i++) {
    const letter = 'ABCDEF'[i];
    const file = `zei-side-seed-${letter}.jpg`;
    if (existsSync(`${B}/${file}`)) { console.log('exists', file); continue; }
    const tag = { char: 'zei', view: 'side', seedLabel: letter };
    if (!(await check(tag, prompt))) continue;
    gate(file, EDIT_WORST);
    const made = await makeEdit(prompt, [{ bytes: front, contentType: 'image/jpeg', ...IMAGES.viewSize }], IMAGES.viewSize);
    const m = IMAGES.editModel;
    record(tag, file, made, { ...base('zei', 'side', VIEW_LINES.side, prompt, s.text, style), model: m.id, endpoint: m.endpoint, host: m.host, references: [{ sha256: sha(front) }] }, EDIT_WORST);
  }
} else if (mode === 'closed') {
  const which = a1 as keyof typeof CLOSED;
  const m = CLOSED[which];
  const style = STYLES[a3];
  if (!style) throw new Error(`no style ${a3}`);
  for (const c of a2.split(',')) {
    const s = sheetOf(c);
    const prompt = viewPrompt(EDIT_FRONT, style.text, s.text);
    const tag = { char: c, view: 'front', style: style.name, path: `closed:${m.id}` };
    const file = `${c}-front-closed-${which}.jpg`;
    if (existsSync(`${B}/${file}`)) { console.log('exists', file); continue; }
    if (!(await check(tag, prompt))) continue;
    gate(file, m.worst);
    let made;
    try { made = await closedCall(which, prompt, s.bytes); } catch (e) {
      ledger.calls.push({ ...tag, kind: 'image-failed', error: String(e).slice(0, 300), costUsd: 0, worstUsd: m.worst, at: new Date().toISOString() }); save();
      console.log('FAILED', file, String(e).slice(0, 300)); continue;
    }
    // Stored as the site stores pictures: JPEG at the view size (the conversion is recorded in the settings).
    const original = made.bytes;
    const jpeg = await toView(original);
    writeFileSync(`${B}/${c}-front-closed-${which}.original.${made.contentType.split('/')[1]}`, original);
    const settings = { ...made.settings, converted: { from: made.contentType.split('/')[1], sha256: sha(original), to: 'jpeg', resized_to: IMAGES.viewSize, fit: 'contain, padded with the picture\'s own corner colour' } };
    record(tag, file, { ...made, bytes: jpeg, settings }, { ...base(c, 'front', EDIT_FRONT, prompt, s.text, style), model: m.id, endpoint: m.slug, host: 'Vercel AI Gateway', references: [{ sha256: s.r.sha256 }] }, m.worst, { closed_model: true, maker: which === 'gpt' ? 'OpenAI' : 'Google', response_meta: made.meta });
  }
} else throw new Error('mode?');
save();
console.log(`total $${tot('costUsd').toFixed(5)}; worst $${tot('worstUsd').toFixed(4)}; ${ledger.calls.length} calls`);
