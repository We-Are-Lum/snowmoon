/**
 * More starting points while the challenge runs (owner, 2026-11-27): the owner's Midjourney pictures, each published
 * from FID 6786 as a remix (a fork, studio.links remixed_from) of the named base's published version, exactly as the
 * launch's first remixes were (scripts/lib/launch-first-remixes.ts, 2026-11-06): labelled MIDJOURNEY_LABEL, the recipe
 * its maker reported, the picture converted to JPEG for the site (both sha256s kept), through putPublic and makeDesign.
 * The coordinator then adds the version ids it prints to CHALLENGE.bases (this script never changes the config).
 *
 * Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-27. DRAFT.
 *
 * The folder holds one <name>.json recipe per picture (the FirstRemixRecipe shape, scripts/import-first-remixes.ts;
 * template docs/proposals/challenge-first-remix-recipe.template.json; an optional "title" names the sheet), each next to
 * the PNG or JPEG it names. Runs ONLY on the owner's machine with his own env files:
 *   npx tsx --conditions=react-server --env-file-if-exists=.env.local --env-file-if-exists=.env.storage.local \
 *     scripts/add-starting-points.ts --dir=<folder>                                                    dry run
 *   … scripts/add-starting-points.ts --dir=<folder> --apply --confirm-owner-go --out=<file>.json         publish
 *
 * Allowed while CHALLENGE.public is on (that is its point). Every recipe gets recipeProblems' checks (character, base
 * one of that character's CHALLENGE.bases, file, sha256, tool, prompt, settings, inputs, job, plan, date), and --apply
 * refuses the whole run: without --confirm-owner-go; if any file's sha256 is not its recipe's; if any base isn't one of
 * its character's CHALLENGE.bases, or isn't a published sheet of that character in the database; if any recipe's model
 * isn't on config/models.json (or isn't Midjourney, whose label this is); without the site's storage settings.
 * Idempotent: a picture already published by 6786 (by its original sha256) is skipped. Options: --db=<url>
 * --storage-dir=<dir> (a stand-in for R2; local test database only) --set-role=studio_writer (tests) --name=<byline>.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';
import { CHALLENGE, WORK_ID } from '../src/lib/config';
import { keyFor } from '../src/lib/images/store';
import { recipeProblems, type FirstRemixRecipe } from './import-first-remixes';
import { MAINTAINER_FID, MIDJOURNEY_LABEL, MIDJOURNEY_MODEL, addedRecipe } from './lib/launch-publish';

const arg = (k: string) => {
  const a = process.argv.findLast((x) => x === `--${k}` || x.startsWith(`--${k}=`)); // the last one given wins
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : '') : null;
};
const has = (k: string) => process.argv.includes(`--${k}`);
const say = (s = '') => console.log(s);
const APPLY = has('apply');
const DIR = arg('dir');
const BY_NAME = arg('name') || 'naaate';
const STORAGE_DIR = arg('storage-dir');
const OUT = arg('out');
const url = arg('db') || process.env.STUDIO_DATABASE_URL;
if (!DIR || !existsSync(DIR)) { say('Usage: --dir=<folder with <name>.json recipes and their pictures>. Nothing done.'); process.exit(2); }
if (!url) { say('No database: set STUDIO_DATABASE_URL or --db. Nothing done.'); process.exit(2); }
const local = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
if (STORAGE_DIR && !local) { say('--storage-dir is for a local test database only. Nothing done.'); process.exit(2); }

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
if (arg('set-role')) await sql.unsafe(`set role ${arg('set-role')!.replace(/[^a-z_]/g, '')}`);
const finish = async (code: number) => { await sql.end(); await new Promise((r) => process.stdout.write('', () => r(null))); process.exit(code); };

const { makeDesign, bookCharacter } = await import('../src/lib/images/designs');
const { closedModel } = await import('../src/lib/images/recipe-lines');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const PUBLIC = (process.env.R2_IMAGES_PUBLIC_URL || 'https://pictures.snowmoon.party').replace(/\/$/, '');

const already = async (s: string) => {
  const [r] = await sql`select v.id::text as id from studio.elements e join studio.element_versions v on v.element_id = e.id
    where e.element_type = 'design' and e.work_id = ${WORK_ID} and e.created_by_fid = ${MAINTAINER_FID}
      and v.body->'views'->'front'->'recipe'->'settings'->'original'->>'sha256' = ${s} limit 1`;
  return r ? String(r.id) : null;
};
/** The base's published version: the id itself when it is a version, else the element's newest version. */
const baseRow = async (id: string) => {
  const [r] = await sql`select v.id::text as id, v.body, e.status, e.element_type, en.name from studio.element_versions v
    join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
    where (v.id::text = ${id} or e.id::text = ${id}) and e.element_type = 'design'
    order by (v.id::text = ${id}) desc, v.version_no desc limit 1`;
  return r as { id: string; body: { text?: string; views?: { front?: { sha256?: string } } }; status: string; name: string } | undefined;
};
const modelId = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');

