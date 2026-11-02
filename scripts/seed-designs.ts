/**
 * The starting style and the six challenge starting sheets (owner, 2026-11-01; docs/proposals/starting-sheet-drafts.md).
 * Order: 1. the project's starting style, Techno vistas (content/snowmoon/designs/styles/techno-vistas.json), with two
 * sample pictures from the repository's style test; 2. the six sheets (Zei, Bai, Gladias, Seila, Deluin, Mu), each titled
 * "Starting point", each view's recipe linked to the style's new published version. All as FID 6786, the maintainer.
 *
 * A DRY RUN unless --apply. The dry run only reads: SELECTs inside one read-only transaction. It prints every R2 key and
 * sha256 it would upload, every row with its full body and recipes, the order of the writes, the expected /challenge
 * "Sheets to start from", and whether each created_at falls before the window opens.
 *
 *   npm run seed:designs                                     dry run, assuming v2 for every view
 *   npm run seed:designs -- --picks=picks.json               dry run with the owner's picks
 *   npm run seed:designs -- --apply --picks=picks.json --confirm-owner-go     write it (after the owner's go)
 *
 * picks.json: { "zei": "v2", "bai": "v1", "mu": { "front": "v2", "side": "original", "back": "v2" }, … } for all six;
 * each value "v2" (the redone views), "v1" (the first drafts) or "original" (a crop of the original sheet, no model).
 *
 * --apply writes through the site's own functions: putPublic (src/lib/images/store.ts) for every picture, makeDesign
 * (src/lib/images/designs.ts) for each design. Idempotent: a style or sheet that already exists is skipped, so a second
 * run changes nothing. It refuses while the published page would misdescribe any picture (see pageProblems). Options:
 *   --name=<username>       the byline name (default naaate)
 *   --db=<url>              the database (default STUDIO_DATABASE_URL)
 *   --storage-dir=<dir>     a stand-in for R2 that writes files to <dir> (tests only; never with production)
 *   --drafts=<dir>          where the pictures are (default /Users/nathan/snowmoon-starting-drafts)
 *   --samples=<dir>         the style test's pictures (default the owner's Drive, Snowmoon images/style test 2)
 *   --set-role=studio_writer  `set role` after connecting (tests)
 *   --json=<file>           also write the plan as JSON
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';
import { WORK_ID } from '../src/lib/config';
import type { DesignBody, DesignPicture } from '../src/lib/element-body';
import { SAMPLE_ASSIST } from '../src/lib/images/design-rules';
import { keyFor } from '../src/lib/images/store';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (k: string) => {
  const i = process.argv.findIndex((a) => a === `--${k}` || a.startsWith(`--${k}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[i + 1] ?? '';
};
const has = (k: string) => process.argv.includes(`--${k}`);

const MAINTAINER_FID = 6786;
const APPLY = has('apply');
const BY_NAME = arg('name') || 'naaate';
const DRAFTS = arg('drafts') || '/Users/nathan/snowmoon-starting-drafts';
const SAMPLES_DIR = arg('samples') || '/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive/Snowmoon images/style test 2';
const STORAGE_DIR = arg('storage-dir');
const PICKS_FILE = arg('picks');
/** Mirrors CHALLENGE on branch remix-challenge (characters, in the owner's order; dates.opens). */
const CHARACTERS = ['zei', 'bai', 'gladias', 'seila', 'deluin', 'mu'] as const;
const OPENS = '2026-11-06T17:00:00Z';
const SHEET_TITLE = 'Starting point';
const STYLE_FILE = 'content/snowmoon/designs/styles/techno-vistas.json';
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
type Slot = 'front' | 'side' | 'back';
type Source = 'v2' | 'v1' | 'original';
const SLOTS: Slot[] = ['front', 'side', 'back'];

// ---- Refusals before anything else ----
if (APPLY && !(PICKS_FILE && has('confirm-owner-go'))) {
  console.error('--apply needs both --picks=<file> (the owner\'s picks) and --confirm-owner-go. Nothing done.');
  process.exit(2);
}
if (APPLY && new Date() >= new Date(OPENS)) {
  console.error(`The window opened at ${OPENS}: a sheet made now would not be a starting sheet. Nothing done.`);
  process.exit(2);
}

