/**
 * Any published style as the look, and others' published pictures as references, for the edition's chapter pictures
 * (owner's request via Garance, relayed by the owner 2026-11-21; branch chapter-pictures-references). One check per point:
 *  L. links: each kind of snowmoon.party page reads to its version; another site's address and garbage are refused;
 *  R. resolving on the server: a remix, a reader's picture, a base, a character sheet and a place sheet each resolve,
 *     with its kind, what it is, its maker and its file; a hidden, an unpublished, a missing one, and a style, are
 *     refused with their own words; search finds by maker and by character, never a hidden one;
 *  S. the look: every published style is listed (the remix challenge's marked, and one by another maker), a hidden one
 *     and one whose words name a studio are not; saving a hidden one is refused; the saved look names its version and
 *     maker; a look hidden after it was saved stops Make;
 *  C. the cap: three pictures in all, counting the sheets (an added picture), or the picture shown now (a redo);
 *  M. Make: the picked pictures go after the sheets (or after the picture shown now) through the multi-picture path,
 *     checked by sha256; the prompt names what each is and no maker; the recipe lists each with its version id, kind,
 *     maker and sha256; a picture hidden between pick and Make is refused;
 *  K. Keep: the caption credits each maker ("Added by @garance, after @…’s Zei remix …"); a reference hidden since the
 *     draft stops Keep with the reason, and Keep anyway keeps it, its credit then "a picture since hidden" and its name,
 *     page and address gone from the public recipe;
 *  F. the caption's wording for one, several, the same maker twice, and hidden ones;
 *  P. P5j still holds (writes only in admin.ts) and P5b; and planted faults (a resolver that ignores hides, a cap that
 *     ignores the sheets, a credit that names a hidden picture's maker, a recipe that keeps a hidden picture's address,
 *     a Keep without the check, a looser names list) are each caught.
 *
 *   npm run test:chapter-references
 *
 * In-memory Postgres (PGlite, every migration), through postgres.js as studio_writer. No network, no model, no bucket:
 * every such call is a stand-in.
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

const { addPicture, redoPicture, showPicture, setLook, adminView } = await import('../src/lib/chapter-pictures/pictures');
const { resolveReference, referenceFromLink, searchReferences, styleChoices, REF_WORDING } = await import('../src/lib/chapter-pictures/references');
const { readReplacements, publicRecipe, latestLooks } = await import('../src/lib/chapter-pictures/read');
const shared = await import('../src/lib/chapter-pictures/shared');
const { parseRefLink, creditLine, pickLimit, withoutHidden, addedBy, lookName, LOOK_NAMES, namesAWork } = shared;
const { CHALLENGE, CLOSED_PROVIDERS, IMAGES } = await import('../src/lib/config');
const { checkJob } = await import('../src/lib/illustration-check/jobs');
const { NAMES } = await import('./lib/publish-style');
const { p5bProblems, p5jProblems, P5J_PLANTS } = await import('./lib/p5b');
type Sql = Parameters<typeof addPicture>[0];
type Deps = Parameters<typeof addPicture>[5];

const GARANCE = 193912;
const US = { country: 'US', region: null as string | null };
const jpeg = async (r: number, w = 1024, h = 576) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 90, b: 140 } } }).jpeg().toBuffer();
const BYTES = new Map<string, Buffer>();
const sha = (n: number) => n.toString(16).padStart(2, '0').repeat(32);

// Ids.
const u = (a: number, b: number) => `${String(a).padStart(8, '0')}-0000-4000-8000-${String(b).padStart(12, '0')}`;
const ZEI_BASE = CHALLENGE.bases.zei[0];
const ID = {
  remix: u(70, 1), reader: u(70, 2), hidden: u(70, 3), draft: u(70, 4), hiddenLater: u(70, 5),
  sheet: u(40, 1), place: u(40, 2), base: ZEI_BASE, hiddenSheet: u(40, 3),
  styleOffered: u(30, 1), styleOther: u(30, 2), styleHidden: u(30, 3), styleNamed: u(30, 4),
};

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
// Entities: characters, a place, and four styles.
const ent = { zei: u(1, 1), bai: u(1, 2), autobus: u(1, 3), s1: u(1, 10), s2: u(1, 11), s3: u(1, 12), s4: u(1, 13) };
for (const [k, kind, name] of [['zei', 'character', 'Zei'], ['bai', 'character', 'Bai'], ['autobus', 'location', 'Autobus'], ['s1', 'style', CHALLENGE.offeredStyles[1]], ['s2', 'style', 'Ink and wash'], ['s3', 'style', 'Hidden style'], ['s4', 'style', 'Named style']] as const)
  await pg.query(`insert into studio.entities (id, work_id, kind, name) values ($1,'snowmoon',$2,$3)`, [ent[k], kind, name]);
let el = 0;
const design = async (entity: string, versionId: string, body: Record<string, unknown>, fid: number, status = 'published', versionNo = 1) => {
  const element = u(50, ++el);
  await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ($1,'snowmoon','design',$2,$3,$4)`, [element, fid, entity, status]);
  if (versionNo > 1) await pg.query(`insert into studio.element_versions (id, element_id, version_no, body) values ($1,$2,1,$3)`, [u(51, el), element, JSON.stringify(body)]);
  await pg.query(`insert into studio.element_versions (id, element_id, version_no, body) values ($1,$2,$3,$4)`, [versionId, element, versionNo, JSON.stringify(body)]);
  return element;
};
const front = (n: number) => ({ front: { url: `https://pictures.snowmoon.party/images/readers/sheet-${n}.jpg`, sha256: sha(n) } });
for (const n of [11, 12, 13, 14, 21, 22, 23, 24, 25]) BYTES.set(sha(n), await jpeg(n * 7, n < 20 ? 576 : 1024, n < 20 ? 768 : 576));
await design(ent.zei, ID.sheet, { title: 'Zei, travelling', text: 'x', samples: [], views: front(11), by_name: 'naaate' }, 6786);
await design(ent.autobus, ID.place, { title: 'The autobus', text: 'x', samples: [], views: front(12), by_name: 'garance' }, GARANCE);
await design(ent.zei, ID.base, { title: 'Zei base', text: 'x', samples: [], views: front(13), by_name: 'naaate' }, 6786);
const hiddenSheetEl = await design(ent.bai, ID.hiddenSheet, { title: 'Bai', text: 'x', samples: [], views: front(14), by_name: 'someone' }, 77);
await pg.query(`update studio.elements set status = 'hidden' where id = $1`, [hiddenSheetEl]);
await design(ent.s1, ID.styleOffered, { title: CHALLENGE.offeredStyles[1], text: 'Bold inked lines, flat colour, halftone shading.', samples: [], views: {}, by_name: 'naaate' }, 6786, 'published', 2);
await design(ent.s2, ID.styleOther, { title: 'Ink and wash', text: 'Loose ink and grey wash on rough paper.', samples: [], views: {}, by_name: 'garance' }, GARANCE);
await design(ent.s3, ID.styleHidden, { title: 'Hidden style', text: 'Soft pastel.', samples: [], views: {}, by_name: 'someone' }, 77, 'hidden');
await design(ent.s4, ID.styleNamed, { title: 'Named style', text: 'In the style of Studio Ghibli.', samples: [], views: {}, by_name: 'someone' }, 78);
let im = 0;
const image = async (versionId: string, fid: number, byName: string, n: number, params: Record<string, unknown>, status = 'published') => {
  im++;
  const recipe = u(60, im), element = u(61, im);
  await pg.query(`insert into studio.recipes (id, source, provider, model, model_version, prompt, params, seed, cost_usd, created_by_fid) values ($1,'in_app','fal.ai','m','e','p',$2,1,0.01,$3)`, [recipe, JSON.stringify({ by_name: byName, ...params }), fid]);
  await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, status) values ($1,'snowmoon','image',$2,$3)`, [element, fid, status]);
  await pg.query(`insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values ($1,$2,1,'{}',$3,$4,$5)`, [versionId, element, `https://pictures.snowmoon.party/images/readers/${sha(n).slice(0, 16)}.jpg`, sha(n), recipe]);
  return element;
};
await image(ID.remix, 501, 'fixture501', 21, { user_prompt: 'Zei on the roof at dusk', challenge: { character: 'zei', from: ID.base } });
await image(ID.reader, 502, 'fixture502', 22, { user_prompt: 'the snowmoon over the valley' });
await image(ID.hidden, 503, 'fixture503', 23, { user_prompt: 'Zei hidden picture', challenge: { character: 'zei' } }, 'hidden');
await image(ID.draft, 504, 'fixture504', 24, { user_prompt: 'Zei draft' }, 'draft');
const laterEl = await image(ID.hiddenLater, 505, 'fixture505', 25, { user_prompt: 'Bai by the door', challenge: { character: 'bai' } });

const server = new PGLiteSocketServer({ db: pg, port: 54395, host: '127.0.0.1' });
await server.start();
const sql = postgres('postgres://studio_writer@127.0.0.1:54395/postgres', { prepare: false, max: 1 });
await sql`set role studio_writer`;
const S = sql as unknown as Sql;

// L. Links.
const links: [string, string, string][] = [
  [`https://snowmoon.party/challenge/p/${ID.remix}`, ID.remix, 'remix'],
  [`snowmoon.party/image/${ID.reader}`, ID.reader, 'image'],
  [`https://www.snowmoon.party/references/designs/${ID.sheet}/`, ID.sheet, 'design'],
  [`/references/designs/${ID.base.toUpperCase()}`, ID.base, 'design'],
  [`https://snowmoon.party/challenge/make?from=${ID.base}`, ID.base, 'make'],
];
for (const [l, id, page] of links) {
  const p = parseRefLink(l);
  check(`L. ${l} reads to its version (${page})`, p?.id === id && p.page === page, JSON.stringify(p));
}
for (const l of [`https://evil.example/challenge/p/${ID.remix}`, `https://snowmoon.party.evil.example/image/${ID.reader}`, 'javascript:alert(1)', 'not a link at all', '', `https://snowmoon.party/image/not-a-uuid`, `https://snowmoon.party/chapter/3`, `ftp://snowmoon.party/image/${ID.reader}`])
  check(`L. "${l}" is refused`, parseRefLink(l) === null);

// R. Resolving.
const want: [string, string, string, string][] = [
  [ID.remix, 'remix', 'Zei remix', '@fixture501'],
  [ID.reader, 'picture', 'picture', '@fixture502'],
  [ID.base, 'base', 'Zei base', '@naaate'],
  [ID.sheet, 'sheet', 'Zei sheet', '@naaate'],
  [ID.place, 'sheet', 'Autobus sheet', '@garance'],
];
for (const [id, kind, what, by] of want) {
  const r = await resolveReference(S, id);
  check(`R. ${what} resolves: kind ${kind}, by ${by}, its file and sha256`, r.ok && r.ref.kind === kind && r.ref.what === what && r.ref.by === by && /^[0-9a-f]{64}$/.test(r.ref.sha256) && r.ref.url.startsWith('https://pictures.snowmoon.party/'), JSON.stringify(r));
}
for (const [id, reason, words] of [[ID.hidden, 'hidden', REF_WORDING.hidden], [ID.hiddenSheet, 'hidden', REF_WORDING.hidden], [ID.draft, 'unpublished', REF_WORDING.unpublished], [u(99, 9), 'not-found', REF_WORDING.notFound], [ID.styleOther, 'style', REF_WORDING.style]] as const) {
  const r = await resolveReference(S, id);
  check(`R. ${id} is refused as ${reason}, with its words`, !r.ok && r.reason === reason && r.error === words, JSON.stringify(r));
}
{
  const r = await referenceFromLink(S, `https://snowmoon.party/challenge/p/${ID.hidden}`);
  check('R. a pasted link to a hidden remix is refused (hidden)', !r.ok && r.reason === 'hidden');
  const g = await referenceFromLink(S, 'https://example.com/whatever');
  check('R. a pasted garbage link is refused (not-a-link)', !g.ok && g.reason === 'not-a-link' && g.error === REF_WORDING.notALink);
  const ok = await referenceFromLink(S, `https://snowmoon.party/challenge/make?from=${ID.base}`);
  check('R. a base\'s Remix link resolves to the base', ok.ok && ok.ref.kind === 'base');
}
{
  const byMaker = await searchReferences(S, '@fixture50');
  check('R. search by maker finds their published pictures, never the hidden or unpublished one', byMaker.some((x) => x.versionId === ID.remix) && byMaker.some((x) => x.versionId === ID.reader) && !byMaker.some((x) => x.versionId === ID.hidden || x.versionId === ID.draft), byMaker.map((x) => x.versionId).join(','));
  const byChar = await searchReferences(S, 'zei');
  check('R. search by character finds remixes, sheets and bases of Zei', byChar.some((x) => x.versionId === ID.remix) && byChar.some((x) => x.versionId === ID.sheet) && byChar.some((x) => x.versionId === ID.base) && !byChar.some((x) => x.versionId === ID.hidden), byChar.map((x) => `${x.kind}:${x.versionId}`).join(','));
  check('R. a hidden sheet is never a search result', !(await searchReferences(S, 'bai')).some((x) => x.versionId === ID.hiddenSheet));
  check('R. a one-letter search finds nothing', (await searchReferences(S, 'z')).length === 0);
}

// S. The look.
const styles = await styleChoices(S);
const offered = styles.find((s) => s.id === ID.styleOffered);
check('S. the remix challenge\'s published style is listed, marked, at its newest version, with its maker', offered?.challenge === true && offered.versionNo === 2 && offered.by === '@naaate', JSON.stringify(offered));
check('S. a published style by another maker, not the challenge\'s, is listed too', styles.some((s) => s.id === ID.styleOther && !s.challenge && s.by === '@garance'));
check('S. a hidden style is not listed', !styles.some((s) => s.id === ID.styleHidden));
check('S. a style whose words name a studio is not listed (the looks\' no-names rule)', !styles.some((s) => s.id === ID.styleNamed));
check('S. the review page gets the same list', (await adminView(S, US)).styles.length === styles.length);
const consented = async (fid: number) => fid === GARANCE;
let r = await setLook(S, GARANCE, { chapter: null, look: { kind: 'style', id: ID.styleHidden } }, consented);
check('S. saving a hidden style as the look is refused', r.status === 400 && /hidden/.test(String(r.json.error)), JSON.stringify(r.json));
r = await setLook(S, GARANCE, { chapter: null, look: { kind: 'style', id: ID.styleNamed } }, consented);
check('S. saving a style that names a studio is refused', r.status === 400);
r = await setLook(S, GARANCE, { chapter: null, look: { kind: 'line', text: 'Soft pastel, like Pixar.' } }, consented);
check('S. a written look naming a studio is refused', r.status === 400 && /artist, studio or film/.test(String(r.json.error)), JSON.stringify(r.json));
r = await setLook(S, GARANCE, { chapter: null, look: { kind: 'style', id: ID.styleOther } }, consented);
const saved = (await latestLooks(S)).all?.look;
check('S. any published style saves as the look, with its version id, version and maker', r.status === 200 && saved?.kind === 'style' && saved.versionId === ID.styleOther && saved.versionNo === 1 && saved.by === '@garance', JSON.stringify(saved));
check('S. the look is named with its version and maker', lookName(saved ?? null) === 'Ink and wash, version 1, by @garance', lookName(saved ?? null));

// Stand-ins for the model and the bucket.
const calls: { kind: string; model?: string; refs?: Buffer[]; prompt?: string }[] = [];
let shade = 20;
const made = async (m: { open: boolean }) => ({ bytes: await jpeg((shade += 17) % 255), contentType: 'image/jpeg', seed: null, requestId: 'stand-in', nsfw: false, costUsd: m.open ? 0.012 : 0.0478, settings: { stand_in: true } });
const SHOWN = await jpeg(3);
const deps: Deps = {
  reference: async (url, s) => (url.includes('media.snowmoon.party') ? SHOWN : (BYTES.get(s) ?? null)),
  makeOpen: async (prompt) => (calls.push({ kind: 'open', prompt }), made({ open: true })),
  makeClosed: async (m, prompt, ref) => (calls.push({ kind: 'closed', model: m.id, prompt, refs: [ref] }), made(m)),
  makeAdded: async (m, prompt, refs) => (calls.push({ kind: 'multi', model: m.id, prompt, refs }), made(m)),
  putPublic: async (s) => `https://pictures.snowmoon.party/images/readers/${s.slice(0, 32)}.jpg`,
  storageReady: () => true,
  handleFor: async (fid) => (fid === GARANCE ? 'garance' : null),
  paid: async (_s, _f, _r, j) => ({ ok: true, made: await j.make(), left: 100 }),
  consented,
  sheets: async (_sql, chapter) => (chapter === 3 ? [{ slug: 'zei', name: 'Zei', versionId: ID.sheet, url: 'https://pictures.snowmoon.party/images/readers/sheet-11.jpg', sha256: sha(11), by: '@naaate', byFid: 6786 }, { slug: 'bai', name: 'Bai', versionId: u(40, 9), url: 'https://pictures.snowmoon.party/images/readers/sheet-11.jpg', sha256: sha(11), by: '@someone', byFid: 9 }] : []),
};
const req = new Request('http://localhost/api/you/illustrations/add', { method: 'POST' });
const notice = { version: CLOSED_PROVIDERS.OpenAI.noticeVersion, adult: true };
const addBody = (picked: string[], characters: string[] = []) => ({ chapter: 3, after: 42, start: 40, end: 42, note: 'Zei at the window, the city below.', model: 'gpt-image-2.5-sunburst', notice, characters, picked });

// C. The cap.
check('C. an added picture: three minus its sheets; a redo: two', pickLimit(3, 'add', 0) === 3 && pickLimit(3, 'add', 2) === 1 && pickLimit(3, 'add', 3) === 0 && pickLimit(3, 'redo', 0) === 2);
r = await addPicture(S, GARANCE, req, addBody([ID.remix, ID.reader], ['zei', 'bai']), US, deps);
check('C. two sheets and two picked (four in all) is refused, and nothing is made', r.status === 400 && r.json.reason === 'too-many' && !calls.length, JSON.stringify(r.json));
r = await addPicture(S, GARANCE, req, addBody([ID.remix, ID.reader, ID.place, ID.base]), US, deps);
check('C. four picked with no sheet is refused', r.status === 400 && r.json.reason === 'too-many');
r = await addPicture(S, GARANCE, req, addBody([ID.remix, ID.remix]), US, deps);
check('C. the same picture twice is refused', r.status === 400 && r.json.reason === 'twice');
// The redo checks use the edition's job test:chapter-pictures uses (a committed picture with no lettering).
const redoJob = checkJob('c1-b005-toy-drone')?.image ? 'c1-b005-toy-drone' : null;

// M. Make.
r = await addPicture(S, GARANCE, req, addBody([ID.hidden]), US, deps);
check('M. a hidden picture is refused at Make (409), whatever the sheet showed', r.status === 409 && r.json.reason === 'hidden' && !calls.length, JSON.stringify(r.json));
r = await addPicture(S, GARANCE, req, addBody([ID.remix, ID.place], ['zei']), US, deps);
const call = calls.at(-1);
check('M. one sheet and two picked: made, three pictures sent in order (the sheet first), each by its sha256', r.status === 200 && call?.kind === 'multi' && call.refs?.length === 3 && call.refs[0] === BYTES.get(sha(11)) && call.refs[1] === BYTES.get(sha(21)) && call.refs[2] === BYTES.get(sha(12)), JSON.stringify(r.json));
check('M. the prompt numbers the pictures and says what each is, naming no maker', /Reference picture 1 is the character sheet of Zei/.test(call?.prompt ?? '') && /Reference picture 2 is a Zei remix; reference picture 3 is an Autobus sheet: use them as the note says\./.test(call?.prompt ?? '') && !/fixture501|garance|naaate|@/.test(call?.prompt ?? ''), call?.prompt);
check('M. the look\'s words are in the prompt', (call?.prompt ?? '').includes('Loose ink and grey wash on rough paper.'));
const addedJob = String(r.json.jobId), addedVersion = String(r.json.versionId);
const [row] = await sql<{ recipe: Record<string, any> }[]>`select recipe from studio.chapter_picture_versions where id = ${addedVersion}`; // eslint-disable-line @typescript-eslint/no-explicit-any
const rec = row.recipe;
check('M. the recipe lists each picked picture: version id, kind, maker, sha256, page', rec.picked?.length === 2 && rec.picked[0].versionId === ID.remix && rec.picked[0].kind === 'remix' && rec.picked[0].by === '@fixture501' && rec.picked[0].sha256 === sha(21) && rec.picked[0].href === `/challenge/p/${ID.remix}` && rec.picked[1].kind === 'sheet', JSON.stringify(rec.picked));
check('M. the recipe\'s sheet reference names its maker and kind', rec.references?.[0]?.by === '@naaate' && rec.references[0].kind === 'sheet');
check('M. the recipe names the look\'s version and maker', rec.parts.look.versionNo === 1 && rec.parts.look.by === '@garance' && /Ink and wash”, version 1, by @garance/.test(rec.assist.look), JSON.stringify(rec.assist));
check('M. the recipe has the picked line as its own part', /Reference picture 2 is a Zei remix/.test(rec.parts.refs ?? ''));
if (redoJob) {
  const n = calls.length;
  r = await redoPicture(S, GARANCE, req, { jobId: redoJob, note: 'Make it night.', model: 'gpt-image-2.5-sunburst', notice, picked: [ID.remix, ID.reader, ID.base] }, US, deps);
  check('C. a redo with three picked (four pictures with the one shown now) is refused', r.status === 400 && r.json.reason === 'too-many' && calls.length === n);
  r = await redoPicture(S, GARANCE, req, { jobId: redoJob, note: 'Make it night.', model: 'gpt-image-2.5-sunburst', notice, picked: [ID.remix, ID.base] }, US, deps);
  const c = calls.at(-1);
  check('M. a redo with two picked: the picture shown now first, then the two, through the multi-picture path', r.status === 200 && c?.kind === 'multi' && c.refs?.length === 3 && c.refs[0] === SHOWN && c.refs[2] === BYTES.get(sha(13)), JSON.stringify(r.json));
  check('M. the redo\'s prompt names reference picture 1 as the picture to redraw, and what 2 and 3 are', /^Redraw reference picture 1 as this scene/.test(c?.prompt ?? '') && /Reference picture 2 is a Zei remix; reference picture 3 is a Zei base/.test(c?.prompt ?? ''), c?.prompt);
  r = await redoPicture(S, GARANCE, req, { jobId: redoJob, note: 'Make it night.', model: 'flux2-klein-4b-edit' }, US, deps);
  check('M. a redo with none picked is made as before (one picture, the open model\'s own call)', r.status === 200 && calls.at(-1)?.kind === 'open' && /^Redraw the reference picture as this scene/.test(calls.at(-1)?.prompt ?? ''));
} else check('M. a redoable job exists for the redo checks', false);

// K. Keep, and the caption.
r = await showPicture(S, GARANCE, { jobId: addedJob, versionId: addedVersion }, deps);
let shown = (await readReplacements(S)).get(addedJob);
check('K. kept: the caption credits each maker, the sheet first', r.status === 200 && addedBy(shown!) === 'Added by @garance, after @naaate’s Zei sheet, @fixture501’s Zei remix and @garance’s Autobus sheet', shown ? addedBy(shown) : JSON.stringify(r.json));
// A reference hidden between the draft and Keep: a second draft, then its remix is hidden, then Keep.
r = await addPicture(S, GARANCE, req, { jobId: addedJob, note: 'Bai by the door.', model: 'flux2-klein-4b-edit', picked: [ID.hiddenLater] }, US, deps);
const second = String(r.json.versionId);
await pg.query(`update studio.elements set status = 'hidden' where id = $1`, [laterEl]);
r = await showPicture(S, GARANCE, { jobId: addedJob, versionId: second }, deps);
check('K. a reference hidden since the draft stops Keep (409), naming it, and nothing changes', r.status === 409 && r.json.reason === 'reference-hidden' && String(r.json.error).includes('@fixture505’s Bai remix') && (await readReplacements(S)).get(addedJob)?.versionId === addedVersion, JSON.stringify(r.json));
r = await showPicture(S, GARANCE, { jobId: addedJob, versionId: second, keepHidden: true }, deps);
shown = (await readReplacements(S)).get(addedJob);
check('K. "Keep it anyway" keeps it; its caption says "a picture since hidden", with no name', r.status === 200 && shown?.versionId === second && addedBy(shown) === 'Added by @garance, after a picture since hidden', shown ? addedBy(shown) : '');
const pub = await publicRecipe(S, second);
const pubText = JSON.stringify(pub);
check('K. the public recipe keeps the hidden picture\'s kind and sha256 but not its maker, page, id or address', Boolean(pub) && pubText.includes(sha(25)) && !pubText.includes('fixture505') && !pubText.includes(ID.hiddenLater) && !pubText.includes(sha(25).slice(0, 16) + '.jpg'), pubText.slice(0, 300));
const pubFirst = JSON.stringify(await publicRecipe(S, addedVersion));
check('K. a published reference stays named in the public recipe', pubFirst.includes('@fixture501') && pubFirst.includes(ID.remix));
// The look hidden after it was saved stops Make.
await pg.query(`update studio.elements set status = 'hidden' where id = (select element_id from studio.element_versions where id = $1)`, [ID.styleOther]);
r = await addPicture(S, GARANCE, req, addBody([]), US, deps);
check('S. a look hidden after it was saved stops Make, saying so', r.status === 409 && r.json.reason === 'look-hidden' && /Ink and wash/.test(String(r.json.error)), JSON.stringify(r.json));

// F. The caption's wording.
const C = (what: string, by: string, hidden = false) => ({ what, by, hidden });
const forms: [ReturnType<typeof C>[], string][] = [
  [[C('Zei remix', '@garance')], 'after @garance’s Zei remix'],
  [[C('Zei remix', '@garance'), C('Bai base', '@naaate')], 'after @garance’s Zei remix and @naaate’s Bai base'],
  [[C('Zei remix', '@garance'), C('Bai sheet', '@garance')], 'after @garance’s Zei remix and Bai sheet'],
  [[C('Zei remix', '@garance'), C('Bai sheet', '@garance'), C('Zei base', '@naaate')], 'after @garance’s Zei remix and Bai sheet, and @naaate’s Zei base'],
  [[C('Zei remix', '@a'), C('picture', 'FID 12'), C('Bai base', '0xab…cd')], 'after @a’s Zei remix, FID 12’s picture and 0xab…cd’s Bai base'],
  [[C('Zei remix', '@a', true), C('Bai base', '@b')], 'after a picture since hidden and @b’s Bai base'],
  [[C('Zei remix', '@a', true), C('Bai base', '@b', true)], 'after two pictures since hidden'],
  [[], ''],
];
for (const [cs, want] of forms) check(`F. "${want || '(none)'}"`, creditLine(cs) === want, creditLine(cs));

// P. P5j, P5b, and planted faults.
const src = (dir: string): { file: string; text: string }[] =>
  readdirSync(path.join(ROOT, dir), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: path.join(dir, f), text: readFileSync(path.join(ROOT, dir, f), 'utf8') }));
const files = src('src');
check('P. P5j passes on the real files (writes only in admin.ts; references.ts and after-hide.ts only read)', p5jProblems(files).length === 0, p5jProblems(files).join('; '));
check('P. P5b still passes on the real files', p5bProblems(files).length === 0, p5bProblems(files).join('; '));
for (const [name, plant] of Object.entries(P5J_PLANTS)) {
  const withPlant = name === 'elsewhere' ? [...files, plant] : [...files.filter((f) => f.file !== plant.file), plant];
  check(`P. P5j still catches the planted fault "${name}"`, p5jProblems(withPlant).length > 0);
}
check('P. P5j catches a planted write to the chapter pictures from the references file', p5jProblems([...files.filter((f) => !f.file.endsWith('references.ts')), { file: 'src/lib/chapter-pictures/references.ts', text: "await sql`insert into studio.chapter_picture_versions ${sql(v)}`;" }]).length > 0);

// The rules each planted fault must break.
const resolverProblems = (text: string) => [/if \(r\.status === 'hidden'\) return refuse\('hidden'\);/, /if \(r\.status !== 'published'\) return refuse\('unpublished'\);/].filter((re) => !re.test(text)).map((re) => `resolveReference lacks ${re}`);
const refsText = readFileSync(path.join(ROOT, 'src/lib/chapter-pictures/references.ts'), 'utf8');
check('P. the resolver refuses hidden and unpublished pictures', resolverProblems(refsText).length === 0);
check('P. planted: a resolver that ignores hides is caught', resolverProblems(refsText.replace("if (r.status === 'hidden') return refuse('hidden');", '')).length > 0);
const capProblems = (f: typeof pickLimit) => [[3, 'add', 2, 1], [3, 'add', 0, 3], [3, 'redo', 0, 2], [3, 'add', 3, 0]].filter(([m, mode, s, w]) => f(m as number, mode as 'add', s as number) !== w).map((x) => `cap ${x.join(',')}`);
check('P. the cap counts the sheets and the picture shown now', capProblems(pickLimit).length === 0);
check('P. planted: a cap that ignores the sheets is caught', capProblems((m) => m).length > 0);
const creditProblems = (f: typeof creditLine) => (/@a/.test(f([C('Zei remix', '@a', true)])) ? ['a hidden picture\'s maker is named'] : []);
check('P. the caption never names a hidden picture\'s maker', creditProblems(creditLine).length === 0);
check('P. planted: a credit that names a hidden picture\'s maker is caught', creditProblems((cs) => `after ${cs.map((c) => `${c.by}’s ${c.what}`).join(' and ')}`).length > 0);
const sample = { ...rec, picked: [{ versionId: ID.hiddenLater, kind: 'remix', what: 'Bai remix', by: '@fixture505', byFid: 505, href: '/challenge/p/x', url: 'https://pictures.snowmoon.party/images/readers/x.jpg', sha256: sha(25) }] } as never;
const redactProblems = (f: typeof withoutHidden) => (/fixture505|x\.jpg/.test(JSON.stringify(f(sample, () => false))) ? ['a hidden picture stays named'] : []);
check('P. the public recipe drops a hidden picture\'s maker and address', redactProblems(withoutHidden).length === 0);
check('P. planted: a recipe that keeps a hidden picture\'s address is caught', redactProblems((x) => x).length > 0);
const keepProblems = (text: string) => ((text.match(/const gone = await hiddenSince\(sql, v\);/g) ?? []).length === 2 ? [] : ['a Keep path without the hidden-since check']);
const picturesText = readFileSync(path.join(ROOT, 'src/lib/chapter-pictures/pictures.ts'), 'utf8');
check('P. both Keep paths (a redo, an added picture) check the references again', keepProblems(picturesText).length === 0);
check('P. planted: a Keep without the check is caught', keepProblems(picturesText.replace('const gone = await hiddenSince(sql, v);', '')).length > 0);
check('P. the looks\' names list is the published styles\' own (scripts/lib/publish-style.ts NAMES)', LOOK_NAMES.source === NAMES.source && LOOK_NAMES.flags === NAMES.flags);
check('P. planted: a looser names list is caught', /^\\b\(studio ghibli\|ghibli\)\\b$/.source !== NAMES.source);
check('P. the names rule catches "in the style of" and a studio', namesAWork('in the style of somebody') !== null && namesAWork('soft Pixar look') !== null && namesAWork('loose ink and wash') === null);
check('P. the new route answers anyone not an admin with 404', /if \(!isAdmin\(fid\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(readFileSync(path.join(ROOT, 'src/app/api/you/illustrations/references/route.ts'), 'utf8')));
{
  const mod = await import(path.join(ROOT, 'src/app/api/you/illustrations/references/route.ts'));
  const res = await mod.GET(new Request('http://localhost/api/you/illustrations/references?q=zei'));
  check('P. the new route signed out: 401', res.status === 401, String(res.status));
}
for (const f of ['src/app/api/images/[id]/hide/route.ts', 'src/app/api/images/[id]/report/route.ts', 'src/app/api/moderate/route.ts', 'src/app/api/admin/hide/route.ts'])
  check(`P. ${f}: a hide reaches the captions of chapter pictures made after it`, readFileSync(path.join(ROOT, f), 'utf8').includes('await hideReachesChapterPictures(sql, el.elementId);'));

await sql.end();
await server.stop();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