say(`add-starting-points: ${APPLY ? 'APPLY' : 'DRY RUN (reads only; nothing written, nothing uploaded)'}`);
say(`database: ${new URL(url).hostname}; folder: ${DIR}; label: "${MIDJOURNEY_LABEL}"; CHALLENGE.public: ${CHALLENGE.public ? 'on (allowed)' : 'off'}`);
type Plan = { name: string; title: string; character: string; base: { versionId: string; text: string }; jpeg: Buffer; jpegSha: string; original: string; recipe: ReturnType<typeof addedRecipe> };
const plans: Plan[] = [];
const refusals: string[] = [];
const skipped: { file: string; character: string; versionId: string }[] = [];
const files = readdirSync(DIR).filter((x) => x.endsWith('.json')).sort();
if (!files.length) refusals.push(`no <name>.json recipe in ${DIR}`);
for (const f of files) {
  say();
  say(`-- ${f}`);
  let r: Partial<FirstRemixRecipe> & { title?: unknown };
  try { r = JSON.parse(readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { say(`  PROBLEM: not JSON (${(e as Error).message})`); refusals.push(`${f}: not JSON`); continue; }
  const probs = recipeProblems(r);
  let bytes: Buffer | null = null;
  const file = typeof r.file === 'string' ? path.join(DIR, path.basename(r.file)) : null;
  if (!file || !existsSync(file)) probs.push('file: not found in the folder');
  else {
    bytes = readFileSync(file);
    const real = sha(bytes);
    if (real !== String(r.sha256 ?? '').toLowerCase()) probs.push(`sha256: the file's is ${real}, not the one in its recipe: refused`);
  }
  if (r.tool && typeof r.tool.name === 'string') {
    const id = modelId(r.tool.name);
    const m = closedModel(id);
    if (!m) probs.push(`model "${r.tool.name}" (id "${id}"): not on config/models.json (every recipe's model must be on the list, principle 3)`);
    else if (id !== MIDJOURNEY_MODEL || !m.closed || m.maker !== 'Midjourney') probs.push(`model "${id}": this path brings in Midjourney pictures only (closed, by Midjourney; the label names Midjourney)`);
  }
  if (r.title !== undefined && (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 120)) probs.push('title: when given, a name of at most 120 characters');
  let base: Plan['base'] | null = null;
  let frontSha: string | null = null;
  if (typeof r.base === 'string' && typeof r.character === 'string' && !probs.some((p) => p.startsWith('base:') || p.startsWith('character:'))) {
    const row = await baseRow(r.base.toLowerCase());
    if (!row) probs.push(`base ${r.base}: not in this database`);
    else {
      if (row.status !== 'published') probs.push(`base ${r.base}: not a published sheet`);
      if (row.name !== bookCharacter(r.character)?.name) probs.push(`base ${r.base}: it is ${row.name}'s sheet, not ${r.character}'s`);
      frontSha = row.body?.views?.front?.sha256 ?? null;
      base = { versionId: row.id, text: row.body?.text ?? '' };
    }
  }
  const original = String(r.sha256 ?? '').toLowerCase();
  const skip = /^[0-9a-f]{64}$/.test(original) ? await already(original) : null;
  if (skip) { say(`  SKIP: already published by ${MAINTAINER_FID}, version ${skip}`); skipped.push({ file: f, character: String(r.character), versionId: skip }); continue; }
  for (const x of probs) { say(`  PROBLEM: ${x}`); refusals.push(`${f}: ${x}`); }
  if (probs.length || !bytes || !base) continue;
  const rec = r as FirstRemixRecipe;
  const meta = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes).flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const jpegSha = sha(data);
  const recipe = addedRecipe(rec, { sha256: jpegSha, width: info.width, height: info.height, from: meta.format === 'png' ? 'image/png' : 'image/jpeg', originalSize: meta.width && meta.height ? [meta.width, meta.height] : null }, { versionId: base.versionId, frontSha256: frontSha });
  const title = typeof r.title === 'string' ? r.title.trim() : `${bookCharacter(rec.character)?.name ?? rec.character}, from Midjourney (${path.basename(rec.file).replace(/\.[^.]+$/, '')})`;
  say(`  "${title}": ${rec.character}, a remix of base ${base.versionId}`);
  say(`  front ${keyFor(jpegSha)}  sha256 ${jpegSha} (JPEG of ${original})  ${info.width} x ${info.height}`);
  say(`  recipe: ${JSON.stringify(recipe)}`);
  plans.push({ name: f, title, character: rec.character, base, jpeg: data, jpegSha, original, recipe });
}
say();
if (!APPLY) {
  if (refusals.length) say(`--apply would refuse: ${refusals.length} problem(s) above.`);
  say(`Would publish ${plans.length}; ${skipped.length} already published.`);
  say('Dry run: nothing written, nothing uploaded.');
  await finish(0);
}
const gate = [...(has('confirm-owner-go') ? [] : ['--apply needs --confirm-owner-go (the owner\'s go)']), ...refusals];
if (gate.length) { for (const g of gate) say(`Refusing --apply: ${g}.`); say('Nothing done.'); await finish(3); }
if (!STORAGE_DIR) {
  const { storageReady, missingStorage, BOOK_MEDIA_BUCKET } = await import('../src/lib/images/store');
  if (!storageReady() || process.env.R2_BUCKET === BOOK_MEDIA_BUCKET) { say(`Refusing --apply: the site's storage settings are needed. Missing: ${missingStorage().join(', ') || 'none'}. Nothing done.`); await finish(4); }
}
const put = async (s: string, bytes: Buffer) => {
  if (STORAGE_DIR) {
    const f = path.join(STORAGE_DIR, keyFor(s));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, bytes);
    return `${PUBLIC}/${keyFor(s)}`;
  }
  const { putPublic } = await import('../src/lib/images/store');
  return putPublic(s, bytes, 'image/jpeg');
};
type Sql = Parameters<typeof makeDesign>[0];
const done: { file: string; title: string; character: string; versionId: string; base: string }[] = [];
for (const p of plans) {
  const ex = await already(p.original);
  if (ex) { say(`${p.name}: exists, skipped (version ${ex})`); skipped.push({ file: p.name, character: p.character, versionId: ex }); continue; }
  const u = await put(p.jpegSha, p.jpeg);
  const body = {
    title: p.title, text: p.base.text, samples: [], views: { front: { url: u, sha256: p.jpegSha, recipe: p.recipe } },
    by_name: BY_NAME, by_name_source: null, role: 'maintainer' as const,
    assist: { model: 'claude-coding-agent', drafted: ['the sheet\'s text, kept from its base'], source: 'the base it remixes' },
    style: null,
  };
  const out = await makeDesign(sql as unknown as Sql, { fid: MAINTAINER_FID, mode: 'fork', kind: 'character', fromVersionId: p.base.versionId, body: body as never });
  done.push({ file: p.name, title: p.title, character: p.character, versionId: out.versionId, base: p.base.versionId });
  say(`${p.name}: published, version ${out.versionId}, a remix of ${p.base.versionId}`);
}
say();
say('New version ids, per character, to add to CHALLENGE.bases (with baseCount; this script changes no config):');
for (const c of CHALLENGE.characters) {
  const ids = done.filter((d) => d.character === c).map((d) => `'${d.versionId}'`);
  if (ids.length) say(`    ${c}: [${ids.join(', ')}],`);
}
if (!done.length) say('    (none new)');
if (skipped.length) say(`Already published (skipped): ${skipped.map((s) => `${s.character} ${s.versionId} (${s.file})`).join('; ')}`);
if (OUT) writeFileSync(OUT, JSON.stringify({ written_at: new Date().toISOString(), new: Object.fromEntries(CHALLENGE.characters.map((c) => [c, done.filter((d) => d.character === c).map((d) => d.versionId)]).filter(([, v]) => v.length)), published: done, skipped }, null, 1));
say('done.');
await finish(0);
