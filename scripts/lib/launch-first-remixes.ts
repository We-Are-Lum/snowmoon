/**
 * The owner's first remixes for the launch (2026-11-06), run by `scripts/import-first-remixes.ts --launch`. Each of the
 * owner's publishable Midjourney pictures (first-remixes/recipes.json, branch challenge-styles; scripts/lib/
 * launch-picks.json pins each file's sha256 and the base it remixes) is published from FID 6786 as a remix (a fork,
 * studio.links remixed_from) of its base's published version, labelled MIDJOURNEY_LABEL, with the recipe its maker
 * reported (prompt, parameters, job id, date; the references identified as the owner's own picture or profiles), the PNG
 * converted to JPEG for the site (both sha256s kept), through putPublic and makeDesign. Written by the coding agent
 * (Claude, a closed model by Anthropic), lane B, 2026-11-05 night. DRAFT.
 *
 * Runs ONLY on the owner's machine with his own env files, after publish-bases:
 *   npx tsx --conditions=react-server --env-file-if-exists=.env.local --env-file-if-exists=.env.storage.local \
 *     scripts/import-first-remixes.ts --launch --bases=launch-bases-published.json                     dry run
 *   … --launch --bases=launch-bases-published.json --apply --confirm-owner-go --out=launch-first-remixes.json
 *
 * --apply refuses: without --confirm-owner-go; while CHALLENGE.public is on; while any remix's base isn't confirmed by
 * the owner (owner_confirmed in the picks); while Midjourney isn't on config/models.json as a closed model by Midjourney
 * (every recipe's model must be on the list, principle 3); while a base isn't a published sheet of 6786's for that
 * character with the pinned front; while a file's sha256 isn't the pinned one. Idempotent: a picture already published
 * by 6786 (by its original sha256) is skipped. Options as publish-bases (--db, --storage-dir, --set-role, --drafts,
 * --picks, --name).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';
import { CHALLENGE, WORK_ID } from '../../src/lib/config';
import { keyFor } from '../../src/lib/images/store';
import { MAINTAINER_FID, MIDJOURNEY_LABEL, MIDJOURNEY_MODEL, applyGate, pinned, readPicks, readRemixRecipes, remixProblems, remixRecipe, sha } from './launch-publish';

const ROOT = path.resolve(import.meta.dirname, '../..');
const arg = (k: string) => {
  const a = process.argv.findLast((x) => x === `--${k}` || x.startsWith(`--${k}=`)); // the last one given wins
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : '') : null;
};
const has = (k: string) => process.argv.includes(`--${k}`);
const APPLY = has('apply');
const DRAFTS = arg('drafts') || '/Users/nathan/snowmoon-challenge-styles/docs/starting-sheet-drafts';
const PICKS = arg('picks') || path.join(ROOT, 'scripts/lib/launch-picks.json');
const BASES = arg('bases');
const BY_NAME = arg('name') || 'naaate';
const STORAGE_DIR = arg('storage-dir');
const OUT = arg('out');
const url = arg('db') || process.env.STUDIO_DATABASE_URL;
const say = (s = '') => console.log(s);
if (!url) { say('No database: set STUDIO_DATABASE_URL or --db. Nothing done.'); process.exit(2); }
if (!BASES || !existsSync(BASES)) { say('--bases=<file> is needed: the file publish-bases --out wrote (the bases\' version ids). Nothing done.'); process.exit(2); }
const local = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
if (STORAGE_DIR && !local) { say('--storage-dir is for a local test database only. Nothing done.'); process.exit(2); }
const testCfg = STORAGE_DIR && local && process.env.LAUNCH_PUBLISH_TEST_CONFIG ? (JSON.parse(process.env.LAUNCH_PUBLISH_TEST_CONFIG) as { public?: boolean; midjourneyListed?: boolean }) : {};
const isPublic = testCfg.public ?? CHALLENGE.public;

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
if (arg('set-role')) await sql.unsafe(`set role ${arg('set-role')!.replace(/[^a-z_]/g, '')}`);
const finish = async (code: number) => { await sql.end(); await new Promise((r) => process.stdout.write('', () => r(null))); process.exit(code); };

const { makeDesign } = await import('../../src/lib/images/designs');
const { closedModel } = await import('../../src/lib/images/recipe-lines');
const picks = readPicks(PICKS);
const recipes = readRemixRecipes(DRAFTS);
const published = (JSON.parse(readFileSync(BASES, 'utf8')) as { bases: Record<string, { character: string; versionId: string; frontSha256: string }> }).bases;
// The test can force either case; otherwise the real list (Midjourney is on it since 2026-11-05, closed, never offered).
const mj = testCfg.midjourneyListed === true ? { closed: true, maker: 'Midjourney' } : testCfg.midjourneyListed === false ? null : closedModel(MIDJOURNEY_MODEL);
const refusals: string[] = [];
if (!mj || !mj.closed || mj.maker !== 'Midjourney') refusals.push(`Midjourney is not on config/models.json as a closed model by Midjourney (id "${MIDJOURNEY_MODEL}"): every recipe's model must be on the list (principle 3)`);

const PUBLIC = (process.env.R2_IMAGES_PUBLIC_URL || 'https://pictures.snowmoon.party').replace(/\/$/, '');
const already = async (s: string) => {
  const [r] = await sql`select v.id::text as id from studio.elements e join studio.element_versions v on v.element_id = e.id
    where e.element_type = 'design' and e.work_id = ${WORK_ID} and e.created_by_fid = ${MAINTAINER_FID}
      and v.body->'views'->'front'->'recipe'->'settings'->'original'->>'sha256' = ${s} limit 1`;
  return r ? String(r.id) : null;
};
const baseRow = async (versionId: string) => {
  const [r] = await sql`select v.id::text as id, v.body, e.created_by_fid, e.status, en.name from studio.element_versions v join studio.elements e on e.id = v.element_id
    join studio.entities en on en.id = e.entity_id where v.id::text = ${versionId} and e.element_type = 'design'`;
  return r as { id: string; body: { text: string; views: { front?: { sha256: string } } }; created_by_fid: number; status: string; name: string } | undefined;
};
const { bookCharacter } = await import('../../src/lib/images/designs');

say(`import-first-remixes --launch: ${APPLY ? 'APPLY' : 'DRY RUN (reads only; nothing written, nothing uploaded)'}`);
say(`database: ${new URL(url).hostname}; drafts: ${DRAFTS}; bases: ${BASES}; label: "${MIDJOURNEY_LABEL}"`);
for (const r of refusals) say(`PROBLEM: ${r}`);
type Plan = { title: string; base: { key: string; versionId: string; text: string; frontSha256: string }; jpeg: Buffer; jpegSha: string; original: string; recipe: ReturnType<typeof remixRecipe>; skip: string | null };
const plans: Plan[] = [];
for (const p of picks.first_remixes) {
  say();
  say(`-- ${p.file}: "${p.title}", remixes ${p.base}${p.owner_confirmed ? ' (confirmed by the owner)' : ` (agent's proposal: ${p.base_proposed_by_agent})`}`);
  const r = recipes.get(p.file);
  const probs = remixProblems(p, r, picks.bases);
  const pb = published[p.base];
  let base: Plan['base'] | null = null;
  if (!pb) probs.push(`base ${p.base}: not in ${BASES} (publish it first)`);
  else {
    const row = await baseRow(pb.versionId);
    if (!row) probs.push(`base ${p.base}: version ${pb.versionId} is not in this database`);
    else {
      if (Number(row.created_by_fid) !== MAINTAINER_FID || row.status !== 'published') probs.push(`base ${p.base}: version ${pb.versionId} is not a published sheet of ${MAINTAINER_FID}'s`);
      if (row.name !== bookCharacter(pb.character)?.name) probs.push(`base ${p.base}: version ${pb.versionId} is ${row.name}'s sheet`);
      if (row.body?.views?.front?.sha256 !== pb.frontSha256) probs.push(`base ${p.base}: its front is not the pinned picture`);
      base = { key: p.base, versionId: pb.versionId, text: row.body?.text ?? '', frontSha256: pb.frontSha256 };
    }
  }
  let png: Buffer | null = null;
  try { png = pinned(DRAFTS, p); } catch (e) { probs.push((e as Error).message); }
  const skip = await already(p.sha256);
  if (skip) { say(`SKIP: already published, version ${skip}`); continue; }
  for (const x of probs) { say(`  PROBLEM: ${x}`); refusals.push(`${p.file}: ${x}`); }
  if (!png || !r || !base) continue;
  const { data, info } = await sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const jpegSha = sha(data);
  const recipe = remixRecipe(r, { sha256: jpegSha, width: info.width, height: info.height }, { sha256: base.frontSha256, key: base.key });
  say(`  front ${keyFor(jpegSha)}  sha256 ${jpegSha} (JPEG of ${p.sha256})  ${info.width} x ${info.height}`);
  say(`  recipe: ${JSON.stringify(recipe)}`);
  plans.push({ title: p.title, base, jpeg: data, jpegSha, original: p.sha256, recipe, skip: null });
}
const gate = applyGate({ apply: APPLY, confirmed: has('confirm-owner-go'), isPublic, refusals });
if (!APPLY) {
  say();
  if (refusals.length) say(`--apply would refuse: ${refusals.length} problem(s) above.`);
  say('Dry run: nothing written, nothing uploaded.');
  await finish(0);
}
if (gate.length) { for (const g of gate) say(`Refusing --apply: ${g}.`); say('Nothing done.'); await finish(3); }
if (!STORAGE_DIR) {
  const { storageReady, missingStorage, BOOK_MEDIA_BUCKET } = await import('../../src/lib/images/store');
  if (!storageReady() || process.env.R2_BUCKET === BOOK_MEDIA_BUCKET) { say(`Refusing --apply: the site's storage settings are needed. Missing: ${missingStorage().join(', ') || 'none'}. Nothing done.`); await finish(4); }
}
const put = async (s: string, bytes: Buffer) => {
  if (STORAGE_DIR) {
    const f = path.join(STORAGE_DIR, keyFor(s));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, bytes);
    return `${PUBLIC}/${keyFor(s)}`;
  }
  const { putPublic } = await import('../../src/lib/images/store');
  return putPublic(s, bytes, 'image/jpeg');
};
type Sql = Parameters<typeof makeDesign>[0];
const done: Record<string, { versionId: string; base: string; character: string }> = {};
say();
for (const p of plans) {
  const ex = await already(p.original);
  if (ex) { say(`${p.title}: exists, skipped (version ${ex})`); continue; }
  const u = await put(p.jpegSha, p.jpeg);
  const body = {
    title: p.title, text: p.base.text, samples: [], views: { front: { url: u, sha256: p.jpegSha, recipe: p.recipe } },
    by_name: BY_NAME, by_name_source: null, role: 'maintainer' as const,
    assist: { model: 'claude-coding-agent', drafted: ['the sheet\'s text, kept from its base'], source: 'the base it remixes' },
    style: null,
  };
  const out = await makeDesign(sql as unknown as Sql, { fid: MAINTAINER_FID, mode: 'fork', kind: 'character', fromVersionId: p.base.versionId, body: body as never });
  const character = published[p.base.key].character;
  done[p.title] = { versionId: out.versionId, base: p.base.key, character };
  say(`${p.title}: published, version ${out.versionId}, a remix of ${p.base.key} (${p.base.versionId})`);
}
say();
say(`CHALLENGE.firstRemixes for the config PR (version ids; at most ${CHALLENGE.firstRemixesShown} are shown per character, in this order):`);
for (const c of CHALLENGE.characters) say(`    ${c}: [${Object.values(done).filter((d) => d.character === c).map((d) => `'${d.versionId}'`).join(', ')}],`);
if (OUT) writeFileSync(OUT, JSON.stringify({ written_at: new Date().toISOString(), first_remixes: done }, null, 1));
say('done.');
await finish(0);
