/**
 * scripts/publish-bases.ts and `scripts/import-first-remixes.ts --launch` against PGlite (every migration, served on a
 * local socket, written as studio_writer), with a stand-in for R2 that writes to a temp folder, reading the real drafts
 * (branch challenge-styles' docs/starting-sheet-drafts, read only). No production, no R2, no network, no model.
 *
 *   npm run test:launch-publish        (DRAFTS=<dir> to point at the drafts; default the challenge-styles worktree)
 *
 * Written by the coding agent (Claude, a closed model by Anthropic), lane B, 2026-11-05 night.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { CHALLENGE } from '../src/lib/config';
import { MIDJOURNEY_LABEL, applyGate, descriptor, pinned, planBase, readLedger, readPicks, sha } from './lib/launch-publish';

const ROOT = path.resolve(import.meta.dirname, '..');
const DRAFTS = process.env.DRAFTS || '/Users/nathan/snowmoon-challenge-styles/docs/starting-sheet-drafts';
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${String(detail).slice(0, 600)}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
if (!existsSync(path.join(DRAFTS, 'directions/ledger.json'))) {
  console.log(`test:launch-publish: the drafts aren't at ${DRAFTS} (branch challenge-styles). Set DRAFTS=<dir>.`);
  process.exit(1);
}

// ---- The pure part ----
const picks = readPicks(path.join(ROOT, 'scripts/lib/launch-picks.json'));
const ledger = readLedger(DRAFTS);
const plans = picks.bases.map((b) => planBase(DRAFTS, ledger, b, 'naaate'));
check('ten bases: one each for Zei, Bai, Seila and Mu, three each for Deluin and Gladias', JSON.stringify(Object.fromEntries(['zei', 'gladias', 'bai', 'seila', 'deluin', 'mu'].map((c) => [c, picks.bases.filter((b) => b.character === c).length]))) === JSON.stringify({ zei: 1, gladias: 3, bai: 1, seila: 1, deluin: 3, mu: 1 }));
check('one current default per character', ['zei', 'gladias', 'bai', 'seila', 'deluin', 'mu'].every((c) => picks.bases.filter((b) => b.character === c && b.current_default).length === 1));
check('every base plans with no problem (files match their pinned sha256, recipes complete, text within 600)', plans.every((p) => p.problems.length === 0), plans.flatMap((p) => p.problems.map((x) => `${p.pick.key}: ${x}`)).join('; '));
check('Bai\'s base is her front made from Garance\'s edit, alone, crediting Garance', (() => { const b = plans.find((p) => p.pick.key === 'bai')!; return b.pics.length === 1 && b.pics[0].file.endsWith('bai-animated-gpt-garance.jpg') && (b.pics[0].recipe.credit ?? []).some((c) => /Garance/.test(c)) && b.missing.join() === 'side,back'; })());
check('the others have front, side and back made from that same front', plans.filter((p) => p.pick.key !== 'bai').every((p) => p.pics.length === 3 && p.pics.filter((x) => x.slot !== 'front').every((x) => (x.recipe.references ?? []).some((r) => r.sha256 === p.pick.views.front!.sha256))));
check('every view names its closed model and maker on the list (gpt-image-2.5-sunburst or gemini-3.1-flash-image)', plans.every((p) => p.pics.every((x) => ['gpt-image-2.5-sunburst', 'gemini-3.1-flash-image'].includes(x.recipe.model))));
check('every front names its brought-in reference (the owner\'s Midjourney picture or Garance\'s edit) or the front it came from', plans.every((p) => (p.pics.find((x) => x.slot === 'front')!.recipe.references ?? []).every((r) => /Brought in|front|reference|Midjourney|look/i.test(r.what ?? ''))));
check('no base links to an unpublished style: body.style is null, and each view says its style isn\'t published', plans.every((p) => p.body({}).style === null && p.pics.every((x) => !x.recipe.style || /^not published/.test(x.recipe.style.version_id))));
check('the sheet\'s text is the front\'s descriptor', descriptor('The same person.\n\nAnimated series look: x.\n\na young man, tall\n\nNo text.') === 'a young man, tall');
check('applyGate: a dry run is never refused', applyGate({ apply: false, confirmed: false, isPublic: true, refusals: ['x'] }).length === 0);
check('applyGate: --apply without --confirm-owner-go is refused', applyGate({ apply: true, confirmed: false, isPublic: false, refusals: [] }).some((x) => /confirm-owner-go/.test(x)));
check('applyGate: --apply while CHALLENGE.public is on is refused (it follows public, not the open date)', applyGate({ apply: true, confirmed: true, isPublic: true, refusals: [] }).some((x) => /CHALLENGE\.public is on/.test(x)));
check('applyGate: a closed-model refusal is kept', applyGate({ apply: true, confirmed: true, isPublic: false, refusals: ['zei: closed'] }).includes('zei: closed'));
check('applyGate: all clear passes', applyGate({ apply: true, confirmed: true, isPublic: false, refusals: [] }).length === 0);

// A tampered drafts folder (planted): every file linked, one front changed by a byte.
const tmp = mkdtempSync(path.join(tmpdir(), 'launch-publish-'));
const bad = path.join(tmp, 'drafts-tampered');
for (const sub of ['directions', 'first-remixes']) {
  mkdirSync(path.join(bad, sub), { recursive: true });
  for (const f of readdirSync(path.join(DRAFTS, sub))) symlinkSync(path.join(DRAFTS, sub, f), path.join(bad, sub, f));
}
const victim = picks.bases.find((b) => b.key === 'zei')!.views.front!.file;
const tampered = Buffer.from(readFileSync(path.join(DRAFTS, victim)));
tampered[tampered.length - 3] ^= 1;
const victimPath = path.join(bad, victim);
(await import('node:fs')).unlinkSync(victimPath);
writeFileSync(victimPath, tampered);
let threw = '';
try { pinned(bad, picks.bases.find((b) => b.key === 'zei')!.views.front!); } catch (e) { threw = (e as Error).message; }
check('planted: a changed file is refused by its pinned sha256', /not the pinned/.test(threw), threw);

// ---- The database ----
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
// 0037–0039 (numbered 2026-11-06) are among the numbered migrations above.
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const PORT = 54391;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const URL_ = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
const storage = path.join(tmp, 'r2');
const exec = (script: string[], args: string[], env: Record<string, string> = {}) => new Promise<{ status: number | null; out: string }>((resolve) => {
  const p = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['--conditions=react-server', ...script, ...args], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: '', R2_IMAGES_PUBLIC_URL: 'https://pictures.example.test', ...env } });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (status) => resolve({ status, out }));
});
const bases = (args: string[], env: Record<string, string> = {}) => exec(['scripts/publish-bases.ts'], [`--db=${URL_}`, '--set-role=studio_writer', `--drafts=${DRAFTS}`, ...args], env);
const remixes = (args: string[], env: Record<string, string> = {}) => exec(['scripts/import-first-remixes.ts', '--launch'], [`--db=${URL_}`, '--set-role=studio_writer', `--drafts=${DRAFTS}`, ...args], env);
const q = async <T>(f: (s: postgres.Sql) => Promise<T>) => { const s = postgres(URL_, { prepare: false, max: 1, onnotice: () => {} }); try { return await f(s); } finally { await s.end(); } };
const counts = () => q(async (s) => (await s`select (select count(*)::int from studio.elements) as elements, (select count(*)::int from studio.element_versions) as versions, (select count(*)::int from studio.links) as links`)[0] as { elements: number; versions: number; links: number });
const files = () => { try { return readdirSync(path.join(storage, 'images/readers')).sort(); } catch { return []; } };
const OPEN = JSON.stringify({ public: false, closedBasesAllowed: true });

const zero = await counts();
const dry = await bases([]);
check('publish-bases: the dry run exits 0 and says nothing was written', dry.status === 0 && /Dry run: nothing written, nothing uploaded\./.test(dry.out), dry.out.slice(-800));
check('publish-bases: the dry run lists the ten bases and 28 uploads', (dry.out.match(/^-- /gm) ?? []).length === 10 && (dry.out.match(/images\/readers\/[0-9a-f]{32}\.jpg {2}sha256/g) ?? []).length === 28, String((dry.out.match(/images\/readers\/[0-9a-f]{32}\.jpg {2}sha256/g) ?? []).length));
check('publish-bases: the dry run says Bai\'s side and back are missing, and why', /missing: side, back \(side and back: the drafts that exist/.test(dry.out));
check('publish-bases: the dry run writes nothing', JSON.stringify(await counts()) === JSON.stringify(zero));
check('publish-bases: with the committed switches (closed-model bases allowed for the launch), the dry run refuses none', CHALLENGE.closedBasesAllowed === true && !/REFUSED while it stands/.test(dry.out));
const noGo = await bases(['--apply', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: OPEN });
check('publish-bases: --apply without --confirm-owner-go is refused, nothing written', noGo.status !== 0 && /confirm-owner-go/.test(noGo.out) && JSON.stringify(await counts()) === JSON.stringify(zero) && files().length === 0, noGo.out.slice(-400));
// CHALLENGE.closedBasesAllowed is on as committed for the launch (2026-11-05); the switch is still proven by forcing it off.
const closed = await bases(['--apply', '--confirm-owner-go', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: false, closedBasesAllowed: false }) });
check('publish-bases: --apply with CHALLENGE.closedBasesAllowed off is refused, nothing written', closed.status !== 0 && /closedBasesAllowed/.test(closed.out) && JSON.stringify(await counts()) === JSON.stringify(zero) && files().length === 0, closed.out.slice(-400));
const pub = await bases(['--apply', '--confirm-owner-go', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: true, closedBasesAllowed: true }) });
check('publish-bases: --apply while CHALLENGE.public is on is refused, nothing written', pub.status !== 0 && /CHALLENGE\.public is on/.test(pub.out) && JSON.stringify(await counts()) === JSON.stringify(zero), pub.out.slice(-400));
const tamp = await bases(['--apply', '--confirm-owner-go', `--storage-dir=${storage}`, `--drafts=${bad}`], { LAUNCH_PUBLISH_TEST_CONFIG: OPEN });
check('publish-bases planted: a tampered front refuses the whole run, nothing written', tamp.status !== 0 && /not the pinned/.test(tamp.out) && JSON.stringify(await counts()) === JSON.stringify(zero) && files().length === 0, tamp.out.slice(-400));
const remote = await exec(['scripts/publish-bases.ts'], ['--db=postgres://x@db.example.test/postgres', `--storage-dir=${storage}`, '--apply']);
check('publish-bases: --storage-dir with a database that isn\'t local is refused before connecting', remote.status === 2 && /local test database only/.test(remote.out));

const outFile = path.join(tmp, 'bases.json');
const go = await bases(['--apply', '--confirm-owner-go', `--storage-dir=${storage}`, `--out=${outFile}`], { LAUNCH_PUBLISH_TEST_CONFIG: OPEN });
check('publish-bases: --apply (switches as the launch PR has them) publishes', go.status === 0 && /done\./.test(go.out), go.out.slice(-1200));
const rows = await q((s) => s`select v.id::text as id, v.body, e.created_by_fid, e.status, en.name, en.kind from studio.elements e join studio.element_versions v on v.element_id = e.id join studio.entities en on en.id = e.entity_id where e.element_type = 'design' order by v.created_at`);
check('ten published character sheets by FID 6786, role maintainer, byline naaate', rows.length === 10 && rows.every((r) => Number(r.created_by_fid) === 6786 && r.status === 'published' && r.kind === 'character' && r.body.role === 'maintainer' && r.body.by_name === 'naaate'));
const byName = rows.reduce<Map<string, number>>((m, r) => m.set(String(r.name), (m.get(String(r.name)) ?? 0) + 1), new Map<string, number>());
check('six characters: one sheet each for four, three each for two', byName.size === 6 && JSON.stringify([...byName.values()].sort()) === JSON.stringify([1, 1, 1, 1, 3, 3]), JSON.stringify([...byName]));
const stored = files();
check('28 pictures in the stand-in storage, named as putPublic names them, each file\'s bytes matching its sha256', stored.length === 28 && rows.every((r) => Object.values(r.body.views as Record<string, { sha256: string }>).every((v) => { const f = path.join(storage, 'images/readers', `${v.sha256.slice(0, 32)}.jpg`); return existsSync(f) && sha(readFileSync(f)) === v.sha256; })), String(stored.length));
const published = JSON.parse(readFileSync(outFile, 'utf8')).bases as Record<string, { versionId: string; character: string }>;
check('--out names every base\'s version id', Object.keys(published).length === 10 && Object.values(published).every((v) => rows.some((r) => r.id === v.versionId)));
check('it prints CHALLENGE.bases with the current default first', new RegExp(`deluin: \\['${published['deluin:b'].versionId}', `).test(go.out) && new RegExp(`gladias: \\['${published['gladias:b'].versionId}', `).test(go.out), go.out.slice(-900));
const before2 = await counts();
const again = await bases(['--apply', '--confirm-owner-go', `--storage-dir=${storage}`, `--out=${outFile}`], { LAUNCH_PUBLISH_TEST_CONFIG: OPEN });
check('publish-bases: a second --apply skips all ten and writes nothing', again.status === 0 && (again.out.match(/exists, skipped/g) ?? []).length === 10 && JSON.stringify(await counts()) === JSON.stringify(before2) && files().length === 28, again.out.slice(-600));

// ---- First remixes ----
const confirmedPicks = path.join(tmp, 'picks-confirmed.json');
writeFileSync(confirmedPicks, JSON.stringify({ ...picks, first_remixes: picks.first_remixes.map((r) => ({ ...r, owner_confirmed: true })) }, null, 1));
const rDry = await remixes([`--bases=${outFile}`]);
check('first remixes: the dry run exits 0, writes nothing, and plans ten', rDry.status === 0 && /Dry run: nothing written/.test(rDry.out) && (rDry.out.match(/^-- first-remixes\//gm) ?? []).length === 10 && JSON.stringify(await counts()) === JSON.stringify(before2), rDry.out.slice(-600));
check('first remixes: the dry run says each base is confirmed by the owner (2026-11-06)', (rDry.out.match(/^-- first-remixes\/[^\n]*\(confirmed by the owner\)/gm) ?? []).length === 10);
check('first remixes: Midjourney is on the model list now (closed, by Midjourney), so the dry run raises no model refusal', !/Midjourney is not on config\/models\.json/.test(rDry.out));
// The owner confirmed every base (2026-11-06), so the committed picks are confirmed; the refusal is proven on a copy
// with the confirmations taken out.
const unconfirmedPicks = path.join(tmp, 'picks-unconfirmed.json');
writeFileSync(unconfirmedPicks, JSON.stringify({ ...picks, first_remixes: picks.first_remixes.map((r) => ({ ...r, owner_confirmed: false })) }, null, 1));
const rUnconf = await remixes([`--bases=${outFile}`, `--picks=${unconfirmedPicks}`, '--apply', '--confirm-owner-go', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: false, midjourneyListed: true }) });
check('first remixes: --apply with unconfirmed bases is refused, nothing written', rUnconf.status !== 0 && JSON.stringify(await counts()) === JSON.stringify(before2), rUnconf.out.slice(-400));
const rNoMj = await remixes([`--bases=${outFile}`, `--picks=${confirmedPicks}`, '--apply', '--confirm-owner-go', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: false, midjourneyListed: false }) });
check('first remixes: --apply while Midjourney is not on the model list is refused, nothing written', rNoMj.status !== 0 && /Midjourney is not on config/.test(rNoMj.out) && JSON.stringify(await counts()) === JSON.stringify(before2), rNoMj.out.slice(-400));
const rPub = await remixes([`--bases=${outFile}`, `--picks=${confirmedPicks}`, '--apply', '--confirm-owner-go', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: true, midjourneyListed: true }) });
check('first remixes: --apply while CHALLENGE.public is on is refused', rPub.status !== 0 && /CHALLENGE\.public is on/.test(rPub.out) && JSON.stringify(await counts()) === JSON.stringify(before2));
const wrongBases = path.join(tmp, 'bases-wrong.json');
writeFileSync(wrongBases, JSON.stringify({ bases: { ...published, mu: { ...published.mu, versionId: published.zei.versionId } } }));
const rWrong = await remixes([`--bases=${wrongBases}`, `--picks=${confirmedPicks}`, '--apply', '--confirm-owner-go', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: false, midjourneyListed: true }) });
check('first remixes planted: a base id that is another character\'s sheet is refused, nothing written', rWrong.status !== 0 && /is Zei's sheet|not the pinned picture/.test(rWrong.out) && JSON.stringify(await counts()) === JSON.stringify(before2), rWrong.out.slice(-400));
const rOut = path.join(tmp, 'remixes.json');
const rGo = await remixes([`--bases=${outFile}`, `--picks=${confirmedPicks}`, '--apply', '--confirm-owner-go', `--storage-dir=${storage}`, `--out=${rOut}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: false, midjourneyListed: true }) });
check('first remixes: --apply publishes ten', rGo.status === 0 && Object.keys(JSON.parse(readFileSync(rOut, 'utf8')).first_remixes).length === 10, rGo.out.slice(-1200));
const forks = await q((s) => s`select v.id::text as id, v.body, l.to_version_id::text as base, e.created_by_fid, en.name from studio.links l join studio.element_versions v on v.id = l.from_version_id join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id where l.kind = 'remixed_from'`);
check('each is a remix (remixed_from) of its base\'s version, by 6786, on the base\'s character', forks.length === 10 && forks.every((f) => { const p = picks.first_remixes.find((x) => x.sha256 === f.body.views.front.recipe.settings.original.sha256)!; return p && published[p.base].versionId === f.base && Number(f.created_by_fid) === 6786; }));
check('each front carries the approved Midjourney label, the job id, the parameters, model midjourney, self-reported, checks not run', forks.every((f) => { const r = f.body.views.front.recipe; return r.settings.label === MIDJOURNEY_LABEL && r.model === 'midjourney' && r.request_id && r.settings.parameters && r.settings.self_reported === true && r.checks.prompt.verdict === 'not run'; }));
check('each front\'s references name the owner\'s own picture or profiles', forks.every((f) => { const rr = f.body.views.front.recipe.settings.references_reported; return [...rr.style_references, ...rr.profiles].length > 0 && [...rr.style_references, ...rr.profiles].every((x: { what: string }) => /owner's own/.test(x.what)); }));
check('each front is the JPEG of the pinned PNG, stored under its own sha256', forks.every((f) => { const v = f.body.views.front; const file = path.join(storage, 'images/readers', `${v.sha256.slice(0, 32)}.jpg`); return existsSync(file) && sha(readFileSync(file)) === v.sha256 && v.recipe.settings.converted.sha256 === v.recipe.settings.original.sha256; }));
const before3 = await counts();
const rAgain = await remixes([`--bases=${outFile}`, `--picks=${confirmedPicks}`, '--apply', '--confirm-owner-go', `--storage-dir=${storage}`], { LAUNCH_PUBLISH_TEST_CONFIG: JSON.stringify({ public: false, midjourneyListed: true }) });
check('first remixes: a second --apply skips all ten and writes nothing', rAgain.status === 0 && JSON.stringify(await counts()) === JSON.stringify(before3), rAgain.out.slice(-400));
const oldDir = await exec(['scripts/import-first-remixes.ts'], ['--apply']);
check('import-first-remixes without --launch still refuses --apply', oldDir.status === 1 && /only with --launch/.test(oldDir.out));

await server.stop();
await db.close();
console.log(`\ntest:launch-publish: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  FAIL ${f}`); process.exit(1); }
process.exit(0);
