/**
 * Pictures an admin adds while reading (owner, 2026-11-19; branch chapter-pictures-in-reader). One check per point:
 *  A. admins only: the new routes answer 401 signed out and hold the 404 gate; the writer refuses a non-admin;
 *  B. before 0043_chapter_picture_additions, Add answers that it isn't ready and writes nothing;
 *  N. a new picture: the passage checked (blocks of this chapter, in order), the note needed, the model offered, its
 *     notice and 18+, only characters the passage names with a sheet go along, as references in the order chosen;
 *     GPT Image 2.5 Sunburst is the admins' default where OpenAI serves, FLUX elsewhere (P3, DRAFT);
 *  D. the draft is private: no decision, nothing on the chapter, no public recipe; it waits on /you/illustrations;
 *  W. there it is named by ¶ as the reader names it ("after ¶ 39"), "block N" for a block with no ¶;
 *  K. Keep: shown in the chapter at once, after its block, "Added by @garance", the model with its maker; the recipe
 *     names the model, maker, style, note, references and the admin;
 *  T. take it off the chapter, show it again, another draft for the same picture; nothing is deleted;
 *  H. an admin's Hide reaches an added picture;
 *  C. the $20 admin cap;
 *  P. P5j covers the new table: the real files pass, a planted write to it from another file fails, and so does an
 *     update of it in place.
 *
 *   npm run test:chapter-additions
 *
 * In-memory Postgres (PGlite, every migration, 0043_chapter_picture_additions included), through postgres.js as
 * studio_writer. No network, no model, no bucket: every such call is a stand-in.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};

async function database(withAdditions: boolean) {
  const pg = new PGlite();
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    if (!withAdditions && f === '0043_chapter_picture_additions.sql') continue;
    await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  }
  return pg;
}

const { addPicture, showPicture, adminView } = await import('../src/lib/chapter-pictures/pictures');
const { readAdditions, readReplacements, publicRecipe, pictureHistory } = await import('../src/lib/chapter-pictures/read');
const { saveAddition } = await import('../src/lib/chapter-pictures/admin');
const { addedPictures } = await import('../src/lib/chapter-pictures/view');
const { waitingDrafts, waitingWhere } = await import('../src/lib/chapter-pictures/waiting');
const { blockFacts } = await import('../src/lib/reading');
const { loadChapter } = await import('../src/lib/book');
const { chapterDefaultModel, chapterDefaultProblems } = await import('../src/lib/chapter-pictures/default-model');
const { CHAPTER_PICTURES, CLOSED_PROVIDERS, IMAGES } = await import('../src/lib/config');
const { challengeModelsFor } = await import('../src/lib/challenge/models');
const { paidPicture } = await import('../src/lib/images/paid');
const { p5jProblems } = await import('./lib/p5b');
type Sql = Parameters<typeof addPicture>[0];
type Deps = Parameters<typeof addPicture>[5];

const GARANCE = 193912, STRANGER = 4242;
const US: { country: string | null; region: string | null } = { country: 'US', region: null }, NOWHERE: { country: string | null; region: string | null } = { country: null, region: null };
const jpeg = async (r: number) => sharp({ create: { width: 1024, height: 576, channels: 3, background: { r, g: 90, b: 140 } } }).jpeg().toBuffer();
const SHEET = await jpeg(5);
const calls: { kind: string; model?: string; refs?: number; prompt?: string; pool?: string }[] = [];
const puts: string[] = [];
let shade = 20;
const deps: Deps = {
  reference: async (_url, sha) => (sha === 's'.repeat(64) ? SHEET : null),
  makeOpen: async () => { throw new Error('a redo is not used here'); },
  makeClosed: async () => { throw new Error('a redo is not used here'); },
  makeAdded: async (m, prompt, refs) => {
    calls.push({ kind: 'make', model: m.id, refs: refs.length, prompt });
    return { bytes: await jpeg((shade += 30)), contentType: 'image/jpeg', seed: null, requestId: 'stand-in', nsfw: false, costUsd: m.open ? 0.012 : 0.0478, settings: { stand_in: true } };
  },
  putPublic: async (sha) => {
    puts.push(sha);
    return `https://pictures.snowmoon.party/images/readers/${sha.slice(0, 32)}.jpg`;
  },
  storageReady: () => true,
  handleFor: async (fid) => (fid === GARANCE ? 'garance' : null),
  paid: async (_s, _f, _r, j) => {
    calls.push({ kind: 'paid', pool: j.spend?.pool, prompt: j.checkText });
    return { ok: true, made: await j.make(), left: 100 };
  },
  consented: async (fid) => fid === GARANCE,
  sheets: async (_sql, chapter, start, end) => (chapter === 3 && start <= 42 && end >= 40 ? [{ slug: 'zei', name: 'Zei', versionId: '00000009-0000-4000-8000-0000000000aa', url: 'https://pictures.snowmoon.party/images/readers/zei.jpg', sha256: 's'.repeat(64) }] : []),
};
const req = new Request('http://localhost/api/you/illustrations/add', { method: 'POST' });
const notice = { version: CLOSED_PROVIDERS.OpenAI.noticeVersion, adult: true };

// A. Admins only.
for (const r of ['src/app/api/you/illustrations/add/route.ts', 'src/app/api/you/illustrations/passage/route.ts', 'src/app/api/you/illustrations/picture/route.ts']) {
  const text = readFileSync(path.join(ROOT, r), 'utf8');
  check(`A. ${r} answers anyone not an admin with 404`, /if \(!isAdmin\(fid\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(text));
  const mod = await import(path.join(ROOT, r));
  const handler = mod.POST ?? mod.GET;
  const res = await handler(new Request('http://localhost/x?chapter=3&start=40&end=42', { method: mod.POST ? 'POST' : 'GET', body: mod.POST ? '{}' : undefined }));
  check(`A. ${r} signed out: 401`, res.status === 401, String(res.status));
}
const reader = readFileSync(path.join(ROOT, 'src/components/reader-picture-admin.tsx'), 'utf8');
// Three: Change this picture, Add a picture here, and the sheet opened from a selection or the player (2026-11-20).
check('A. the reader\'s controls render nothing for anyone not an admin', (reader.match(/if \(auth\.kind !== 'signed-in' \|\| !isAdmin\(auth\.fid\)\) return null;/g) ?? []).length === 3);

// B. Before the additions migration.
{
  const pg = await database(false);
  const srv = new PGLiteSocketServer({ db: pg, port: 54391, host: '127.0.0.1' });
  await srv.start();
  const sql = postgres('postgres://studio_writer@127.0.0.1:54391/postgres', { prepare: false, max: 1 });
  await sql`set role studio_writer`;
  const S = sql as unknown as Sql;
  const r = await addPicture(S, GARANCE, req, { chapter: 3, after: 42, start: 40, end: 42, note: 'Zei at the window.' }, US, deps);
  check('B. before the migration, Add says it isn\'t ready (503) and calls nothing', r.status === 503 && r.json.reason === 'not-ready' && !calls.length, JSON.stringify(r.json));
  check('B. the page is told adding isn\'t ready', (await adminView(S, US)).adding === false);
  check('B. the chapter reads no additions', (await readAdditions(S)).length === 0);
  await sql.end();
  await srv.stop();
}

const pg = await database(true);
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const srv = new PGLiteSocketServer({ db: pg, port: 54392, host: '127.0.0.1' });
await srv.start();
const sql = postgres('postgres://studio_writer@127.0.0.1:54392/postgres', { prepare: false, max: 1 });
await sql`set role studio_writer`;
const S = sql as unknown as Sql;

let threw = false;
try {
  await saveAddition(S, STRANGER, { jobId: 'c3-b042-added-00000000', chapter: 3, after: 42, start: 40, end: 42 });
} catch {
  threw = true;
}
check('A. a non-admin can\'t write an addition, whatever the caller checked', threw);

// N. A new picture.
check('N. adding is ready once the migration is in', (await adminView(S, US)).adding === true);
check('N. the admins\' default is GPT Image 2.5 Sunburst where OpenAI serves', chapterDefaultModel(US) === 'gpt-image-2.5-sunburst' && (await adminView(S, US)).defaultModel === 'gpt-image-2.5-sunburst');
check('N. ... and FLUX where it doesn\'t (no country)', chapterDefaultModel(NOWHERE) === 'flux2-klein-4b-edit');
check('N. FLUX and Gemini stay offered beside it', challengeModelsFor(US).map((m) => m.id).join(',') === 'flux2-klein-4b-edit,gpt-image-2.5-sunburst,gemini-3.1-flash-image');
check('N. the P3e rule accepts it and refuses a closed default where it isn\'t offered', chapterDefaultProblems([{ where: US, on: true, id: chapterDefaultModel(US), offered: challengeModelsFor(US).map((m) => m.id) }]).length === 0 && chapterDefaultProblems([{ where: NOWHERE, on: true, id: 'gpt-image-2.5-sunburst', offered: challengeModelsFor(NOWHERE).map((m) => m.id) }]).length === 1);
const bad = async (body: Record<string, unknown>, where = US) => (await addPicture(S, GARANCE, req, body, where, deps)).status;
check('N. a block not in the chapter is refused', (await bad({ chapter: 3, after: 99999, start: 40, end: 42, note: 'x', notice })) === 400);
check('N. a passage out of order is refused', (await bad({ chapter: 3, after: 42, start: 42, end: 40, note: 'x', notice })) === 400);
check('N. a note is needed', (await bad({ chapter: 3, after: 42, start: 40, end: 42, note: ' ', notice })) === 400);
check('N. GPT without its notice is refused', (await bad({ chapter: 3, after: 42, start: 40, end: 42, note: 'x' })) === 400);
check('N. GPT where OpenAI doesn\'t serve is refused', (await bad({ chapter: 3, after: 42, start: 40, end: 42, note: 'x', model: 'gpt-image-2.5-sunburst', notice }, NOWHERE)) === 400);
check('N. a character the passage doesn\'t name (or without a sheet) can\'t go along', (await bad({ chapter: 3, after: 42, start: 40, end: 42, note: 'x', notice, characters: ['bai'] })) === 400);
check('N. no own-words consent, no draft', (await addPicture(S, STRANGER, req, { chapter: 3, after: 42, start: 40, end: 42, note: 'x', notice }, US, { ...deps, consented: async () => false })).status === 403);
check('N. nothing was made or written by the refused ones', !calls.length && (await readAdditions(S)).length === 0);
const NOTE = 'Zei at the window of the classroom, the arena lights far off.';
let r = await addPicture(S, GARANCE, req, { chapter: 3, after: 42, start: 40, end: 42, note: NOTE, notice, characters: ['zei'] }, US, deps);
check('N. a new picture: drafted with GPT Image 2.5 Sunburst (the default), Zei\'s sheet as its one reference', r.status === 200 && calls.some((c) => c.kind === 'make' && c.model === 'gpt-image-2.5-sunburst' && c.refs === 1), JSON.stringify(r.json));
const jobId = String(r.json.jobId), v1 = String(r.json.versionId);
check('N. its id names its chapter and block', /^c3-b042-added-[0-9a-f]{8}$/.test(jobId), jobId);
check('C. paid from the admins\' pool, through the prompt check, ending with the no-words line', calls.some((c) => c.kind === 'paid' && c.pool === 'admin' && c.prompt?.endsWith(IMAGES.suffix) && c.prompt.startsWith(NOTE) && /character sheet of Zei/.test(c.prompt)));
const [add] = await readAdditions(S);
check('N. where it sits is recorded: chapter 3, after block 42, blocks 40–42, by the admin', add?.jobId === jobId && add.after === 42 && add.start === 40 && add.end === 42 && add.byFid === GARANCE);

// D. The draft is private.
check('D. a draft is not shown in the chapter', !(await readReplacements(S)).has(jobId) && addedPictures(3, await readAdditions(S), await readReplacements(S), new Set()).length === 0);
check('D. a draft has no public recipe', (await publicRecipe(S, v1)) === null && puts.length === 0);
const waiting = waitingDrafts(await pictureHistory(S), await readAdditions(S));
check('D. it waits on /you/illustrations, with where it sits', waiting.length === 1 && waiting[0].versionId === v1 && waiting[0].where.kind === 'added' && waiting[0].href === '/chapter/3#c3-b42', JSON.stringify(waiting[0]));
// W. Named by ¶ as the reader names it (owner, 2026-11-20): the reader's own blockFacts, a block without a ¶ by its number.
const readerLabel = (chapter: number, idx: number) => {
  const ch = loadChapter(chapter)!;
  return blockFacts(ch.blocks)[ch.blocks.findIndex((b) => b.idx === idx)]?.label ?? null;
};
const named = waitingDrafts(await pictureHistory(S), await readAdditions(S), readerLabel);
const wording = waitingWhere(named[0]);
check('W. a waiting draft is named by the reader\'s ¶: after ¶ 39, showing ¶ 37–39 (blocks 42, 40–42 of chapter 3)', readerLabel(3, 42) === 39 && readerLabel(3, 40) === 37 && wording === 'A new picture for chapter 3, after ¶ 39 (it shows ¶ 37–39)', wording);
check('W. no block numbers in it when every place has a ¶', !/block/.test(wording), wording);
check('W. a block with no ¶ (a heading, a break) falls back to the reader\'s "block N"', readerLabel(3, 33) === null && waitingWhere({ chapter: 3, where: { kind: 'added', after: 33, start: 33, end: 33, labels: { after: null, start: null, end: null } } }) === 'A new picture for chapter 3, after block 33 (it shows block 33)' && waitingWhere({ chapter: 3, where: { kind: 'added', after: 42, start: 33, end: 42, labels: { after: 39, start: null, end: 39 } } }) === 'A new picture for chapter 3, after ¶ 39 (it shows block 33 to ¶ 39)');
check('W. a draft replacing an edition picture names its ¶ too', waitingWhere({ chapter: 3, where: { kind: 'replace', block: 42, label: 39 } }) === 'Would replace the picture at chapter 3, ¶ 39' && waitingWhere({ chapter: 3, where: { kind: 'replace', block: 9, label: null } }) === 'Would replace the picture at chapter 3, block 9');
check('W. without labels (no chapter text) it still names the block, never a wrong ¶', waitingWhere(waiting[0]) === 'A new picture for chapter 3, after block 42 (it shows block 40 to block 42)', waitingWhere(waiting[0]));

// K. Keep.
r = await showPicture(S, GARANCE, { jobId, versionId: v1 }, deps);
check('K. keep: shown at once, its chapter returned for revalidation', r.status === 200 && (r as { chapter?: number }).chapter === 3, JSON.stringify(r.json));
let shown = addedPictures(3, await readAdditions(S), await readReplacements(S), new Set(), () => 'GPT Image 2.5 Sunburst');
check('K. the chapter shows it after block 42, "Added by @garance", the model with its maker', shown.length === 1 && shown[0].idx === 42 && shown[0].replaced.by === 'Added by @garance' && shown[0].replaced.model === 'GPT Image 2.5 Sunburst, a closed model by OpenAI', JSON.stringify(shown[0]?.replaced?.by));
check('K. another chapter shows nothing new', addedPictures(4, await readAdditions(S), await readReplacements(S), new Set()).length === 0);
const rec = await publicRecipe(S, v1);
check('K. the public recipe names the model, maker, note, references and who kept it', rec?.recipe.model.id === 'gpt-image-2.5-sunburst' && rec.recipe.model.maker === 'OpenAI' && rec.note === NOTE && rec.recipe.references?.[0]?.sheet === 'zei' && rec.recipe.added?.after === 42 && rec.published_by.fid === GARANCE);
check('K. no longer waiting', waitingDrafts(await pictureHistory(S), await readAdditions(S)).length === 0);

// T. Take it off, show it again, another draft.
r = await showPicture(S, GARANCE, { jobId, versionId: null }, deps);
check('T. take it off the chapter: nothing shown', r.status === 200 && addedPictures(3, await readAdditions(S), await readReplacements(S), new Set()).length === 0);
r = await showPicture(S, GARANCE, { jobId, versionId: null }, deps);
check('T. taking it off twice says it isn\'t shown (409)', r.status === 409);
r = await showPicture(S, GARANCE, { jobId, versionId: v1 }, deps);
check('T. show it again, in one step, without a second upload', r.status === 200 && addedPictures(3, await readAdditions(S), await readReplacements(S), new Set()).length === 1 && puts.length === 1);
r = await addPicture(S, GARANCE, req, { jobId, note: 'Zei closer to the glass.', model: 'flux2-klein-4b-edit' }, US, deps);
check('T. another draft for the same picture (FLUX, no reference), same place', r.status === 200 && r.json.jobId === jobId && calls.filter((c) => c.kind === 'make').at(-1)?.refs === 0 && (await readAdditions(S)).length === 1);
const hist = await pictureHistory(S);
check('T. nothing deleted: both versions and every decision stay', hist.versions.get(jobId)?.length === 2 && hist.decisions.get(jobId)?.length === 3);
let refused = false;
try {
  await sql`delete from studio.chapter_picture_additions`;
} catch {
  refused = true;
}
check('T. the site\'s database role can\'t delete an addition', refused);

// H. Hide.
check('H. an admin\'s Hide (studio.seeded_hidden by its id) takes it out of the chapter', addedPictures(3, await readAdditions(S), await readReplacements(S), new Set([jobId])).length === 0);
const hide = readFileSync(path.join(ROOT, 'src/app/api/admin/hide/route.ts'), 'utf8');
check('H. the Hide route takes an added picture\'s id', /isAddedId\(b\.id\) \? await readAddition\(sql, b\.id\)/.test(hide));

// C. The cap.
await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('admin', 'image', 'gpt-image-2.5-sunburst', 'Vercel AI Gateway', 'ok', 1, ${CHAPTER_PICTURES.adminDailyCapUsd - 0.05})
  on conflict (day, funded, kind, model, provider, verdict) do update set cost_usd = excluded.cost_usd`;
r = await addPicture(S, GARANCE, req, { chapter: 3, after: 50, start: 50, end: 50, note: 'One more.', notice }, US, { ...deps, paid: paidPicture });
check('C. at the $20 cap an added picture is refused, with the reset time', r.status === 429 && r.json.reason === 'admin-spend' && typeof r.json.resetAt === 'string', JSON.stringify(r.json));
check('C. ... and no addition is recorded for it', (await readAdditions(S)).length === 1);

// P. P5j.
const src = (dir: string) => readdirSync(path.join(ROOT, dir), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: path.join(dir, f), text: readFileSync(path.join(ROOT, dir, f), 'utf8') }));
const files = src('src');
check('P. P5j passes on the real files (the additions table written only by admin.ts)', p5jProblems(files).length === 0, p5jProblems(files).join('; '));
check('P. P5j catches a planted write to the additions table from another file', p5jProblems([...files, { file: 'src/app/api/planted/route.ts', text: "if (!isAdmin(fid)) return 404;\nawait sql`insert into studio.chapter_picture_additions ${sql(a)}`;" }]).length > 0);
const writer = files.find((f) => f.file === 'src/lib/chapter-pictures/admin.ts')!;
check('P. P5j catches an addition moved in place', p5jProblems([...files.filter((f) => f !== writer), { file: writer.file, text: `${writer.text}\nawait sql\`update studio.chapter_picture_additions set after_idx = 1\`;` }]).length > 0);

await sql.end();
await srv.stop();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