// ---- Picks ----
const picks: Record<string, Record<Slot, Source>> = {};
{
  const raw = PICKS_FILE ? (JSON.parse(readFileSync(PICKS_FILE, 'utf8')) as Record<string, unknown>) : null;
  for (const c of CHARACTERS) {
    const v = raw ? raw[c] : 'v2';
    const one = (x: unknown): Source => {
      if (x === 'v2' || x === 'v1' || x === 'original') return x;
      throw new Error(`picks: ${c} must be "v2", "v1" or "original" (or one per view)`);
    };
    const o = v as Record<string, unknown> | undefined;
    picks[c] = typeof v === 'string' ? { front: one(v), side: one(v), back: one(v) } : { front: one(o?.front), side: one(o?.side), back: one(o?.back) };
  }
  if (raw) for (const k of Object.keys(raw)) if (!(CHARACTERS as readonly string[]).includes(k)) throw new Error(`picks: unknown character ${k}`);
}

// ---- Inputs from the repository and the drafts folder ----
const style = JSON.parse(read(STYLE_FILE)) as { name: string; prompt: string };
type Img = { id: string; file: string; sha256: string; prompt: string; seed: number; width: number; height: number; references?: { file: string; sha256: string }[] };
type Recipes = { generated_at: string; model: Record<string, unknown>; settings: Record<string, unknown>; images: Img[] };
const cast = JSON.parse(read('content/snowmoon/recipes/images/cast.json')) as Recipes;
const test2 = JSON.parse(read('content/snowmoon/recipes/images/style-test-2.json')) as Recipes;
const ledger1 = JSON.parse(readFileSync(path.join(DRAFTS, 'ledger.json'), 'utf8')) as { calls: { char: string; view: Slot; file: string; sha256: string; seed: number; requestId: string; listUsd: number; at: string; prompt: string; settings: Record<string, unknown>; reference: { sha256: string } }[] };
const ledger2 = JSON.parse(readFileSync(path.join(DRAFTS, 'v2/ledger.json'), 'utf8')) as { calls: { char: string; view: Slot; kind: string; file: string; sha256: string; recipe: DesignPicture['recipe'] }[] };
const { bookCharacter, STARTING_STYLE_FILE } = await import('../src/lib/images/designs');
if (STARTING_STYLE_FILE !== STYLE_FILE) throw new Error('the starting style file moved');

/** The style's two samples: the scene renders of the style test that chose Techno vistas (style-test-2, AE3). */
const SAMPLE_IDS = ['ae3-techno-vistas-c1-b005-toy-drone', 'ae3-techno-vistas-c2-b003-street'];
const LOCAL_ENDPOINT = (m: Record<string, unknown>) => `local: ${m.runtime} ${m.mflux_version}, ${m.repo} @ ${String(m.revision).slice(0, 12)}, ${m.quantize_bits}-bit`;
const NOT_RUN = { prompt: { model: 'none', verdict: 'not run' }, host_safety_checker: 'not run' } as unknown as DesignPicture['recipe']['checks']; // typed honestly once design-page-recipe-lines is merged

interface Pic { slot: string; bytes: Buffer; sha256: string; key: string; recipe: DesignPicture['recipe']; from: string; notes: string[] }

async function samplePics(): Promise<Pic[]> {
  const out: Pic[] = [];
  for (const id of SAMPLE_IDS) {
    const r = test2.images.find((x) => x.id === id)!;
    const png = readFileSync(path.join(SAMPLES_DIR, r.file));
    if (sha(png) !== r.sha256) throw new Error(`${id}: sha256 does not match style-test-2.json`);
    if (!r.prompt.includes(style.prompt)) throw new Error(`${id}: not made with the style's text`);
    const bytes = await sharp(png).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    const s = sha(bytes);
    out.push({
      slot: 'sample', bytes, sha256: s, key: keyFor(s), from: `style test 2/${r.file} (png sha256 ${r.sha256})`,
      notes: ['local render: no prompt check or host safety checker ran'],
      recipe: {
        prompt: r.prompt, model: 'flux2-klein-4b', endpoint: LOCAL_ENDPOINT(test2.model), host: 'local (the maintainer\'s computer)',
        settings: { ...test2.settings, converted: { from: 'png', sha256: r.sha256, to: 'jpeg', quality: 92, note: 'converted for the site; no model' } },
        seed: r.seed, request_id: null, cost_usd: 0, made_at: test2.generated_at, width: r.width, height: r.height,
        ...(r.references?.length ? { references: r.references.map((x) => ({ sha256: x.sha256, what: `a reference picture from the same style test (${x.file})` })) } : {}),
        checks: NOT_RUN,
        assist: { model: 'claude-coding-agent', drafted: ['style text', 'image prompt'], source: 'content/snowmoon/recipes/images/style-test-2.json' },
      },
    });
  }
  return out;
}

