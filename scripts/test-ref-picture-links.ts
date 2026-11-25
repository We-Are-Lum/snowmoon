/**
 * A picture's own address in the chapter-picture sheets' reference picker, and the edition's own chapter pictures as
 * references (Garance's request, relayed by the owner 2026-11-24; branch ref-picture-links). One check per point:
 *  L. links: a pictures.snowmoon.party address reads to its file key, a media.snowmoon.party seed address to its path,
 *     a chapter picture's recipe or draft link to its version; look-alike hosts and other paths are refused;
 *  A. addresses on the server: a reader's picture's address is that picture; a sheet's front view is the sheet, another
 *     view is refused; a kept chapter picture's address is a `chapter` reference credited to the admin who kept it; a
 *     committed picture's address is an `edition` reference while its chapter shows it;
 *  D. drafts: a draft's would-be address is found nowhere, its draft link and its id are refused as not published;
 *  H. hidden, taken off, replaced: a hidden reader's picture, a chapter picture whose job an admin hid, and an added
 *     picture taken off its chapter are each refused with their own words; a kept version a later keep replaced, and a
 *     committed picture with a kept redo in its place, stay usable (owner on #233, 2026-11-24);
 *  S. search finds the chapters' kept pictures (replaced ones too) by character, chapter and note words, never a draft,
 *     a hidden or a taken-off one;
 *  M. Make: a chapter picture goes as the others do, by its kept file checked against its sha256 (a mismatch stops
 *     Make); the recipe names it, its job, its kind and its sha256; a redo can't pick its own picture again;
 *  K. Keep: the caption credits the admin ("after @garance’s chapter 6 picture"); a chapter picture taken off since the
 *     draft, or hidden since, stops Keep; one replaced since doesn't; one hidden after Keep reads "a picture since hidden" and the public recipe
 *     drops its address and job;
 *  P. P5j (writes only in admin.ts), and planted faults: a looser host check, a resolver that accepts drafts, ignores
 *     hides or take-offs, or refuses replaced ones; a Keep without the taken-off check.
 *
 *   npm run test:ref-picture-links
 *
 * In-memory Postgres (PGlite, every migration), through postgres.js as studio_writer. No network, no model, no bucket.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
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

const { addPicture, redoPicture, showPicture } = await import('../src/lib/chapter-pictures/pictures');
const { resolveReference, referenceFromLink, searchReferences, REF_WORDING } = await import('../src/lib/chapter-pictures/references');
const { readReplacements, publicRecipe } = await import('../src/lib/chapter-pictures/read');
const { parseRefLink, addedBy, creditLine } = await import('../src/lib/chapter-pictures/shared');
const { p5jProblems } = await import('./lib/p5b');
type Sql = Parameters<typeof addPicture>[0];
type Deps = Parameters<typeof addPicture>[5];

const GARANCE = 193912;
const US = { country: 'US', region: null as string | null };
const jpeg = async (r: number, w = 1024, h = 576) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 70, b: 120 } } }).jpeg().toBuffer();
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const BYTES = new Map<string, Buffer>();
const fileOf = (s: string) => `https://pictures.snowmoon.party/images/readers/${s.slice(0, 32)}.jpg`;
const u = (a: number, b: number) => `${String(a).padStart(8, '0')}-0000-4000-8000-${String(b).padStart(12, '0')}`;

// Jobs: Gladias's sealed room (c6), Mu, Zei and Bai (c4), the toy drone (c1, hidden later), and a committed one left as it is.
const GLADIAS = 'c6-b004-foil-basement', MU = 'c4-b149-new-rule', DRONE = 'c1-b005-toy-drone';
const published = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/illustrations/published.json'), 'utf8')).images as { id: string; chapter: number; url: string; sha256: string }[];
const SEED = published.find((x) => x.id === 'c1-b013-sky-bridge') ?? published.find((x) => ![GLADIAS, MU, DRONE].includes(x.id))!;
const seedOf = (job: string) => published.find((x) => x.id === job)!;

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const ZEI = u(1, 1);
await pg.query(`insert into studio.entities (id, work_id, kind, name) values ($1,'snowmoon','character','Zei')`, [ZEI]);
// A reader's picture, a hidden one, and a sheet with a front and a side view, each with a 32-hex address as the site writes it.
const ID = { reader: u(70, 1), hidden: u(70, 2), sheet: u(40, 1) };
let im = 0;
const image = async (versionId: string, byName: string, shade: number, status = 'published') => {
  im++;
  const bytes = await jpeg(shade);
  const s = hash(bytes);
  BYTES.set(s, bytes);
  await pg.query(`insert into studio.recipes (id, source, provider, model, model_version, prompt, params, seed, cost_usd, created_by_fid) values ($1,'in_app','fal.ai','m','e','p',$2,1,0.01,$3)`, [u(60, im), JSON.stringify({ by_name: byName, user_prompt: 'the valley at dusk' }), 500 + im]);
  await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, status) values ($1,'snowmoon','image',$2,$3)`, [u(61, im), 500 + im, status]);
  await pg.query(`insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values ($1,$2,1,'{}',$3,$4,$5)`, [versionId, u(61, im), fileOf(s), s, u(60, im)]);
  return s;
};
const READER_SHA = await image(ID.reader, 'fixture501', 30);
const HIDDEN_SHA = await image(ID.hidden, 'fixture502', 40, 'hidden');
const frontBytes = await jpeg(50, 576, 768), sideBytes = await jpeg(60, 576, 768);
const FRONT = hash(frontBytes), SIDE = hash(sideBytes);
BYTES.set(FRONT, frontBytes);
await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ($1,'snowmoon','design',6786,$2,'published')`, [u(50, 1), ZEI]);
await pg.query(`insert into studio.element_versions (id, element_id, version_no, body) values ($1,$2,1,$3)`, [ID.sheet, u(50, 1), JSON.stringify({ title: 'Zei, travelling', text: 'x', samples: [], by_name: 'naaate', views: { front: { url: fileOf(FRONT), sha256: FRONT }, side: { url: fileOf(SIDE), sha256: SIDE } } })]);

const server = new PGLiteSocketServer({ db: pg, port: 54397, host: '127.0.0.1' });
await server.start();
const sql = postgres('postgres://studio_writer@127.0.0.1:54397/postgres', { prepare: false, max: 1 });
await sql`set role studio_writer`;
const S = sql as unknown as Sql;

// Stand-ins: the model, the bucket (it keeps what it is given), and the reference reader, which checks sha256 as the real one does.
const calls: { prompt: string; refs: Buffer[] }[] = [];
let shade = 90;
const SHOWN = await jpeg(5);
const made = async () => ({ bytes: await jpeg((shade += 13) % 255), contentType: 'image/jpeg', seed: null, requestId: 'stand-in', nsfw: false, costUsd: 0.012, settings: { stand_in: true } });
const deps: Deps = {
  reference: async (url, s) => {
    if (url.startsWith('https://media.snowmoon.party/images/seed/')) return SHOWN;
    const b = url.startsWith('https://pictures.snowmoon.party/images/readers/') ? BYTES.get(s) : undefined;
    return b && hash(b) === s ? b : null;
  },
  makeOpen: async (prompt) => (calls.push({ prompt, refs: [] }), made()),
  makeClosed: async (_m, prompt, ref) => (calls.push({ prompt, refs: [ref] }), made()),
  makeAdded: async (_m, prompt, refs) => (calls.push({ prompt, refs }), made()),
  putPublic: async (s, bytes) => (BYTES.set(s, bytes), fileOf(s)),
  storageReady: () => true,
  handleFor: async (fid) => (fid === GARANCE ? 'garance' : null),
  paid: async (_s, _f, _r, j) => ({ ok: true, made: await j.make(), left: 100 }),
  consented: async (fid) => fid === GARANCE,
  sheets: async () => [],
};
const req = new Request('http://localhost/api/you/illustrations/redo', { method: 'POST' });
const OPEN = 'flux2-klein-4b-edit';
const redo = (jobId: string, picked: string[] = [], note = 'Make the light warmer.') => redoPicture(S, GARANCE, req, { jobId, note, model: OPEN, picked }, US, deps);
const keep = (jobId: string, versionId: string) => showPicture(S, GARANCE, { jobId, versionId }, deps);
const sha = async (id: string) => (await sql<{ sha256: string }[]>`select sha256 from studio.chapter_picture_versions where id = ${id}`)[0].sha256;

// The edition's pictures as Garance left them: Gladias kept; Mu kept twice (the first replaced); the drone kept, then hidden; one draft.
let r = await redo(GLADIAS);
const gladias = String(r.json.versionId);
check('setup: Gladias\'s redo made and kept', r.status === 200 && (await keep(GLADIAS, gladias)).status === 200, JSON.stringify(r.json));
r = await redo(GLADIAS, [], 'A draft never kept.');
const draft = String(r.json.versionId);
r = await redo(MU);
const mu1 = String(r.json.versionId);
await keep(MU, mu1);
r = await redo(MU, [], 'Only Bai changes.');
const mu2 = String(r.json.versionId);
check('setup: Mu\'s second redo kept in place of the first', (await keep(MU, mu2)).status === 200 && (await readReplacements(S)).get(MU)?.versionId === mu2);
r = await redo(DRONE);
const drone = String(r.json.versionId);
await keep(DRONE, drone);
await sql`insert into studio.seeded_hidden ${sql({ image_id: DRONE, by_fid: GARANCE })}`;
// An added picture kept, then taken off its chapter (owner, 2026-11-19: "take it off the chapter").
const addReq = new Request('http://localhost/api/you/illustrations/add', { method: 'POST' });
const add = (picked: string[], note = 'Gladias at the window.') => addPicture(S, GARANCE, addReq, { chapter: 6, after: 10, start: 8, end: 10, note, model: OPEN, picked }, US, deps);
r = await add([], 'The basement door, taken off later.');
const offJob = String(r.json.jobId), off = String(r.json.versionId);
await keep(offJob, off);
check('setup: an added picture kept, then taken off its chapter', (await showPicture(S, GARANCE, { jobId: offJob, versionId: null }, deps)).status === 200 && !(await readReplacements(S)).has(offJob));
const [GLADIAS_SHA, DRAFT_SHA, MU1_SHA, MU2_SHA, DRONE_SHA, OFF_SHA] = await Promise.all([gladias, draft, mu1, mu2, drone, off].map(sha));

// L. Links.
for (const [l, page, id] of [
  [fileOf(GLADIAS_SHA), 'file', GLADIAS_SHA.slice(0, 32)],
  [`pictures.snowmoon.party/images/readers/${READER_SHA.slice(0, 32).toUpperCase()}.jpg`, 'file', READER_SHA.slice(0, 32)],
  [SEED.url, 'seed', new URL(SEED.url).pathname],
  [`https://snowmoon.party/api/chapter-pictures/${gladias}`, 'chapter', gladias],
  [`/api/you/illustrations/draft/${draft}`, 'chapter', draft],
] as const) {
  const p = parseRefLink(l);
  check(`L. ${l.slice(0, 70)}… reads as ${page}`, p?.page === page && p.id === id, JSON.stringify(p));
}
const linkProblems = (f: typeof parseRefLink) =>
  [
    `https://pictures.snowmoon.party.evil.example/images/readers/${READER_SHA.slice(0, 32)}.jpg`,
    `https://evilpictures.snowmoon.party/images/readers/${READER_SHA.slice(0, 32)}.jpg`,
    `https://pictures.snowmoon.party/images/readers/${READER_SHA.slice(0, 16)}.jpg`,
    `https://pictures.snowmoon.party/brought-in/x.jpg`,
    `https://media.snowmoon.party/images/../secret.jpg`,
    `https://media.snowmoon.party/podcast/x.mp3`,
    `https://snowmoon.party/images/readers/${READER_SHA.slice(0, 32)}.jpg`,
    `ftp://pictures.snowmoon.party/images/readers/${READER_SHA.slice(0, 32)}.jpg`,
  ].filter((l) => f(l) !== null);
check('L. look-alike hosts, short keys, other folders and schemes are refused', linkProblems(parseRefLink).length === 0, linkProblems(parseRefLink).join(' '));
check('P. planted: a host check that takes anything ending in snowmoon.party is caught', linkProblems((l) => (/^https?:\/\/[^/]*snowmoon\.party[^/]*\//.test(String(l)) ? { id: 'x', page: 'file' } : null)).length > 0);

// A. Addresses on the server.
let a = await referenceFromLink(S, fileOf(READER_SHA));
check('A. a reader\'s picture\'s own address is that picture, credited to its maker', a.ok && a.ref.versionId === ID.reader && a.ref.kind === 'picture' && a.ref.by === '@fixture501' && a.ref.sha256 === READER_SHA, JSON.stringify(a));
a = await referenceFromLink(S, fileOf(FRONT));
check('A. a sheet\'s front view\'s address is the sheet', a.ok && a.ref.versionId === ID.sheet && a.ref.kind === 'sheet' && a.ref.sha256 === FRONT, JSON.stringify(a));
a = await referenceFromLink(S, fileOf(SIDE));
check('A. a sheet\'s other view is refused, saying only the front view is sent', !a.ok && a.reason === 'other-view' && a.error === REF_WORDING.otherView, JSON.stringify(a));
a = await referenceFromLink(S, fileOf(GLADIAS_SHA));
check('A. a kept chapter picture\'s address is a chapter reference: its version, job, file and sha256, credited to the admin', a.ok && a.ref.kind === 'chapter' && a.ref.versionId === gladias && a.ref.job === GLADIAS && a.ref.what === 'chapter 6 picture' && a.ref.by === '@garance' && a.ref.byFid === GARANCE && a.ref.url === fileOf(GLADIAS_SHA) && a.ref.sha256 === GLADIAS_SHA, JSON.stringify(a));
a = await referenceFromLink(S, `https://snowmoon.party/api/chapter-pictures/${mu2}`);
check('A. a kept chapter picture\'s recipe link reads to it too', a.ok && a.ref.versionId === mu2 && a.ref.what === 'chapter 4 picture');
a = await referenceFromLink(S, SEED.url);
check('A. a committed picture\'s address (media.snowmoon.party) is an edition reference while its chapter shows it', a.ok && a.ref.kind === 'edition' && a.ref.versionId === SEED.id && a.ref.by === 'the edition' && a.ref.sha256 === SEED.sha256 && a.ref.url === SEED.url, JSON.stringify(a));
check('A. its credit reads "after the edition’s chapter 1 picture"', a.ok && creditLine([{ what: a.ref.what, by: a.ref.by, hidden: false }]) === `after the edition’s chapter ${SEED.chapter} picture`);
a = await referenceFromLink(S, 'https://pictures.snowmoon.party/images/readers/' + 'ab'.repeat(16) + '.jpg');
check('A. an address no record names is not found', !a.ok && a.reason === 'not-found');

// D. Drafts.
a = await referenceFromLink(S, fileOf(DRAFT_SHA));
check('D. a draft\'s would-be address is found nowhere (its file was never put on the bucket)', !a.ok && a.reason === 'not-found', JSON.stringify(a));
a = await referenceFromLink(S, `https://snowmoon.party/api/you/illustrations/draft/${draft}`);
check('D. a draft\'s link is refused as not published', !a.ok && a.reason === 'unpublished' && a.error === REF_WORDING.unpublished, JSON.stringify(a));
a = await resolveReference(S, draft);
check('D. a draft\'s id sent with Make is refused as not published', !a.ok && a.reason === 'unpublished');

// H. Hidden and taken off.
a = await referenceFromLink(S, fileOf(HIDDEN_SHA));
check('H. a hidden reader\'s picture\'s address is refused as hidden', !a.ok && a.reason === 'hidden');
a = await referenceFromLink(S, fileOf(DRONE_SHA));
check('H. a chapter picture whose job an admin hid is refused as hidden', !a.ok && a.reason === 'hidden' && a.error === REF_WORDING.hidden, JSON.stringify(a));
a = await referenceFromLink(S, fileOf(OFF_SHA));
check('H. an added picture taken off its chapter is refused as taken off', !a.ok && a.reason === 'taken-off' && a.error === REF_WORDING.takenOff, JSON.stringify(a));
a = await referenceFromLink(S, fileOf(MU1_SHA));
check('H. a kept version a later keep replaced stays usable, credited to the admin who kept it', a.ok && a.ref.kind === 'chapter' && a.ref.versionId === mu1 && a.ref.by === '@garance' && a.ref.url === fileOf(MU1_SHA) && a.ref.sha256 === MU1_SHA, JSON.stringify(a));
a = await referenceFromLink(S, seedOf(GLADIAS).url);
check('H. a committed picture with a kept redo in its place stays usable', a.ok && a.ref.kind === 'edition' && a.ref.versionId === GLADIAS, JSON.stringify(a));
a = await referenceFromLink(S, seedOf(DRONE).url);
check('H. a committed picture an admin hid is refused as hidden', !a.ok && a.reason === 'hidden');

// S. Search.
const ids = async (q: string) => (await searchReferences(S, q)).map((x) => x.versionId);
let found = await ids('gladias');
check('S. "gladias" finds Gladias\'s kept chapter picture (the job\'s cast), not the draft', found.includes(gladias) && !found.includes(draft), found.join(','));
found = await ids('Mu');
check('S. "Mu" finds the Mu picture shown now first, then the one it replaced', found.indexOf(mu2) >= 0 && found.indexOf(mu1) > found.indexOf(mu2), found.join(','));
found = await ids('chapter 4');
check('S. "chapter 4" finds chapter 4\'s kept picture', found.includes(mu2) && !found.includes(gladias), found.join(','));
found = await ids('bai changes');
check('S. words from the admin\'s note find it', found.includes(mu2), found.join(','));
found = await ids('chapter 1');
check('S. a chapter picture whose job an admin hid is never a result', !found.includes(drone), found.join(','));
found = await ids('basement door');
check('S. a taken-off added picture is never a result', !found.includes(off), found.join(','));
const results = await searchReferences(S, 'gladias');
check('S. a result is listed as a chapter picture by its admin', results.some((x) => x.versionId === gladias && x.kind === 'chapter' && x.by === '@garance' && x.url === fileOf(GLADIAS_SHA)));

// M. Make.
r = await add([gladias, ID.reader]);
const c = calls.at(-1);
check('M. a chapter picture goes with Make by its kept file, checked by sha256, in the order picked', r.status === 200 && c?.refs.length === 2 && hash(c.refs[0]) === GLADIAS_SHA && hash(c.refs[1]) === READER_SHA, JSON.stringify(r.json));
check('M. the prompt says what it is and names no admin', /Reference picture 1 is a chapter 6 picture; reference picture 2 is a picture/.test(c?.prompt ?? '') && !/garance|@/.test(c?.prompt ?? ''), c?.prompt);
const addedJob = String(r.json.jobId), addedVersion = String(r.json.versionId);
const [row] = await sql<{ recipe: { picked: Record<string, unknown>[] } }[]>`select recipe from studio.chapter_picture_versions where id = ${addedVersion}`;
check('M. the recipe names it: version, kind, job, admin, file and sha256', row.recipe.picked[0].versionId === gladias && row.recipe.picked[0].kind === 'chapter' && row.recipe.picked[0].job === GLADIAS && row.recipe.picked[0].by === '@garance' && row.recipe.picked[0].sha256 === GLADIAS_SHA, JSON.stringify(row.recipe.picked[0]));
for (const [id, reason] of [[draft, 'unpublished'], [off, 'taken-off'], [drone, 'hidden']] as const) {
  const n = calls.length;
  r = await add([id]);
  check(`M. Make refuses a ${reason} chapter picture (409) and makes nothing`, r.status === 409 && r.json.reason === reason && calls.length === n, JSON.stringify(r.json));
}
{
  const n = calls.length;
  r = await add([mu1], 'Mu, as she was first drawn.');
  check('M. a replaced chapter picture is sent at Make, by its kept file', r.status === 200 && calls.length === n + 1 && hash(calls.at(-1)!.refs[0]) === MU1_SHA, JSON.stringify(r.json));
}
r = await redo(GLADIAS, [gladias]);
check('M. a redo can\'t pick the picture it starts from again', r.status === 400 && r.json.error === REF_WORDING.shownAlready);
{
  const good = BYTES.get(MU2_SHA)!;
  BYTES.set(MU2_SHA, await jpeg(250));
  const n = calls.length;
  r = await add([mu2]);
  check('M. a kept file that no longer matches its sha256 stops Make, and nothing is made', r.status === 503 && calls.length === n, JSON.stringify(r.json));
  BYTES.set(MU2_SHA, good);
}

// K. Keep.
r = await keep(addedJob, addedVersion);
let shown = (await readReplacements(S)).get(addedJob);
check('K. the caption credits the admin who kept the chapter picture', r.status === 200 && shown !== undefined && addedBy(shown) === 'Added by @garance, after @garance’s chapter 6 picture and @fixture501’s picture', shown ? addedBy(shown) : JSON.stringify(r.json));
r = await add([mu2], 'Mu at the door.');
const afterMu = String(r.json.versionId), afterMuJob = String(r.json.jobId);
r = await redo(MU, [], 'Mu again, later.');
await keep(MU, String(r.json.versionId));
r = await keep(afterMuJob, afterMu);
check('K. a chapter picture replaced since the draft doesn\'t stop Keep; the caption still credits it', r.status === 200 && addedBy((await readReplacements(S)).get(afterMuJob)!) === 'Added by @garance, after @garance’s chapter 4 picture', JSON.stringify(r.json));
// Taken off since the draft: an added picture kept, a draft made after it, then it is taken off.
r = await add([], 'The stair, to be taken off.');
const xJob = String(r.json.jobId), x = String(r.json.versionId);
await keep(xJob, x);
r = await add([x], 'Gladias on the stair.');
const afterX = String(r.json.versionId), afterXJob = String(r.json.jobId);
await showPicture(S, GARANCE, { jobId: xJob, versionId: null }, deps);
r = await keep(afterXJob, afterX);
check('K. a chapter picture taken off since the draft stops Keep, naming it; the draft stays a draft', r.status === 409 && r.json.reason === 'reference-off' && r.json.error === REF_WORDING.keepOff(['@garance’s chapter 6 picture']) && !(await publicRecipe(S, afterX)), JSON.stringify(r.json));
check('K. its words', REF_WORDING.keepOff(['@garance’s chapter 6 picture']) === 'This draft can’t be kept: one of its references (@garance’s chapter 6 picture) has been taken off its chapter since. Make another draft with other references.');
// Hidden since the draft: a draft after the committed picture, then its job is hidden.
r = await add([SEED.id], 'The bridge, closer.');
const afterSeed = String(r.json.versionId), afterSeedJob = String(r.json.jobId);
check('M. a committed picture can be sent too, by its job\'s id', r.status === 200 && calls.at(-1)?.refs.length === 1, JSON.stringify(r.json));
await sql`insert into studio.seeded_hidden ${sql({ image_id: SEED.id, by_fid: GARANCE })}`;
r = await keep(afterSeedJob, afterSeed);
check('K. a chapter picture hidden since the draft stops Keep with the owner\'s words', r.status === 409 && r.json.reason === 'reference-hidden' && r.json.error === REF_WORDING.keepHidden([`the edition’s chapter ${SEED.chapter} picture`]), JSON.stringify(r.json));
// Hidden after Keep: Gladias's job is hidden; the caption and the public recipe drop it.
await sql`insert into studio.seeded_hidden ${sql({ image_id: GLADIAS, by_fid: GARANCE })}`;
shown = (await readReplacements(S)).get(addedJob);
check('K. hidden after Keep: the caption says "a picture since hidden", with no name', shown !== undefined && addedBy(shown) === 'Added by @garance, after a picture since hidden and @fixture501’s picture', shown ? addedBy(shown) : '');
const pub = JSON.stringify(await publicRecipe(S, addedVersion));
check('K. the public recipe keeps its kind and sha256 but not its address, job or version', pub.includes(GLADIAS_SHA) && !pub.includes(fileOf(GLADIAS_SHA)) && !pub.includes(`"job":"${GLADIAS}"`) && !pub.includes(gladias), pub.slice(0, 200));

// P. P5j and planted faults.
const src = (dir: string): { file: string; text: string }[] =>
  readdirSync(path.join(ROOT, dir), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: path.join(dir, f), text: readFileSync(path.join(ROOT, dir, f), 'utf8') }));
const files = src('src');
check('P. P5j passes (writes only in admin.ts; references.ts only reads)', p5jProblems(files).length === 0, p5jProblems(files).join('; '));
const refsText = readFileSync(path.join(ROOT, 'src/lib/chapter-pictures/references.ts'), 'utf8');
// The chapter resolver's rules, by its source: drafts, hides and take-offs refused; nothing that refuses a replaced one.
const RULES = [/if \(!kept\) return refuse\('unpublished'\);/, /if \(\(await hiddenJobs\(sql, \[v\.job_id\]\)\)\.has\(v\.job_id\)\) return refuse\('hidden'\);/, /if \(\(await takenOffJobs\(sql, \[v\.job_id\]\)\)\.has\(v\.job_id\)\) return refuse\('taken-off'\);/, /if \(\(await hiddenJobs\(sql, \[s\.id\]\)\)\.has\(s\.id\)\) return refuse\('hidden'\);/];
const body = (t: string, fn: string) => t.slice(t.indexOf(`async function ${fn}(`), t.indexOf('\n}\n', t.indexOf(`async function ${fn}(`)));
const resolverProblems = (t: string) => [
  ...RULES.filter((re) => !re.test(t)).map(String),
  ...(/shownNow|versionId !==|readReplacements/.test(body(t, 'resolveChapterPicture') + body(t, 'resolveEdition')) ? ['a resolver refuses a replaced picture'] : []),
];
check('P. the chapter resolvers refuse drafts, hidden and taken-off pictures, and never a replaced one', resolverProblems(refsText).length === 0, resolverProblems(refsText).join(' '));
check('P. planted: a resolver that accepts drafts is caught', resolverProblems(refsText.replace("if (!kept) return refuse('unpublished');", '')).length > 0);
check('P. planted: a resolver that ignores hides is caught', resolverProblems(refsText.replace("if ((await hiddenJobs(sql, [v.job_id])).has(v.job_id)) return refuse('hidden');", '')).length > 0);
check('P. planted: a resolver that ignores take-offs is caught', resolverProblems(refsText.replace("if ((await takenOffJobs(sql, [v.job_id])).has(v.job_id)) return refuse('taken-off');", '')).length > 0);
check('P. planted: a resolver that refuses a replaced picture is caught', resolverProblems(refsText.replace("if (!SHA.test(v.sha256)) return refuse('not-found');", "if ((await shownNow(sql)).get(v.job_id)?.versionId !== v.id) return refuse('taken-off');\n  if (!SHA.test(v.sha256)) return refuse('not-found');")).length > 0);
// The same rule at Keep, by behaviour: a planted status rule that calls a replaced one 'off' is caught.
const { chapterRefStatuses } = await import('../src/lib/chapter-pictures/references');
const statusProblems = async (f: typeof chapterRefStatuses) => {
  const m = await f(S, [{ versionId: mu1, kind: 'chapter', job: MU }, { versionId: x, kind: 'chapter', job: xJob }, { versionId: gladias, kind: 'chapter', job: GLADIAS }, { versionId: SEED.id, kind: 'edition', job: SEED.id }, { versionId: GLADIAS, kind: 'edition', job: GLADIAS }]);
  const want: [string, string][] = [[mu1, 'published'], [x, 'off'], [gladias, 'hidden'], [SEED.id, 'hidden'], [GLADIAS, 'hidden']];
  return want.filter(([id, w]) => m.get(id.toLowerCase()) !== w).map(([id, w]) => `${id}: ${m.get(id.toLowerCase())} not ${w}`);
};
check('P. at Keep: replaced is usable, taken off is off, hidden is hidden', (await statusProblems(chapterRefStatuses)).length === 0, (await statusProblems(chapterRefStatuses)).join('; '));
check('P. planted: a Keep rule that calls a replaced picture off is caught', (await statusProblems(async (sq, refs) => {
  const m = await chapterRefStatuses(sq, refs);
  const shownNow = await readReplacements(S);
  for (const r of refs) if (r.kind === 'chapter' && m.get(r.versionId) === 'published' && shownNow.get(r.job!)?.versionId !== r.versionId) m.set(r.versionId, 'off');
  return m;
})).length > 0);
const picturesText = readFileSync(path.join(ROOT, 'src/lib/chapter-pictures/pictures.ts'), 'utf8');
const keepProblems = (t: string) => ((t.match(/if \(off\.length\) return no\(409, REF_WORDING\.keepOff\(off\)/g) ?? []).length === 2 ? [] : ['a Keep path without the taken-off check']);
check('P. both Keep paths refuse a draft made after a chapter picture taken off since', keepProblems(picturesText).length === 0);
check('P. planted: a Keep without the check is caught', keepProblems(picturesText.replace('if (off.length) return no(409, REF_WORDING.keepOff(off)', 'if (false) return no(409, REF_WORDING.keepOff(off)')).length > 0);
check('P. the admin Hide route\'s seeded hide reaches the captions of pictures made after it', readFileSync(path.join(ROOT, 'src/app/api/admin/hide/route.ts'), 'utf8').includes('await jobHideReachesChapterPictures(sql, im.id);'));

await sql.end();
await server.stop();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
