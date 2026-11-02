/**
 * scripts/seed-designs.ts against a local Postgres (PGlite) with every migration, as studio_writer, with a stand-in
 * for R2 that writes to a temp folder (owner, 2026-11-01). Nothing here touches production or R2.
 *   npm run test:seed-designs
 * Checks: the dry run writes nothing; --apply without --picks and --confirm-owner-go refuses; --apply writes the style
 * (2 samples) and the six "Starting point" sheets, each view's recipe linked to the style's version, files named as
 * putPublic names them; a second --apply changes nothing; the /challenge query counts one sheet each before the window.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const PORT = 54377;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const URL_ = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
const tmp = mkdtempSync(path.join(tmpdir(), 'seed-designs-'));
const storage = path.join(tmp, 'r2');
const picksFile = path.join(tmp, 'picks.json');
// A mix, so every source is exercised: v2 for most, v1 for Bai, the original crop for Seila, one mixed sheet for Mu.
writeFileSync(picksFile, JSON.stringify({ zei: 'v2', bai: 'v1', gladias: 'v2', seila: 'original', deluin: 'v2', mu: { front: 'v2', side: 'v2', back: 'original' } }));

// Async: the test database is served from this process, so the event loop must stay free while the script runs.
const exec = (args: string[], env: NodeJS.ProcessEnv = process.env) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
  const p = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['--conditions=react-server', 'scripts/seed-designs.ts', ...args], { cwd: ROOT, env });
  let stdout = '', stderr = '';
  p.stdout.on('data', (d) => (stdout += d));
  p.stderr.on('data', (d) => (stderr += d));
  p.on('close', (status) => resolve({ status, stdout, stderr }));
});
const run = (...extra: string[]) => exec([`--db=${URL_}`, '--set-role=studio_writer', ...extra], { ...process.env, STUDIO_DATABASE_URL: '' });
const counts = async () => {
  const sql = postgres(URL_, { prepare: false, max: 1, onnotice: () => {} });
  const [r] = await sql`select (select count(*)::int from studio.entities) as entities, (select count(*)::int from studio.elements) as elements, (select count(*)::int from studio.element_versions) as versions`;
  await sql.end();
  return r as { entities: number; elements: number; versions: number };
};
const files = () => { try { return readdirSync(path.join(storage, 'images/readers')).sort(); } catch { return []; } };

const zero = await counts();
const dry = await run(`--picks=${picksFile}`);
check('the dry run exits 0', dry.status === 0, dry.stderr.slice(0, 500));
check('the dry run says it wrote nothing', /Dry run: nothing written, nothing uploaded\./.test(dry.stdout));
check('the dry run writes no rows', JSON.stringify(await counts()) === JSON.stringify(zero));
check('the dry run plans the style and six sheets', /== 1\. Style: Techno vistas ==/.test(dry.stdout) && (dry.stdout.match(/^-- .* picks /gm) ?? []).length === 6);
check('the dry run lists 20 uploads (2 samples, 18 views)', (dry.stdout.match(/images\/readers\/[0-9a-f]{32}\.jpg {2}sha256/g) ?? []).length === 20);
check('the dry run reports the page lines that block a real --apply', /BLOCKS --apply/.test(dry.stdout));

// With every view v2: blocked only while the design page prints fixed lines (fixed on branch design-page-recipe-lines).
const allV2 = path.join(tmp, 'all-v2.json');
writeFileSync(allV2, JSON.stringify({ zei: 'v2', bai: 'v2', gladias: 'v2', seila: 'v2', deluin: 'v2', mu: 'v2' }));
const dryV2 = await run(`--picks=${allV2}`);
const pageReadsRecipes = /howMade\(p\.recipe/.test(read('src/app/references/designs/[id]/page.tsx'));
check(pageReadsRecipes ? 'all-v2 picks: nothing blocks --apply (the page reads each recipe)' : 'all-v2 picks: blocked while the page prints fixed lines', pageReadsRecipes ? !/BLOCKS --apply/.test(dryV2.stdout) : /BLOCKS --apply: 10 lines/.test(dryV2.stdout), dryV2.stdout.slice(-600));
check('all-v2 picks: each front names the original sheet as what it was made from', (dryV2.stdout.match(/"what": "the original starting sheet \(content\/snowmoon\/recipes\/images\/cast\.json#[a-z]+-sheet\)"/g) ?? []).length === 6);
const refused = await run('--apply', `--picks=${picksFile}`);
check('--apply without --confirm-owner-go refuses', refused.status === 2 && /Nothing done/.test(refused.stderr));
const refused2 = await run('--apply', '--confirm-owner-go');
check('--apply without --picks refuses', refused2.status === 2);
const prodStandIn = await exec(['--db=postgres://x@db.example.com:6543/postgres', `--storage-dir=${storage}`]);
check('the stand-in storage refuses a remote database', prodStandIn.status !== 0 && /local test database only/.test(prodStandIn.stderr));

const first = await run('--apply', `--picks=${picksFile}`, '--confirm-owner-go', `--storage-dir=${storage}`);
check('the first --apply exits 0', first.status === 0, (first.stderr || first.stdout).slice(-800));
const one = await counts();
check('it wrote 7 entities, 7 elements, 7 versions', one.entities - zero.entities === 7 && one.elements - zero.elements === 7 && one.versions - zero.versions === 7, JSON.stringify(one));
check('it stored 20 files, named as putPublic names them', files().length === 20 && files().every((f) => /^[0-9a-f]{32}\.jpg$/.test(f)), String(files().length));

const sql = postgres(URL_, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const [st] = await sql`select v.id, v.body, e.created_by_fid, e.status from studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id where en.kind = 'style'`;
check('the style is Techno vistas by 6786, published, maintainer, with its file as source', st.body.title === 'Techno vistas' && Number(st.created_by_fid) === 6786 && st.status === 'published' && st.body.role === 'maintainer' && st.body.assist.source === 'content/snowmoon/designs/styles/techno-vistas.json');
check('the style has its 2 samples, each in storage by its sha256', st.body.samples.length === 2 && st.body.samples.every((s: { sha256: string; url: string }) => files().includes(`${s.sha256.slice(0, 32)}.jpg`) && s.url.endsWith(`${s.sha256.slice(0, 32)}.jpg`)));
const sheets = await sql`select en.name, v.body, v.created_at, e.created_by_fid from studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id where en.kind = 'character' order by en.name`;
check('six sheets, each "Starting point" by 6786', sheets.length === 6 && sheets.every((s) => s.body.title === 'Starting point' && Number(s.created_by_fid) === 6786 && s.body.role === 'maintainer'));
check('every view of every sheet links to the style\'s version', sheets.every((s) => s.body.style.version_id === st.id && ['front', 'side', 'back'].every((k) => s.body.views[k].recipe.style.version_id === st.id)));
check('every stored view file matches its sha256', sheets.every((s) => ['front', 'side', 'back'].every((k) => {
  const f = path.join(storage, 'images/readers', `${s.body.views[k].sha256.slice(0, 32)}.jpg`);
  return execFileSync('shasum', ['-a', '256', f], { encoding: 'utf8' }).slice(0, 64) === s.body.views[k].sha256;
})));
const mu = sheets.find((s) => s.name === 'Mu')!;
check('Mu: the words follow the v2 views (no "sculpted")', !/sculpted/.test(mu.body.text) && mu.body.views.back.recipe.model === 'flux2-klein-4b');
check('the original crop is 432 x 576 and says how it was cut', sheets.find((s) => s.name === 'Seila')!.body.views.side.recipe.settings.derived.startsWith('Cropped from'));
check('each sheet was made before the window opens', sheets.every((s) => new Date(s.created_at) < new Date('2026-11-06T17:00:00Z')));
const chal = await sql`select en.name, count(*)::int as n from (select distinct on (e.id) e.id, e.entity_id from studio.elements e join studio.element_versions v on v.element_id = e.id
  where e.element_type = 'design' and e.status = 'published' and v.created_at < '2026-11-06T17:00:00Z'::timestamptz order by e.id, v.version_no desc) x join studio.entities en on en.id = x.entity_id where en.kind = 'character' group by en.name`;
check('/challenge would list one starting sheet for each of the six', chal.length === 6 && chal.every((r) => r.n === 1));
await sql.end();

const second = await run('--apply', `--picks=${picksFile}`, '--confirm-owner-go', `--storage-dir=${storage}`);
check('a second --apply exits 0', second.status === 0, second.stderr.slice(-500));
check('a second --apply skips the style and all six', /SKIP: already exists/.test(second.stdout) && (second.stdout.match(/SKIP: already exists/g) ?? []).length === 7, second.stdout.slice(0, 400));
check('a second --apply changes no rows', JSON.stringify(await counts()) === JSON.stringify(one));
check('a second --apply stores no new files', files().length === 20);
writeFileSync(path.join(tmp, 'dry.txt'), dry.stdout + dry.stderr);
writeFileSync(path.join(tmp, 'first-apply.txt'), first.stdout);
writeFileSync(path.join(tmp, 'second-apply.txt'), second.stdout);

await server.stop();
await db.close();
console.log(`test:seed-designs: ${passed} passed, ${failures.length} failed (outputs in ${tmp})`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