const STYLE_V2_REMOVED = [' rich mechanical and architectural detail kept to the middle and far distance, vast airy compositions with big pastel skies and enormous elegant megastructures on the horizon,', ' cinematic wide-angle perspective,'];
const styleV2Text = STYLE_V2_REMOVED.reduce((t, r) => t.replace(r, ''), style.prompt);

async function viewPic(c: string, slot: Slot, src: Source, styleVersionId: string): Promise<Pic> {
  const r = cast.images.find((x) => x.id === `${c}-sheet`)!;
  const sheetPath = path.join(DRAFTS, 'originals', r.file);
  const sheet = readFileSync(sheetPath);
  if (sha(sheet) !== r.sha256) throw new Error(`${c}: original sheet sha256 does not match cast.json`);
  if (src === 'v2') {
    const e = ledger2.calls.find((x) => x.kind === 'image' && x.char === c && x.view === slot)!;
    const bytes = readFileSync(path.join(DRAFTS, e.file));
    if (sha(bytes) !== e.sha256) throw new Error(`${c} ${slot} v2: file changed`);
    if (e.recipe.style!.text !== styleV2Text) throw new Error('v2 style text unexpected');
    const references = slot === 'front' ? (e.recipe.references ?? []).map((x) => (x.sha256 === r.sha256 ? { ...x, what: `the original starting sheet (content/snowmoon/recipes/images/cast.json#${r.id})` } : x)) : e.recipe.references;
    const recipe = { ...e.recipe, ...(references ? { references } : {}), style: { version_id: styleVersionId, title: 'Techno vistas (for views, without its scenery clauses)', text: e.recipe.style!.text } };
    return { slot, bytes, sha256: e.sha256, key: keyFor(e.sha256), recipe, from: e.file, notes: slot === 'front' ? ['made from the original sheet (references: its sha256), not from text'] : [] };
  }
  if (src === 'v1') {
    const e = ledger1.calls.find((x) => x.char === c && x.view === slot)!;
    const bytes = readFileSync(path.join(DRAFTS, e.file));
    if (sha(bytes) !== e.sha256) throw new Error(`${c} ${slot} v1: file changed`);
    return {
      slot, bytes, sha256: e.sha256, key: keyFor(e.sha256), from: e.file,
      notes: ['first draft: the site\'s prompt check did not run (fal\'s safety checker did)', 'made from the original sheet'],
      recipe: {
        prompt: e.prompt, model: 'flux2-klein-4b-edit', endpoint: 'fal-ai/flux-2/klein/4b/edit', host: 'fal.ai', settings: e.settings, seed: e.seed, request_id: e.requestId,
        cost_usd: Number(e.listUsd.toFixed(4)), made_at: e.at, width: 576, height: 768, references: [{ sha256: e.reference.sha256, what: `the original starting sheet (content/snowmoon/recipes/images/cast.json#${r.id})` }],
        style: { version_id: styleVersionId, title: style.name, text: style.prompt },
        checks: { prompt: { model: 'none', verdict: 'not run' }, host_safety_checker: 'passed' } as unknown as DesignPicture['recipe']['checks'],
        assist: SAMPLE_ASSIST as unknown as DesignPicture['recipe']['assist'],
      },
    };
  }
  // The original crop (the proposal's option A): one of the three panels, padded to 432 × 576 with the sheet's own white.
  const i = SLOTS.indexOf(slot);
  const x0 = Math.round((i * r.width) / 3), x1 = Math.round(((i + 1) * r.width) / 3);
  const { data } = await sharp(sheet).extract({ left: 2, top: r.height - 3, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  const padL = Math.floor((432 - (x1 - x0)) / 2);
  const bytes = await sharp(sheet).extract({ left: x0, top: 0, width: x1 - x0, height: r.height })
    .extend({ left: padL, right: 432 - (x1 - x0) - padL, background: bg }).flatten({ background: bg }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  const s = sha(bytes);
  return {
    slot, bytes, sha256: s, key: keyFor(s), from: `originals/${r.file} x ${x0}-${x1}`,
    notes: ['local render: no prompt check or host safety checker ran', ...(slot === 'side' ? ['this panel is a three-quarter view'] : [])],
    recipe: {
      prompt: r.prompt, model: 'flux2-klein-4b', endpoint: LOCAL_ENDPOINT(cast.model), host: 'local (the maintainer\'s computer)',
      settings: { ...cast.settings, derived: `Cropped from ${r.sha256} at x ${x0}-${x1}, padded to 432 x 576 with the sheet's own background; no model` },
      seed: r.seed, request_id: null, cost_usd: 0, made_at: cast.generated_at, width: 432, height: 576,
      style: { version_id: styleVersionId, title: style.name, text: style.prompt },
      checks: NOT_RUN,
      assist: { model: 'claude-coding-agent', drafted: ['character profile', 'image prompt', 'reference choices'], source: `content/snowmoon/recipes/images/cast.json#${r.id}` },
    },
  };
}

function sheetText(c: string, p: Record<Slot, Source>): string {
  const r = cast.images.find((x) => x.id === `${c}-sheet`)!;
  const base = r.prompt.match(/(The person is .*?)\s*Detailed science fiction comic art/)![1].trim();
  // Mu's v2 views dropped "sculpted" (owner, 2026-11-01); the sheet's words follow the views when any is v2.
  const t = c === 'mu' && Object.values(p).includes('v2') ? base.replace('with one sculpted shoulder panel', 'with one shoulder panel') : base;
  if (t.length > 600) throw new Error(`${c}: text over 600 characters`);
  return t;
}

/**
 * Lines the published page (src/app/references/designs/[id]/page.tsx) prints for every picture, whatever its recipe
 * says. A picture they would misdescribe can't be published honestly until the page reads them from the recipe.
 */
function pageProblems(pics: Pic[]): string[] {
  const page = read('src/app/references/designs/[id]/page.tsx');
  const out: string[] = [];
  // Since branch design-page-recipe-lines, every line comes from the recipe (src/lib/images/recipe-lines.ts): nothing fixed to misdescribe.
  if (/howMade\(p\.recipe/.test(page)) return out;
  for (const p of pics) {
    const r = p.recipe as unknown as { checks: { prompt: { verdict: string }; host_safety_checker: string }; host: string; model: string; references?: unknown[] };
    if (/Checked by gpt-oss-safeguard-20b and the host&apos;s safety checker/.test(page) && (r.checks.prompt.verdict !== 'ok' || r.checks.host_safety_checker !== 'passed'))
      out.push(`${p.from}: the page would say "Checked by gpt-oss-safeguard-20b and the host's safety checker"; its recipe says ${r.checks.prompt.verdict === 'ok' ? '' : 'prompt check not run'}${r.checks.host_safety_checker === 'passed' ? '' : ', safety checker not run'}`);
    if (/references\?\.length \? 'Made from the front view/.test(page) && p.slot === 'front' && r.references?.length)
      out.push(`${p.from}: the page would say "Made from the front view"; this front was made from the original sheet`);
    if (/=== IMAGES\.editModel\.id \? IMAGES\.editModel\.name : IMAGES\.model\.name/.test(page) && !['flux2-klein-4b-edit', 'z-image-turbo'].includes(r.model))
      out.push(`${p.from}: the page would name the model "Z-Image Turbo", on ${r.host}; it is FLUX.2 [klein] 4B, rendered locally`);
  }
  return out;
}

// ---- The database: the dry run only reads ----
const url = arg('db') || process.env.STUDIO_DATABASE_URL;
if (!url) throw new Error('No database: set STUDIO_DATABASE_URL or --db');
if (STORAGE_DIR && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('--storage-dir is for a local test database only');
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
if (arg('set-role')) await sql.unsafe(`set role ${arg('set-role')!.replace(/[^a-z_]/g, '')}`);
type Sql = Parameters<typeof import('../src/lib/images/designs').makeDesign>[0];

async function state(tx: postgres.TransactionSql) {
  const [st] = await tx`select v.id, e.status from studio.elements e join studio.element_versions v on v.element_id = e.id
    where e.element_type = 'design' and e.work_id = ${WORK_ID} and v.body->'assist'->>'source' = ${STYLE_FILE}
    order by (e.status = 'published') desc, v.version_no desc limit 1`;
  const [taken] = await tx`select id from studio.entities where work_id = ${WORK_ID} and kind = 'style' and lower(name) = lower(${style.name})`;
  const sheets: Record<string, { existing: string | null; startingNow: number }> = {};
  for (const c of CHARACTERS) {
    const name = bookCharacter(c)!.name;
    const [ex] = await tx`select v.id from studio.elements e join studio.entities en on en.id = e.entity_id
      join studio.element_versions v on v.element_id = e.id and v.version_no = 1
      where e.element_type = 'design' and e.work_id = ${WORK_ID} and e.created_by_fid = ${MAINTAINER_FID} and en.kind = 'character' and en.name = ${name}
        and v.body->>'title' = ${SHEET_TITLE} and v.body->>'role' = 'maintainer' limit 1`;
    // /challenge's startingSheets (src/lib/challenge/entries.ts on remix-challenge): published, newest version before the window.
    const [n] = await tx`select count(*)::int as n from (
      select distinct on (e.id) e.id from studio.elements e join studio.entities en on en.id = e.entity_id join studio.element_versions v on v.element_id = e.id
      where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind = 'character' and en.name = ${name}
        and v.created_at < ${OPENS}::timestamptz order by e.id, v.version_no desc) x`;
    sheets[c] = { existing: ex ? String(ex.id) : null, startingNow: Number(n.n) };
  }
  const [{ now }] = await tx`select now() as now`;
  return { style: st ? { versionId: String(st.id), status: String(st.status) } : null, styleEntityTaken: Boolean(taken), sheets, now: new Date(now as string) };
}

const before = await sql.begin('read only', (tx) => state(tx));
const PUBLIC = (process.env.R2_IMAGES_PUBLIC_URL || 'https://pictures.snowmoon.party').replace(/\/$/, '');
const plan: Record<string, unknown>[] = [];
const say = (s = '') => console.log(s);
/** Exit only after stdout has drained (a pipe is asynchronous; a long plan would be cut off). */
const finish = async (code: number) => { await sql.end(); await new Promise((r) => process.stdout.write('', () => r(null))); process.exit(code); };

say(`seed-designs: ${APPLY ? 'APPLY' : 'DRY RUN (reads only, in one read-only transaction; nothing written, nothing uploaded)'}`);
say(`database: ${new URL(url).hostname}; its time ${before.now.toISOString()}; the window opens ${OPENS}`);
say(`picks: ${PICKS_FILE ? PICKS_FILE : 'none given, assuming v2 for every view'}`);
say(`as FID ${MAINTAINER_FID}, by_name "${BY_NAME}", role maintainer${STORAGE_DIR ? `; STAND-IN storage ${STORAGE_DIR}` : ''}`);
say();

// ---- 1. The style ----
const samples = await samplePics();
let styleVersionId = before.style?.versionId ?? '<the new Techno vistas version id>';
const styleBody = (s: DesignPicture[]): DesignBody => ({
  // Labelled "starting point" (owner, 2026-11-02); a style has no label field, so the label is in its title.
  title: `${style.name} (starting point)`, text: style.prompt, samples: s, views: {}, by_name: BY_NAME, by_name_source: null, role: 'maintainer',
  assist: { model: 'claude-coding-agent', drafted: ['style text'], source: STYLE_FILE },
});
say('== 1. Style: Techno vistas ==');
if (before.style) say(`SKIP: already exists (version ${before.style.versionId}, ${before.style.status}); the sheets link to it.`);
else if (before.styleEntityTaken) { say('STOP: a style entity named "Techno vistas" exists without the starting style on it; look before writing.'); await finish(3); }
else {
  say('writes, in one transaction (makeDesign, mode create, kind style): studio.entities (kind style, name "Techno vistas"); studio.elements (design, by 6786, published); studio.element_versions (version 1, the body below)');
  say('uploads first (putPublic, the public bucket):');
  for (const p of samples) say(`  ${p.key}  sha256 ${p.sha256}  from ${p.from}`);
  const shown = styleBody(samples.map((p) => ({ url: `${PUBLIC}/${p.key}`, sha256: p.sha256, recipe: p.recipe })));
  say(JSON.stringify(shown, null, 1));
  plan.push({ step: 1, kind: 'style', body: shown });
}

// ---- 2. The sheets ----
const problems: string[] = before.style ? [] : pageProblems(samples);
const sheetPlans: { c: string; name: string; pics: Pic[]; body: (vid: string, urls: Record<string, string>) => DesignBody }[] = [];
for (const c of CHARACTERS) {
  const ch = bookCharacter(c)!;
  const pics = await Promise.all(SLOTS.map((s) => viewPic(c, s, picks[c][s], styleVersionId)));
  const text = sheetText(c, picks[c]);
  const r = cast.images.find((x) => x.id === `${c}-sheet`)!;
  const body = (vid: string, urls: Record<string, string>): DesignBody => ({
    title: SHEET_TITLE, text, samples: [],
    views: Object.fromEntries(pics.map((p) => [p.slot, { url: urls[p.slot], sha256: p.sha256, recipe: { ...p.recipe, style: { ...p.recipe.style!, version_id: vid } } }])),
    by_name: BY_NAME, by_name_source: null, role: 'maintainer',
    assist: { model: 'claude-coding-agent', drafted: ['character profile', 'view prompts'], source: `content/snowmoon/recipes/images/cast.json#${r.id}` },
    style: { version_id: vid, title: style.name },
  });
  sheetPlans.push({ c, name: ch.name, pics, body });
  if (!before.sheets[c].existing) problems.push(...pageProblems(pics));
}

say();
say('== 2. Sheets, titled "Starting point" ==');
for (const s of sheetPlans) {
  const ex = before.sheets[s.c].existing;
  const ch = bookCharacter(s.c)!;
  say();
  say(`-- ${s.name} (${s.c}): picks ${JSON.stringify(picks[s.c])}`);
  if (ex) { say(`SKIP: already exists (version ${ex}).`); plan.push({ step: 2, kind: 'character', c: s.c, skip: true, versionId: ex }); continue; }
  say(`writes, in one transaction (makeDesign, mode create, kind character): studio.entities (kind character, name "${s.name}", setting ${ch.setting ?? 'null'}, first_chapter ${ch.firstChapter}) unless it exists; studio.elements (design, by 6786, published); studio.element_versions (version 1, the body below)`);
  say('uploads first (putPublic):');
  for (const p of s.pics) say(`  ${p.slot.padEnd(5)} ${p.key}  sha256 ${p.sha256}  from ${p.from}${p.notes.length ? `  [${p.notes.join('; ')}]` : ''}`);
  const b = s.body(styleVersionId, Object.fromEntries(s.pics.map((p) => [p.slot, `${PUBLIC}/${p.key}`])));
  say(JSON.stringify(b, null, 1));
  plan.push({ step: 2, kind: 'character', c: s.c, skip: false, body: b });
}

// ---- What /challenge will show, and the window ----
say();
say('== /challenge "Sheets to start from" after this run ==');
for (const s of sheetPlans) {
  const n = before.sheets[s.c].startingNow + (before.sheets[s.c].existing ? 0 : 1);
  say(`  ${s.name}: ${n} sheet${n === 1 ? '' : 's'} (now ${before.sheets[s.c].startingNow})${before.sheets[s.c].existing ? '' : `; newest: "${SHEET_TITLE}" by @${BY_NAME} · maintainer`}`);
}
const margin = (Date.parse(OPENS) - before.now.getTime()) / 3600_000;
say(`created_at is the database's now() at the write: ${margin > 0 ? `before the window opens, if run before ${OPENS} (${margin.toFixed(1)} hours after this run)` : 'TOO LATE: the window is open'}. --apply refuses from ${OPENS}.`);
say();
say('== Order of the writes ==');
say('1. the style: upload its 2 samples (putPublic), then one makeDesign transaction. 2. each sheet, in the order above: upload its 3 views, then one makeDesign transaction. A failure stops the run; running again skips what exists.');
say('Not written: studio.links (nothing is a fork), studio.recipes, studio.picks, challenge rows, spend or daily counts. The route\'s 3-a-day publish limit is not applied by the script.');
const uniq = [...new Set(problems)];
if (uniq.length) {
  say();
  say(`== BLOCKS --apply: ${uniq.length} line${uniq.length === 1 ? '' : 's'} the published page would get wrong ==`);
  for (const p of uniq) say(`  - ${p}`);
  say('Fix first: the page reads the model, host, checks and the reference\'s meaning from each recipe (a small change to src/app/references/designs/[id]/page.tsx), merged with the owner\'s OK.');
}
if (arg('json')) writeFileSync(arg('json')!, JSON.stringify({ before, picks, plan, problems: uniq }, null, 1));

if (!APPLY) {
  say();
  say('Dry run: nothing written, nothing uploaded.');
  await finish(0);
}
if (uniq.length && !STORAGE_DIR) {
  say('Refusing --apply: the page would misdescribe these pictures (above). Nothing done.');
  await finish(4);
}

// ---- APPLY: through the site's own functions ----
if (!STORAGE_DIR) {
  // The readers' bucket only, as the site uses it; never the book's media bucket (a local .env.local may point R2_BUCKET there).
  const { storageReady, missingStorage, BOOK_MEDIA_BUCKET } = await import('../src/lib/images/store');
  if (!storageReady() || process.env.R2_BUCKET === BOOK_MEDIA_BUCKET) {
    say(`Refusing --apply: the site's storage settings are needed (the readers' bucket, as production has them). ${process.env.R2_BUCKET === BOOK_MEDIA_BUCKET ? `R2_BUCKET is ${BOOK_MEDIA_BUCKET}, the book's media bucket. ` : ''}Missing: ${missingStorage().join(', ') || 'none'}. Nothing done.`);
    await finish(5);
  }
}
const { makeDesign } = await import('../src/lib/images/designs');
const put = async (p: Pic): Promise<string> => {
  if (STORAGE_DIR) {
    const f = path.join(STORAGE_DIR, keyFor(p.sha256));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, p.bytes);
    return `${PUBLIC}/${keyFor(p.sha256)}`;
  }
  const { putPublic } = await import('../src/lib/images/store');
  return putPublic(p.sha256, p.bytes, 'image/jpeg');
};
say();
if (!before.style) {
  const urls = await Promise.all(samples.map(put));
  const out = await makeDesign(sql as unknown as Sql, { fid: MAINTAINER_FID, mode: 'create', kind: 'style', styleName: style.name, body: styleBody(samples.map((p, i) => ({ url: urls[i], sha256: p.sha256, recipe: p.recipe }))) });
  styleVersionId = out.versionId;
  say(`style published: version ${out.versionId}`);
}
for (const s of sheetPlans) {
  // Checked again here, so a run stopped half-way and started again skips what it already made.
  const now = await sql.begin('read only', (tx) => state(tx));
  if (now.sheets[s.c].existing) { say(`${s.name}: exists, skipped`); continue; }
  const urls: Record<string, string> = {};
  for (const p of s.pics) urls[p.slot] = await put(p);
  const out = await makeDesign(sql as unknown as Sql, { fid: MAINTAINER_FID, mode: 'create', kind: 'character', character: bookCharacter(s.c)!, body: s.body(styleVersionId, urls) });
  say(`${s.name}: published, version ${out.versionId}`);
}
say('done.');
await finish(0);
