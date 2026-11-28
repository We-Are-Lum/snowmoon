/**
 * scripts/add-starting-points.ts against PGlite (every migration, served on a local socket, written as studio_writer),
 * with a stand-in for R2 that writes to a temp folder, and pictures made here. No production, no R2, no network, no model.
 * The bases are seeded under two of the committed CHALLENGE.bases ids (Zei's and Mu's first), so the script runs on the
 * real config, CHALLENGE.public included, with no test switch.
 *
 *   npm run test:add-starting-points
 *
 * Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-27.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import sharp from 'sharp';
import { CHALLENGE } from '../src/lib/config';
import { recipeProblems, type FirstRemixRecipe } from './import-first-remixes';
import { MIDJOURNEY_LABEL, addedRecipe } from './lib/launch-publish';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${String(detail).slice(0, 800)}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ZEI_BASE = CHALLENGE.bases.zei[0];
const MU_BASE = CHALLENGE.bases.mu[0];
const BASE_FRONT = 'e'.repeat(64);

// ---- Pictures and recipes ----
const tmp = mkdtempSync(path.join(tmpdir(), 'add-starting-points-'));
const png = await sharp({ create: { width: 48, height: 64, channels: 4, background: { r: 30, g: 90, b: 140, alpha: 1 } } }).png().toBuffer();
const jpg = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
const recipe = (o: Partial<FirstRemixRecipe> & { title?: string }): FirstRemixRecipe & { title?: string } => ({
  character: 'zei', base: ZEI_BASE, file: 'zei-snow.png', sha256: sha(png),
  tool: { name: 'Midjourney', maker: 'Midjourney, Inc.', version: 'v7' },
  prompt: 'a young man in deep snow, flat cel-shaded illustration', settings: { aspect_ratio: '3:4', stylize: 250, seed: '6062', raw: false },
  inputs: [{ sha256: BASE_FRONT, what: 'the base\'s front view (Zei)' }], job: { id: 'job-1', cell: 2 }, plan: 'paid, Standard',
  made_on: '2026-11-26', reported: 'self-reported', ...o,
});
const folder = (name: string, items: { json: object; file?: [string, Buffer] }[]) => {
  const d = path.join(tmp, name);
  mkdirSync(d, { recursive: true });
  items.forEach((it, i) => {
    writeFileSync(path.join(d, `r${i}.json`), JSON.stringify(it.json, null, 1));
    if (it.file) writeFileSync(path.join(d, it.file[0]), it.file[1]);
  });
  return d;
};
const good = folder('good', [
  { json: recipe({ title: 'Zei in the snow' }), file: ['zei-snow.png', png] },
  { json: recipe({ character: 'mu', base: MU_BASE, file: 'mu-dusk.jpg', sha256: sha(jpg), job: { id: null, cell: null } }), file: ['mu-dusk.jpg', jpg] },
]);
const tampered = Buffer.from(png); tampered[tampered.length - 20] ^= 1;
const wrongSha = folder('wrong-sha', [{ json: recipe({}), file: ['zei-snow.png', tampered] }]);
const otherBase = folder('other-base', [{ json: recipe({ character: 'mu', base: ZEI_BASE }), file: ['zei-snow.png', png] }]);
const notListed = folder('not-listed', [{ json: recipe({ base: '00000000-0000-4000-8000-000000000000' }), file: ['zei-snow.png', png] }]);
const badModel = folder('bad-model', [{ json: recipe({ tool: { name: 'Pictomatic', maker: 'Nobody', version: '1' } }), file: ['zei-snow.png', png] }]);
const notInDb = folder('not-in-db', [{ json: recipe({ base: CHALLENGE.bases.zei[1] }), file: ['zei-snow.png', png] }]);
// One good picture and one wrong: the whole run is refused, the good one included.
const mixed = path.join(tmp, 'mixed');
cpSync(good, mixed, { recursive: true });
writeFileSync(path.join(mixed, 'r9.json'), JSON.stringify(recipe({ file: 'zei-bad.png', sha256: 'f'.repeat(64) })));
writeFileSync(path.join(mixed, 'zei-bad.png'), png);

// ---- The pure part ----
check('the committed config has CHALLENGE.public on (the run below is on it, no switch)', CHALLENGE.public === true);
check('the test recipe passes recipeProblems', recipeProblems(recipe({})).length === 0, recipeProblems(recipe({})).join('; '));
check('planted: recipeProblems refuses a base that is another character\'s', recipeProblems(recipe({ character: 'mu', base: ZEI_BASE })).some((p) => p.startsWith('base:')));
{
  const r = addedRecipe(recipe({}), { sha256: 'a'.repeat(64), width: 48, height: 64, from: 'image/png', originalSize: [48, 64] }, { versionId: ZEI_BASE, frontSha256: BASE_FRONT });
  const s = r.settings as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  check('addedRecipe: model midjourney, the label, self-reported, both sha256s, the base, seed, job, checks not run, no cost', r.model === 'midjourney' && s.label === MIDJOURNEY_LABEL && s.self_reported === true && s.original.sha256 === sha(png) && s.converted.jpeg_sha256 === 'a'.repeat(64) && s.remixes_base.version_id === ZEI_BASE && r.seed === 6062 && r.request_id === 'job-1' && r.endpoint === 'Midjourney v7, outside the site' && r.checks.prompt.verdict === 'not run' && r.cost_usd === 0 && r.made_at === '2026-11-26T00:00:00.000Z', JSON.stringify(r));
}

// ---- The database ----
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
// Two published bases under the committed ids (as postgres, the way publish-bases' sheets exist in production).
for (const [name, vid] of [['Zei Leimin', ZEI_BASE], ['Mu', MU_BASE]] as const) {
  const body = JSON.stringify({ title: `${name}, base`, text: `${name}'s sheet text`, samples: [], views: { front: { url: 'https://pictures.example.test/x.jpg', sha256: BASE_FRONT, recipe: {} } }, by_name: 'naaate', by_name_source: null, role: 'maintainer', assist: null, style: null });
  await db.query(`with en as (insert into studio.entities (work_id, kind, name) values ('snowmoon','character',$1) on conflict (work_id, kind, name) do update set name = excluded.name returning id),
    el as (insert into studio.elements (work_id, element_type, entity_id, created_by_fid) select 'snowmoon','design', id, 6786 from en returning id)
    insert into studio.element_versions (id, element_id, version_no, body) select $2::uuid, id, 1, $3::jsonb from el`, [name, vid, body]);
}
const PORT = 54393;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const URL_ = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
const storage = path.join(tmp, 'r2');
const run = (args: string[]) => new Promise<{ status: number | null; out: string }>((resolve) => {
  const p = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['--conditions=react-server', 'scripts/add-starting-points.ts', ...args], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: '', R2_IMAGES_PUBLIC_URL: 'https://pictures.example.test' } });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (status) => resolve({ status, out }));
});
const add = (dir: string, more: string[] = []) => run([`--dir=${dir}`, `--db=${URL_}`, '--set-role=studio_writer', ...more]);
const APPLY = ['--apply', '--confirm-owner-go', `--storage-dir=${storage}`];
const q = async <T>(f: (s: postgres.Sql) => Promise<T>) => { const s = postgres(URL_, { prepare: false, max: 1, onnotice: () => {} }); try { return await f(s); } finally { await s.end(); } };
const counts = () => q(async (s) => JSON.stringify((await s`select (select count(*)::int from studio.elements) as elements, (select count(*)::int from studio.element_versions) as versions, (select count(*)::int from studio.links) as links`)[0]));
const stored = () => { try { return readdirSync(path.join(storage, 'images/readers')).sort(); } catch { return []; } };
const untouched = async (before: string) => (await counts()) === before && stored().length === 0;

const zero = await counts();
const dry = await add(good);
check('dry run: exits 0, plans both pictures, says nothing was written', dry.status === 0 && /Would publish 2; 0 already published\./.test(dry.out) && /Dry run: nothing written, nothing uploaded\./.test(dry.out), dry.out.slice(-1200));
check('dry run: writes nothing to the database or storage', await untouched(zero));
const dryApplyFlags = await add(good, [`--storage-dir=${storage}`]);
check('dry run with --storage-dir (no --apply): still writes nothing', dryApplyFlags.status === 0 && await untouched(zero));
const noGo = await add(good, ['--apply', `--storage-dir=${storage}`]);
check('--apply without --confirm-owner-go is refused, nothing written', noGo.status === 3 && /confirm-owner-go/.test(noGo.out) && await untouched(zero), noGo.out.slice(-400));
const remote = await run([`--dir=${good}`, '--db=postgres://x@db.example.test/postgres', `--storage-dir=${storage}`, '--apply']);
check('--storage-dir with a database that isn\'t local is refused before connecting', remote.status === 2 && /local test database only/.test(remote.out));
const noDir = await run([`--db=${URL_}`]);
check('without --dir it does nothing', noDir.status === 2 && /Usage: --dir=/.test(noDir.out));

const wSha = await add(wrongSha, APPLY);
check('planted: a file whose sha256 isn\'t its recipe\'s is refused, nothing written', wSha.status === 3 && /sha256: the file's is [0-9a-f]{64}, not the one in its recipe/.test(wSha.out) && await untouched(zero), wSha.out.slice(-400));
const wBase = await add(otherBase, APPLY);
check('planted: a base that is another character\'s (Zei\'s base for Mu) is refused, nothing written', wBase.status === 3 && /base: not mu's base in CHALLENGE\.bases/.test(wBase.out) && await untouched(zero), wBase.out.slice(-400));
const wList = await add(notListed, APPLY);
check('planted: a base that is in no character\'s CHALLENGE.bases is refused, nothing written', wList.status === 3 && /base: not zei's base in CHALLENGE\.bases/.test(wList.out) && await untouched(zero), wList.out.slice(-400));
const wModel = await add(badModel, APPLY);
check('planted: a model not on config/models.json is refused, nothing written', wModel.status === 3 && /not on config\/models\.json/.test(wModel.out) && await untouched(zero), wModel.out.slice(-400));
const wDb = await add(notInDb, APPLY);
check('planted: a listed base that isn\'t in the database is refused, nothing written', wDb.status === 3 && /not in this database/.test(wDb.out) && await untouched(zero), wDb.out.slice(-400));
const wMixed = await add(mixed, APPLY);
check('planted: one bad recipe refuses the whole run, the good ones included', wMixed.status === 3 && /r9\.json/.test(wMixed.out) && await untouched(zero), wMixed.out.slice(-400));

const outFile = path.join(tmp, 'added.json');
const go = await add(good, [...APPLY, `--out=${outFile}`]);
check('--apply --confirm-owner-go publishes both, with CHALLENGE.public on', go.status === 0 && (go.out.match(/: published, version /g) ?? []).length === 2 && /done\./.test(go.out), go.out.slice(-1500));
const forks = await q((s) => s`select v.id::text as id, v.body, l.to_version_id::text as base, e.created_by_fid, e.status, en.name from studio.links l
  join studio.element_versions v on v.id = l.from_version_id join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id where l.kind = 'remixed_from' order by en.name desc`);
type Fork = (typeof forks)[number];
const goodFork = (f: Fork, base: string, name: string, original: string) => {
  const v = f.body?.views?.front; const r = v?.recipe; const st = r?.settings;
  const file = v ? path.join(storage, 'images/readers', `${String(v.sha256).slice(0, 32)}.jpg`) : '';
  return f.base === base && f.name === name && Number(f.created_by_fid) === 6786 && f.status === 'published' && f.body.role === 'maintainer'
    && st?.label === MIDJOURNEY_LABEL && r.model === 'midjourney' && st.self_reported === true && r.checks?.prompt?.verdict === 'not run'
    && st.original?.sha256 === original && st.converted?.sha256 === original && st.converted?.jpeg_sha256 === v.sha256 && v.sha256 !== original
    && existsSync(file) && sha(readFileSync(file)) === v.sha256 && /^https:\/\/pictures\.example\.test\/images\/readers\/[0-9a-f]{32}\.jpg$/.test(v.url);
};
const zeiF = forks.find((f) => f.name === 'Zei Leimin');
const muF = forks.find((f) => f.name === 'Mu');
check('Zei\'s: a remix (remixed_from) of Zei\'s base version, by 6786, the label, model midjourney, both sha256s, JPEG stored under its sha256', !!zeiF && goodFork(zeiF, ZEI_BASE, 'Zei Leimin', sha(png)) && zeiF.body.title === 'Zei in the snow' && zeiF.body.text === 'Zei Leimin\'s sheet text', String(JSON.stringify(zeiF?.body)).slice(0, 800));
check('Mu\'s (a JPEG brought in): the same, a remix of Mu\'s base', !!muF && goodFork(muF, MU_BASE, 'Mu', sha(jpg)) && muF.body.views.front.recipe.settings.converted.from === 'image/jpeg', String(JSON.stringify(muF?.body)).slice(0, 800));
// The checker's own planted failures: a fork without the label, or with the original's sha256 changed, must fail it.
check('planted: the check fails a fork whose label is missing', !!zeiF && !goodFork({ ...zeiF, body: { ...zeiF.body, views: { front: { ...zeiF.body.views.front, recipe: { ...zeiF.body.views.front.recipe, settings: { ...zeiF.body.views.front.recipe.settings, label: undefined } } } } } } as Fork, ZEI_BASE, 'Zei Leimin', sha(png)));
check('planted: the check fails a fork whose original sha256 is another', !!zeiF && !goodFork(zeiF, ZEI_BASE, 'Zei Leimin', sha(jpg)));
check('planted: the check fails a fork of the wrong base', !!zeiF && !goodFork(zeiF, MU_BASE, 'Zei Leimin', sha(png)));
const out = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
check('it prints each character\'s new version ids, ready to paste, and --out writes them', !!zeiF && !!muF && go.out.includes(`    zei: ['${zeiF.id}'],`) && go.out.includes(`    mu: ['${muF.id}'],`) && out?.new?.zei?.[0] === zeiF.id && out?.new?.mu?.[0] === muF.id, go.out.slice(-600));
check('the committed CHALLENGE.bases are unchanged by the run (the coordinator adds the ids)', !CHALLENGE.bases.zei.includes(zeiF?.id ?? '') && CHALLENGE.bases.zei[0] === ZEI_BASE);

const before = await counts();
const files2 = stored().length;
const again = await add(good, APPLY);
check('a second --apply skips both by their original sha256 and writes nothing', again.status === 0 && (again.out.match(/SKIP: already published by 6786/g) ?? []).length === 2 && /\(none new\)/.test(again.out) && (await counts()) === before && stored().length === files2, again.out.slice(-600));
const dryAgain = await add(good);
check('a dry run after publishing says both are already published', dryAgain.status === 0 && /Would publish 0; 2 already published\./.test(dryAgain.out));

await server.stop();
await db.close();
rmSync(tmp, { recursive: true, force: true });
console.log(`\ntest:add-starting-points: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  FAIL ${f}`); process.exit(1); }
process.exit(0);
