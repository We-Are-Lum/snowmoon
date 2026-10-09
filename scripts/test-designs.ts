/**
 * Styles, character sheets, forks and picks (step 4, docs/proposals/style-guides-and-sheets.md).
 * Fails (exit 1) on any problem. No paid call is made: nothing here reaches fal.ai or Groq.
 *
 *   npm run test:designs        (also run by npm run test:images)
 *
 * Runs every migration in an in-memory Postgres (PGlite), as studio_writer. Checks:
 * - making a style, a sheet for a book character, a fork ("remixed from", for good) and a new
 *   version; only the maker adds versions; style names can't collide (any case);
 * - "built on" counts published images with a 'uses' link to any version, never hidden ones;
 *   the two orders (newest, most built on) and their labels;
 * - picks: only ever the signed-in person's own; one per style or character; never readable by the
 *   public roles; no code outside the picks route, the composer's status and Generate reads them,
 *   and nothing counts them;
 * - the caps: a reference-picture (edit) call is counted and reserved like any Generate, with its
 *   own worst case, and refused past the day's limit or the spend caps;
 * - a sample's signed record is not an image's, and the reverse;
 * - report and hide: a design's files are all moved; reported designs reach the moderator queue;
 *   Dismiss never makes anything public; a hidden design leaves every public read and the composer.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
}

// --- Pure rules ------------------------------------------------------------------
const { wordDiff, mentions, samplePrompt, SAMPLE_SUBJECTS } = await import('../src/lib/images/design-rules');
const diff = wordDiff('Flat paper-cut layers, muted greens, no outlines', 'Flat paper-cut layers, deep blue and silver, no outlines');
check('a fork shades only its own words', diff.filter((d) => d.changed).map((d) => d.text).join('|') === 'deep blue and silver,', JSON.stringify(diff));
check('unchanged text has nothing shaded', wordDiff('a b c', 'a b c').every((d) => !d.changed));
check('a passage names a character by a word of their name', mentions('Zei looked up.', 'Zei Leimin') && mentions('said General Lektor', 'General Lektor'));
check('only whole words, case kept', !mentions('the minute', 'Min') && !mentions('Zeitgeist', 'Zei Leimin'));
check('a sample prompt is subject, text, no-words line', samplePrompt(SAMPLE_SUBJECTS[0], 'Thin washes.') === `${SAMPLE_SUBJECTS[0]}\n\nThin washes.\n\n${IMAGES.suffix}`);
const { finalPrompt } = await import('../src/lib/images/rules');
check('sheets come after the style, before the no-words line', finalPrompt('A path', 'STYLE', ['SHEET']) === `A path\n\nSTYLE\n\nSHEET\n\n${IMAGES.suffix}`);
check('an image with no picks keeps the same prompt as before', finalPrompt('A path', null) === `A path\n\n${IMAGES.suffix}`);

// --- Signed records: a sample's is not an image's ----------------------------------
process.env.IMAGES_TICKET_SECRET = 'z'.repeat(40);
const { signTicket, readTicket, signSampleTicket, readSampleTicket } = await import('../src/lib/images/ticket');
const at = new Date().toISOString();
const sample = signSampleTicket({ v: 1, kind: 'design-sample', fid: 6786, slot: 'sample', text: 't', subject: 's', prompt: 'p', model: 'm', endpoint: 'e', host: 'fal.ai', settings: {}, seed: 1, requestId: null, sha256: 'a'.repeat(64), width: 1024, height: 576, costUsd: 0.003, guard: { model: 'g', verdict: 'ok' }, at });
check('a sample record reads back', readSampleTicket(sample)?.slot === 'sample');
check('a sample record is not an image draft', readTicket(sample) === null);
const image = signTicket({ v: 1, fid: 6786, chapter: 1, start: 1, end: 1, userPrompt: 'u', style: null, prompt: 'p', model: 'm', endpoint: 'e', host: 'h', settings: {}, seed: 1, requestId: null, sha256: 'b'.repeat(64), width: 1024, height: 576, costUsd: 0.003, guard: { model: 'g', verdict: 'ok' }, at });
check('an image draft is not a sample record', readSampleTicket(image) === null && readTicket(image)?.fid === 6786);

// --- The database --------------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const PORT = 54333;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1 });
await sql`set role studio_writer`;
const D = await import('../src/lib/images/designs');
type Sql = Parameters<typeof D.listDesigns>[0];
const S = sql as unknown as Sql;
const pic = (n: number) => ({ url: `https://pictures.example/${n}.jpg`, sha256: String(n).repeat(64).slice(0, 64), recipe: { prompt: 'p', model: 'z-image-turbo', endpoint: 'fal-ai/z-image/turbo', host: 'fal.ai', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.003, made_at: at, width: 1024, height: 576, checks: { prompt: { model: 'g', verdict: 'ok' as const }, host_safety_checker: 'passed' as const }, assist: null } });
const body = (title: string, text: string, n = 1) => ({ title, text, samples: [pic(n), pic(n + 1)], views: {}, by_name: 'tovah', by_name_source: 'relay' as const, assist: null });

const a = await D.makeDesign(S, { fid: 100, mode: 'create', kind: 'style', styleName: 'Kalimar paper', body: body('Kalimar paper', 'Flat paper-cut layers, muted greens, no outlines') });
check('a new style is published', (await D.designByVersion(S, a.versionId))?.title === 'Kalimar paper');
let refused = '';
try {
  await D.makeDesign(S, { fid: 101, mode: 'create', kind: 'style', styleName: 'KALIMAR PAPER', body: body('KALIMAR PAPER', 'x') });
} catch (e) {
  refused = e instanceof D.MakeRefused ? String(e.status) : 'other';
}
check('a style name is taken in any case', refused === '409', refused);
const fork = await D.makeDesign(S, { fid: 200, mode: 'fork', kind: 'style', fromVersionId: a.versionId, body: body('Kalimar paper, night', 'Flat paper-cut layers, deep blue and silver, no outlines', 3) });
const fp = await D.designByVersion(S, fork.versionId);
check('a fork is a new design on the same style', fp?.entityId === (await D.designByVersion(S, a.versionId))?.entityId && fp?.elementId !== a.elementId);
check('a fork carries "remixed from" its source version', fp?.remixedFrom?.versionId === a.versionId, JSON.stringify(fp?.remixedFrom));
const [link] = await sql`select kind from studio.links where from_version_id = ${fork.versionId} and to_version_id = ${a.versionId}`;
check('the credit is a remixed_from link', link?.kind === 'remixed_from');
let changed = true;
try {
  await sql`delete from studio.links where from_version_id = ${fork.versionId}`;
} catch {
  changed = false;
}
check('the credit can\'t be removed (links are append-only)', !changed);
refused = '';
try {
  await D.makeDesign(S, { fid: 999, mode: 'version', kind: 'style', fromVersionId: a.versionId, body: body('x', 'y') });
} catch (e) {
  refused = e instanceof D.MakeRefused ? String(e.status) : 'other';
}
check('only the maker adds a version', refused === '403', refused);
const a2 = await D.makeDesign(S, { fid: 100, mode: 'version', kind: 'style', fromVersionId: a.versionId, body: body('Kalimar paper', 'Flat paper-cut layers, muted greens, warmer evening light, no outlines', 5) });
const p2 = await D.designByVersion(S, a2.versionId);
check('a new version is v2 of the same design', p2?.shown.versionNo === 2 && p2.elementId === a.elementId && p2.history.length === 2);
const v1page = await D.designByVersion(S, a.versionId);
check('an old version still has its own page', v1page?.shown.versionNo === 1 && v1page.versionNo === 2);
check('designs published today are counted for the daily cap', (await D.designPublishesToday(S, 100)) === 2);

// Sheets: only the book's characters; the entity is made once.
const zei = D.bookCharacter('zei')!;
check('the book\'s characters are listed', D.bookCharacters().length >= 20 && zei.name === 'Zei Leimin');
const s1 = await D.makeDesign(S, { fid: 300, mode: 'create', kind: 'character', character: zei, body: { ...body('', 'Eighteen, slight, short dark hair'), samples: [], views: { front: pic(7) } } });
const s2 = await D.makeDesign(S, { fid: 301, mode: 'create', kind: 'character', character: zei, body: { ...body('', 'Tall, quick hands'), samples: [], views: { front: pic(8) } } });
const ents = await sql`select count(*)::int as n from studio.entities where kind = 'character' and name = 'Zei Leimin'`;
check('a character\'s entity is made once', ents[0].n === 1);
check('both sheets list under the character', (await D.listDesigns(S, 'character', 'new', (await D.characterEntity(S, zei))!)).length === 2);
check('sheet counts are of published sheets', (await D.sheetCounts(S)).get('Zei Leimin') === 2);
check('a covered character knows its first chapter', zei.firstChapter === Math.min(...zei.quotes.map((q) => q.chapter)));

// Built on: published images with 'uses' links to any version.
async function imageUsing(uses: string[], status = 'published') {
  const [el] = await sql`insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', 5, ${status}) returning id`;
  const [v] = await sql`insert into studio.element_versions (element_id, version_no, body) values (${el.id}, 1, '{"lettering":[]}') returning id`;
  await sql`insert into studio.anchors (version_id, work_id, chapter, start_idx, end_idx) values (${v.id}, 'snowmoon', 1, 2, 3)`;
  for (const u of uses) await sql`insert into studio.links (from_version_id, to_version_id, kind) values (${v.id}, ${u}, 'uses')`;
  return String(v.id);
}
await imageUsing([a.versionId]);
await imageUsing([a2.versionId]);
await imageUsing([a.versionId, s1.versionId]);
await imageUsing([a.versionId], 'hidden');
await imageUsing([fork.versionId]);
const styles = await D.listDesigns(S, 'style', 'built');
check('built on counts published images that used any version', styles.find((s) => s.elementId === a.elementId)?.builtOn === 3, JSON.stringify(styles.map((s) => [s.title, s.builtOn])));
check('a hidden image is not counted', styles.find((s) => s.elementId === fork.elementId)?.builtOn === 1);
const hist = (await D.designByVersion(S, a2.versionId))!.history.map((h) => `v${h.versionNo}:${h.builtOn}`).join(' ');
check('per-version counts, newest first', hist === 'v2:1 v1:2', hist);
check('"most built on" puts the most used first', styles[0].elementId === a.elementId);
const newest = await D.listDesigns(S, 'style', 'new');
check('"newest" orders by the latest version', newest[0].elementId === a.elementId && newest[1].elementId === fork.elementId, newest.map((s) => s.title).join(', '));
check('a sheet built on counts too', (await D.listDesigns(S, 'character', 'built'))[0].versionId === s1.versionId);

// Picks: private.
await D.setPick(S, 42, a.versionId);
await D.setPick(S, 42, s1.versionId);
await D.setPick(S, 43, fork.versionId);
const mine = await D.myPicks(S, 42);
check('my picks are mine only', mine.length === 2 && mine.every((p) => [a.versionId, s1.versionId].includes(p.versionId)));
check('someone else\'s picks are theirs only', (await D.myPicks(S, 43)).map((p) => p.versionId).join() === fork.versionId);
check('a pick is kept at its version; a newer one is offered, not applied', mine.find((p) => p.kind === 'style')?.versionNo === 1 && mine.find((p) => p.kind === 'style')?.newer?.versionNo === 2);
await D.setPick(S, 43, a.versionId);
check('one pick per style: picking another version of it replaces it', (await D.myPicks(S, 43)).length === 1 && (await D.myPicks(S, 43))[0].versionId === a.versionId);
await D.setPick(S, 42, a2.versionId);
check('switching to the newer version', (await D.myPicks(S, 42)).find((p) => p.kind === 'style')?.versionNo === 2);
// Several styles picked: the composer offers the one picked most recently.
const other = await D.makeDesign(S, { fid: 400, mode: 'create', kind: 'style', styleName: 'Meldan at dusk', body: body('Meldan at dusk', 'Low sun, long blue shadows', 9) });
await new Promise((r) => setTimeout(r, 10));
await D.setPick(S, 42, other.versionId);
check('with several styles picked, the newest pick is offered', D.composerPicks(await D.myPicks(S, 42)).style?.versionId === other.versionId);
check('picked characters are offered', D.composerPicks(await D.myPicks(S, 42)).characters.map((c) => c.versionId).join() === s1.versionId);
await D.clearPick(S, 42, (await D.myPicks(S, 42)).find((p) => p.versionId === other.versionId)!.entityId);
check('clearing a pick', !(await D.myPicks(S, 42)).some((p) => p.versionId === other.versionId));
check('a pick must be a published design', (await D.setPick(S, 42, '00000000-0000-0000-0000-000000000000')) === null);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  try {
    const r = await db.query<{ n: number }>('select count(*)::int as n from studio.picks');
    failures.push(`${role} can read studio.picks (${r.rows[0].n} rows)`);
  } catch {
    passed++;
  }
  await db.exec('reset role');
}
// Nothing outside the picks route, the composer's status and Generate reads picks; nothing counts them.
const src = walk('src').map((f) => ({ f, t: read(f) }));
const readsPicks = src.filter(({ t }) => /studio\.picks|myPicks\(|setPick\(|clearPick\(/.test(t)).map(({ f }) => f).sort();
const allowed = ['src/app/api/designs/picks/route.ts', 'src/app/api/images/generate/route.ts', 'src/app/api/images/status/route.ts', 'src/lib/images/designs.ts'];
check('only the picks route, the status and Generate read picks', JSON.stringify(readsPicks) === JSON.stringify(allowed), readsPicks.join(', '));
for (const f of allowed.filter((f) => f.includes('/api/'))) check(`${f} reads picks only for the signed-in FID`, /getFid\(request\)/.test(read(f)) && !/myPicks\(\w+, (?!w\.fid|fid)/.test(read(f)));
const dsrc = read('src/lib/images/designs.ts');
check('the picks queries always filter to one FID', [...dsrc.matchAll(/from studio\.picks[\s\S]{0,400}?where.{0,40}/g)].every((m) => /p\.fid = \$\{fid\}|fid = \$\{fid\}/.test(m[0])) && /delete from studio\.picks where fid = \$\{fid\}/.test(dsrc));
check('nothing counts picks', !/count\([^)]*\)[^;]{0,200}studio\.picks/.test(dsrc) && !src.some(({ t }) => /picks?_count|pickCount|count\(.{0,40}pick/i.test(t)));
const publicSql = dsrc.slice(dsrc.indexOf('const BUILT_ON'), dsrc.indexOf('// Picks: private'));
check('no public query touches picks', !/picks/.test(publicSql.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

// The order is always named.
const idx = read('src/components/design-index.tsx');
check('the index names both orders', /W\.index\.newest/.test(idx) && /W\.index\.built/.test(idx) && /aria-label=\{sort === 'built' \? W\.index\.built : W\.index\.newest\}/.test(idx));
const { IMAGE_WORDING } = await import('../src/lib/images/wording');
check('the order labels say what they are', IMAGE_WORDING.designs.index.newest === 'Newest first' && IMAGE_WORDING.designs.index.built === 'Most built on');
const MARK = /\b(canon|canonical|official|featured|pinned|editor'?s pick|staff pick)\b/i;
const designFiles = src.filter(({ f }) => /design|my-picks|images\/picks/.test(f));
check('nothing official, featured or pinned on the new screens', designFiles.every(({ t }) => !MARK.test(t.replace(/Nothing here is official\./g, '').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))), designFiles.filter(({ t }) => MARK.test(t.replace(/Nothing here is official\./g, '').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).map(({ f }) => f).join(', '));

// The caps: an edit call is counted and reserved like any Generate, with its own worst case.
const { reserve, settle, generationsLeft } = await import('../src/lib/images/limits');
const edit = { model: IMAGES.editModel, reserveUsd: IMAGES.editReserveUsd(3) };
const r1 = await reserve(S, 7000, edit);
check('an edit call is counted', r1.ok && (await generationsLeft(S, 7000)) === IMAGES.generationsPerDay - 1);
const [res] = await sql`select calls, cost_usd::float8 as usd from studio.image_costs where kind = 'reserved' and model = ${IMAGES.editModel.id}`;
check('its worst case is reserved under the edit model', res?.calls === 1 && Math.abs(res.usd - IMAGES.editReserveUsd(3)) < 1e-9, JSON.stringify(res));
check('the edit worst case counts every input picture', Math.abs(IMAGES.editReserveUsd(3) - (4 * IMAGES.editPricePerMp + 0.0015)) < 1e-9);
await settle(S, { guard: { costUsd: 0.0002, provider: 'groq', verdict: 'ok' }, image: { costUsd: 0.0118, verdict: 'ok' } }, edit);
const [after] = await sql`select (select cost_usd::float8 from studio.image_costs where kind = 'reserved' and model = ${IMAGES.editModel.id}) as reserved,
  (select cost_usd::float8 from studio.image_costs where kind = 'image' and model = ${IMAGES.editModel.id}) as spent`;
check('settling an edit takes its reservation back and records its cost', Math.abs(after.reserved) < 1e-9 && Math.abs(after.spent - 0.0118) < 1e-9, JSON.stringify(after));
// The blocked-names list stops a paid call before any model, and the reservation is returned.
const { paidPicture } = await import('../src/lib/images/paid');
let made = 0;
const blocked = await paidPicture(S, 7000, new Request('http://x'), { checkText: 'Vitalik on the sky bridge', spend: edit, make: async () => { made++; throw new Error('no'); } });
check('a blocked prompt costs no picture', !blocked.ok && blocked.status === 422 && made === 0);
check('a blocked attempt still counts toward the day', (await generationsLeft(S, 7000)) === IMAGES.generationsPerDay - 2);
for (let i = 0; i < IMAGES.generationsPerDay - 2; i++) {
  const r = await reserve(S, 7000, edit);
  if (r.ok) await settle(S, {}, edit);
}
const over = await paidPicture(S, 7000, new Request('http://x'), { checkText: 'a path', spend: edit, make: async () => { made++; throw new Error('no'); } });
check('the day\'s limit stops an edit call before anything is spent', !over.ok && over.status === 429 && made === 0);
await sql`insert into studio.image_costs (kind, model, provider, verdict, calls, cost_usd) values ('image', 'test', 'fal.ai', 'ok', 1, ${IMAGES.totalSpendCapUsd - 0.03})`;
const cap = await reserve(S, 7001, edit);
check('the spend caps stop an edit whose worst case would pass them', !cap.ok && (cap.refusal === 'trial-spend' || cap.refusal === 'spend'), JSON.stringify(cap));
const cheap = await reserve(S, 7001);
check('…while a text-to-image call still fits', cheap.ok);

// Report and hide.
const w = await D.workOf(S, fork.versionId);
check('a design\'s files are all its pictures', w?.type === 'design' && w.files.length === 2, JSON.stringify(w));
const ws = await D.workOf(S, s1.versionId);
check('a sheet\'s files are its views', ws?.files.length === 1);
await sql`insert into studio.removal_log ${sql({ element_id: fork.elementId, step: 'reported', by_fid: 9, role: 'reader', reason: 'someone_elses_work', note: 'a famous comic' })}`;
const q = await D.fullQueue(S);
const item = q.find((x) => x.version_id === fork.versionId);
check('a reported design is in the moderator queue', item?.type === 'design' && JSON.stringify((item as { reasons: unknown }).reasons).includes('someone_elses_work'));
check('the queue never names a reporter', !JSON.stringify(q).includes('"by_fid"'));
await sql`update studio.elements set status = 'hidden' where id = ${fork.elementId}`;
await sql`insert into studio.removal_log ${sql({ element_id: fork.elementId, step: 'hidden', by_fid: 6786, role: 'moderator' })}`;
check('a hidden design leaves the lists', !(await D.listDesigns(S, 'style', 'new')).some((s) => s.elementId === fork.elementId));
check('a hidden design has no page', (await D.designByVersion(S, fork.versionId)) === null);
check('a hidden design can\'t be picked', (await D.setPick(S, 44, fork.versionId)) === null);
await D.setPick(S, 45, a.versionId);
await sql`update studio.elements set status = 'hidden' where id = ${a.elementId}`;
const p45 = await D.myPicks(S, 45);
check('a pick of a hidden design is marked and not offered', p45[0].available === false && D.composerPicks(p45).style === null);
await sql`update studio.elements set status = 'published' where id = ${a.elementId}`;
const mod = read('src/app/api/moderate/route.ts');
const dismiss = mod.slice(mod.indexOf("action === 'dismiss'"), mod.indexOf("else return NextResponse.json({ error: 'Hide or dismiss only' }"));
check('Dismiss only logs; it never changes a status', /removal_log/.test(dismiss) && !/update studio\.elements/.test(dismiss));
check('the moderator route can\'t publish or order', !/status\s*=\s*'published'|order by|\.sort\(/i.test(mod));

await sql.end();
await server.stop();
if (failures.length) {
  console.error(`\nDESIGN TESTS FAILED (${failures.length}, ${passed} passed):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`design tests passed: ${passed} checks (styles, sheets, forks, versions, built on, orders, private picks, caps on edit calls, report and hide)`);
