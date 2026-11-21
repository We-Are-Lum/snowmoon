/**
 * A picture an admin added reaches the places a kept redo already does (owner, 2026-11-21; branch added-everywhere).
 * One check per point:
 *  K. a kept added picture shows on each surface it is meant for, credited ("Added by @garance", the time, the model
 *     with its maker) with its recipe: quote cards (the share page, the card image's line, saved cards), the share
 *     sheet's starting picture, the place sheet of its passage's scene, the character sheet whose picture was sent with
 *     it, References' cards for those terms, and the pick switch's options (its moment's and those terms');
 *  O. what it is left out of: the introduction's cards (fixed edition pictures), and a character sheet whose
 *     character its passage only names;
 *  L. the latest decision wins: a second keep replaces the first everywhere;
 *  T. take it off the chapter: gone everywhere (a card naming it is drawn with none); show it again: back everywhere;
 *  H. a hide wins over a keep, everywhere (and the admins' review still lists it, marked);
 *  N. no database (none configured, or one that can't be reached): no added picture anywhere, the committed ones show;
 *  W. keep, take-off and show-again revalidate every page it now reaches, and the tag; a hide the same paths;
 *  S. every reader of the edition's pictures reads the additions where intended, and leaves them out where not (a
 *     static check, with planted faults that must fail).
 *
 *   npm run test:added-everywhere
 *
 * In-memory Postgres (PGlite, every migration, 0042 and 0043 included), reached through the site's own db(). No
 * network, no model, no bucket: the pictures' files are stand-in addresses. Writes go through admin.ts only.
 */
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};

const ADDED = 'c1-b089-added-0a1b2c3d'; // after ¶ of block 89, passage 89–90: names Gladias, in the autobus's scene
const NAMED_ONLY = 'c1-b089-added-4e5f6a7b'; // the same passage, no sheet sent
const EDITION_AT = 'c1-b089-autobus'; // the edition's picture at the same block
const INTRO_JOB = 'c1-b005-toy-drone';

/** What every surface shows for the added pictures, in one object (the parent and the no-database children alike). */
async function quickSurfaces() {
  const { introShown, quoteShown } = await import('../src/lib/seeded-shown');
  const { resolveQuote } = await import('../src/lib/quote');
  const quote = await quoteShown(resolveQuote(1, '89-90', null, ADDED));
  return { quote: quote?.image ? { url: quote.image.url, recipe: quote.image.recipe, replaced: quote.image.replaced ?? null } : null, introIds: (await introShown()).cards.map((c) => c.image?.id ?? null) };
}
async function surfaces() {
  const { introShown, quoteShown } = await import('../src/lib/seeded-shown');
  const { resolveQuote } = await import('../src/lib/quote');
  const intro = await introShown();
  const quote = await quoteShown(resolveQuote(1, '89-90', null, ADDED));
  const q = quote?.image ? { url: quote.image.url, recipe: quote.image.recipe, replaced: quote.image.replaced ?? null } : null;
  const introIds = intro.cards.map((c) => c.image?.id ?? null);
  const { sheetImages } = await import('../src/lib/images/sheet-images');
  const { referenceCards } = await import('../src/lib/references');
  const { momentOptions, termOptions } = await import('../src/lib/pick-options');
  const pick = <T extends { key: string }>(xs: T[], k: string) => xs.find((x) => x.key === k) ?? null;
  const autobusSheet = await sheetImages('place', 'autobus', 'Autobus');
  const gladiasSheet = await sheetImages('character', 'gladias', 'Gladias');
  const cards = await referenceCards();
  const moment = (await momentOptions(1)).get(89) ?? [];
  const termAutobus = await termOptions('autobus');
  const termGladias = await termOptions('gladias');
  const s = (x: { url: string; redone?: unknown } | null) => x && { url: x.url, redone: (x.redone ?? null) as never };
  return {
    quote: q,
    introIds,
    autobus: s(pick(autobusSheet, ADDED)),
    autobusOrder: autobusSheet.filter((i) => !i.reader).map((i) => i.key),
    autobusNamedOnly: s(pick(autobusSheet, NAMED_ONLY)),
    gladias: s(pick(gladiasSheet, ADDED)),
    gladiasNamedOnly: s(pick(gladiasSheet, NAMED_ONLY)),
    refAutobusTotal: cards.find((c) => c.slug === 'autobus')?.total ?? 0,
    refGladiasTotal: cards.find((c) => c.slug === 'gladias')?.total ?? 0,
    refAutobus: s(pick(cards.find((c) => c.slug === 'autobus')?.images ?? [], ADDED)),
    moment: s(pick(moment, ADDED)),
    momentKinds: moment.filter((o) => o.kind === 'seeded').map((o) => o.key),
    termAutobus: s(pick(termAutobus, ADDED)),
    termGladias: s(pick(termGladias, ADDED)),
  };
}
type Surfaces = Awaited<ReturnType<typeof surfaces>>;

if (process.argv.includes('--child')) {
  console.log(JSON.stringify(process.argv.includes('--quick') ? await quickSurfaces() : await surfaces()));
  process.exit(0);
}

const { PGlite } = await import('@electric-sql/pglite');
const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const PORT = 54603;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;

const { db } = await import('../src/lib/db');
const sql = db()!;
await sql`set role studio_writer`;
type Sql = Parameters<typeof import('../src/lib/chapter-pictures/admin').saveVersion>[0];
const S = sql as unknown as Sql;
const { saveVersion, saveDecision, saveAddition } = await import('../src/lib/chapter-pictures/admin');
const { recipePath, cardPictureLine, isAddedId } = await import('../src/lib/chapter-pictures/shared');
const { forgetHidden } = await import('../src/lib/admin-hidden');
const { pathsFor } = await import('../src/lib/chapter-pictures/where');
const { startingImage } = await import('../src/lib/share-image');
const { loadIllustrationById } = await import('../src/lib/illustrations');
const { momentOptions } = await import('../src/lib/pick-options');

const GARANCE = 193912;
const MODEL = 'GPT Image 2.5 Sunburst, a closed model by OpenAI';
const refs = (sheets: string[]) => sheets.map((s) => ({ sheet: s, name: s, versionId: '00000009-0000-4000-8000-0000000000bb', url: 'https://pictures.snowmoon.party/x.jpg', sha256: 's'.repeat(64) }));

async function draft(job: string, n: number, sheets: string[]) {
  const sha = String(n).repeat(64).slice(0, 64);
  return saveVersion(S, GARANCE, {
    jobId: job, chapter: 1, model: 'gpt-image-2.5-sunburst', maker: 'OpenAI', open: false, look: null, note: `Stand-in note ${n}: Gladias on the autobus.`,
    prompt: `Stand-in note ${n}: Gladias on the autobus.`, recipe: { v: 1, kind: 'chapter-picture', job, prompt: 'p', sha256: sha, references: refs(sheets), added: { after: 89, start: 89, end: 90 } } as never,
    sha256: sha, width: 1536, height: 1024, jpeg: Buffer.alloc(200, n), costUsd: 0.05,
  });
}
const urlOf = (n: number) => `https://pictures.snowmoon.party/images/readers/added-stand-in-${n}.jpg`;
async function keep(job: string, id: string, n: number) {
  await saveDecision(S, GARANCE, { jobId: job, chapter: 1, versionId: id, action: 'keep', publicUrl: urlOf(n), byHandle: 'garance' });
}
const credited = (x: { by?: string; at?: string; model?: string; versionId?: string; view?: { file: string } } | null | undefined, id: string) =>
  !!x && x.by === 'Added by @garance' && x.model === MODEL && x.versionId === id && !Number.isNaN(Date.parse(x.at ?? '')) && (!x.view || x.view.file === recipePath(id));

// Before: the additions exist (written at the first draft) but nothing is kept.
await saveAddition(S, GARANCE, { jobId: ADDED, chapter: 1, after: 89, start: 89, end: 90 });
await saveAddition(S, GARANCE, { jobId: NAMED_ONLY, chapter: 1, after: 89, start: 89, end: 90 });
const v1 = await draft(ADDED, 1, ['gladias']);
const vNamed = await draft(NAMED_ONLY, 2, []);
const before = await surfaces();
const SURFACES = ['quote', 'autobus', 'gladias', 'refAutobus', 'moment', 'termAutobus', 'termGladias'] as const;
check('D. a draft (never kept) shows nowhere; a card naming it is drawn with no picture', SURFACES.every((k) => before[k] === null), JSON.stringify(before));

// K. Kept: each surface.
await keep(ADDED, v1, 1);
await keep(NAMED_ONLY, vNamed, 2);
const kept = await surfaces();
check('K. quote card (share page, card image, saved cards) shows it', kept.quote?.url === urlOf(1), JSON.stringify(kept.quote));
check('K. ... credited "Added by @garance" · time · "…, a closed model by OpenAI", with its recipe at /api/chapter-pictures/<version>', credited(kept.quote?.replaced, v1) && kept.quote?.recipe === recipePath(v1));
const line = cardPictureLine(kept.quote!.replaced!);
check('K. ... the card image\'s line: "IMAGE ADDED BY @GARANCE · <date, UTC> · GPT IMAGE 2.5 SUNBURST, A CLOSED MODEL BY OPENAI"', /^IMAGE ADDED BY @GARANCE · \d{1,2} [A-Z]{3} \d{4} · GPT IMAGE 2\.5 SUNBURST, A CLOSED MODEL BY OPENAI$/.test(line), line);
const lateUtc = cardPictureLine({ by: 'Added by @garance', at: '2026-11-21T23:30:00Z', model: MODEL });
check('K. ... the date is UTC\'s (23:30 UTC on 21 Nov stays 21 NOV 2026)', lateUtc.includes('21 NOV 2026'), lateUtc);
check('K. the autobus place sheet (its passage\'s scene) shows it, credited', kept.autobus?.url === urlOf(1) && credited(kept.autobus?.redone, v1), JSON.stringify(kept.autobus));
check('K. ... in book order, after the edition\'s picture at the same block', kept.autobusOrder.indexOf(ADDED) === kept.autobusOrder.indexOf(EDITION_AT) + 1, kept.autobusOrder.join(','));
check('K. Gladias\'s sheet (her sheet picture was sent with it) shows it, credited', kept.gladias?.url === urlOf(1) && credited(kept.gladias?.redone, v1));
check('K. References: "autobus" and "gladias" each count it', kept.refAutobusTotal === before.refAutobusTotal + 2 && kept.refGladiasTotal === before.refGladiasTotal + 1, `${before.refAutobusTotal}->${kept.refAutobusTotal}, ${before.refGladiasTotal}->${kept.refGladiasTotal}`);
check('K. ... and the "autobus" card shows it among its first three, credited', kept.refAutobus?.url === urlOf(1) && credited(kept.refAutobus?.redone, v1), JSON.stringify(kept.refAutobus));
check('K. the pick switch: its moment (c1-b89) offers it, kind "seeded", credited, after the edition\'s', kept.moment?.url === urlOf(1) && credited(kept.moment?.redone, v1) && kept.momentKinds[0] === EDITION_AT && kept.momentKinds.includes(ADDED), kept.momentKinds.join(','));
check('K. ... the terms "autobus" and "gladias" offer it, credited', credited(kept.termAutobus?.redone, v1) && credited(kept.termGladias?.redone, v1));
// The share sheet's starting picture (src/lib/share-image.ts).
const ims = [{ id: 'c1-b082-snatch', idx: 82, url: '', alt: '' }, { id: EDITION_AT, idx: 89, url: '', alt: '' }, { id: ADDED, idx: 89, url: '', alt: '', added: true as const }];
check('K. share sheet: a passage that includes its block starts with it (over the edition\'s picture at that block)', startingImage(ims, 89, 90)?.id === ADDED);
check('K. ... a passage that ends at its block starts with it (over the nearest earlier edition picture)', startingImage(ims, 86, 89)?.id === ADDED);
check('K. ... a passage before every picture, ending at its block: it, not none', startingImage([ims[2]], 88, 89)?.id === ADDED);
check('K. ... a passage after it keeps today\'s rule (the last edition picture at or before its start)', startingImage(ims, 90, 91)?.id === EDITION_AT);
check('K. ... a passage before it keeps today\'s rule', startingImage(ims, 83, 85)?.id === 'c1-b082-snatch');
// Saved cards.
const { cardSpec, saveCard, getCard, CardError } = await import('../src/lib/cards');
const made = cardSpec({ chapter: 1, range: '89-90', img: ADDED });
check('K. a saved card records the added picture by its id', made.spec.img === ADDED);
const saved = await saveCard(4242, made.spec, made.quote);
const card = await getCard(saved.versionId);
check('K. ... and shows it, credited, with its card image naming it', card?.quote.image?.url === urlOf(1) && credited(card?.quote.image?.replaced, v1) && /img=c1-b089-added-0a1b2c3d/.test(card?.cardUrl ?? ''), JSON.stringify(card?.quote.image ?? null));
const { resolveQuote } = await import('../src/lib/quote');
check('K. a link naming another chapter\'s added picture is no card (as for an edition picture of another chapter)', resolveQuote(1, '89-90', null, 'c2-b089-added-0a1b2c3d') === null && resolveQuote(1, '89-90') !== null);

// O. Left out.
check('O. the introduction\'s cards are unchanged (fixed edition pictures; none is ever added there)', JSON.stringify(kept.introIds) === JSON.stringify(before.introIds) && kept.introIds.includes(INTRO_JOB) && !kept.introIds.some((i) => i && isAddedId(i)));
check('O. a picture whose passage only names Gladias (no sheet sent) is not on her sheet', kept.gladiasNamedOnly === null);
check('O. ... but is on its scene\'s place sheet', kept.autobusNamedOnly?.url === urlOf(2));

// L. The latest decision wins.
const v3 = await draft(ADDED, 3, ['gladias']);
await keep(ADDED, v3, 3);
const later = await surfaces();
check('L. a second keep replaces the first on every surface', SURFACES.every((k) => later[k]?.url === urlOf(3)), JSON.stringify(SURFACES.map((k) => later[k]?.url)));
check('L. ... credited to the new version', credited(later.quote?.replaced, v3) && credited(later.moment?.redone, v3));
check('L. the saved card follows it', (await getCard(saved.versionId))?.quote.image?.url === urlOf(3));

// T. Take it off the chapter, then show it again.
await saveDecision(S, GARANCE, { jobId: ADDED, chapter: 1, versionId: null, action: 'restore', publicUrl: null, byHandle: 'garance' });
const off = await surfaces();
check('T. take it off: gone from every surface', SURFACES.every((k) => off[k] === null), JSON.stringify(SURFACES.map((k) => off[k])));
check('T. ... a saved card naming it is drawn with no picture (the card stays)', (await getCard(saved.versionId))?.quote.image === null);
check('T. ... References count it no more', off.refAutobusTotal === before.refAutobusTotal + 1 && off.refGladiasTotal === before.refGladiasTotal);
let refused = false;
try {
  await saveCard(4243, made.spec, made.quote);
} catch (e) {
  refused = e instanceof CardError && e.status === 400;
}
check('T. ... and a new card can\'t be saved with it', refused);
await saveDecision(S, GARANCE, { jobId: ADDED, chapter: 1, versionId: v1, action: 'restore', publicUrl: urlOf(1), byHandle: 'garance' });
const again = await surfaces();
check('T. show it again (an earlier version, in one step): back on every surface, that version', SURFACES.every((k) => again[k]?.url === urlOf(1)) && credited(again.quote?.replaced, v1));

// H. A hide wins.
await sql`insert into studio.seeded_hidden ${sql({ image_id: ADDED, by_fid: GARANCE })}`;
forgetHidden();
const hidden = await surfaces();
check('H. a hidden added picture is gone from every surface, kept or not', SURFACES.every((k) => hidden[k] === null), JSON.stringify(SURFACES.map((k) => hidden[k])));
check('H. ... the saved card is drawn with no picture', (await getCard(saved.versionId))?.quote.image === null);
const review = (await momentOptions(1, { withHidden: true })).get(89)?.find((o) => o.key === ADDED);
check('H. ... the admins\' review still lists it, marked hidden', review?.hidden === true);
await sql`reset role`;
await sql`delete from studio.seeded_hidden where image_id = ${ADDED}`;
await sql`set role studio_writer`;
forgetHidden();
check('H. (unhidden by the test database\'s owner: back)', (await surfaces()).quote?.url === urlOf(1));

// N. No database.
const child = async (env: NodeJS.ProcessEnv, quick = false) =>
  JSON.parse((await promisify(execFile)(process.execPath, ['--import', 'tsx', '--conditions=react-server', path.join(ROOT, 'scripts/test-added-everywhere.ts'), '--child', ...(quick ? ['--quick'] : [])], { cwd: ROOT, env, encoding: 'utf8', timeout: 120_000 })).stdout.trim().split('\n').pop()!) as Surfaces;
const { STUDIO_DATABASE_URL: _unused, ...noDb } = process.env;
void _unused;
const none = await child(noDb);
check('N. no database configured: no added picture anywhere', SURFACES.every((k) => none[k] === null), JSON.stringify(none));
check('N. ... and the committed pictures show (introduction, the autobus sheet\'s edition picture)', JSON.stringify(none.introIds) === JSON.stringify(before.introIds) && none.autobusOrder.includes(EDITION_AT) && none.momentKinds[0] === EDITION_AT);
const down = await child({ ...noDb, STUDIO_DATABASE_URL: 'postgres://studio_writer@127.0.0.1:1/postgres' }, true);
check('N. a database that can\'t be reached: the quote card has no picture, the introduction is unchanged', down.quote === null && JSON.stringify(down.introIds) === JSON.stringify(before.introIds), JSON.stringify(down));
check('N. a committed picture\'s card is unchanged by any of this', loadIllustrationById(EDITION_AT) !== null);

// W. Revalidation.
const show = readFileSync(path.join(ROOT, 'src/app/api/you/illustrations/show/route.ts'), 'utf8');
const hide = readFileSync(path.join(ROOT, 'src/app/api/admin/hide/route.ts'), 'utf8');
check('W. keep, take-off and show-again (the show route) revalidate the tag that quote cards, sheets, References and picks read additions through', /revalidateTag\(PICTURES_TAG\)/.test(show) && /unstable_cache\(additionsOrThrow, \[[^\]]+\], \{ tags: \[PICTURES_TAG\] \}\)/.test(readFileSync(path.join(ROOT, 'src/lib/chapter-pictures/read.ts'), 'utf8')));
check('W. ... and every path pathsFor names', /for \(const p of pathsFor\(.+\)\) revalidatePath\(p\.path, p\.type\)/.test(show));
check('W. an added picture: its chapter and everything under /references (sheets and glossary)', JSON.stringify(pathsFor(ADDED, 1)) === JSON.stringify([{ path: '/chapter/1' }, { path: '/references', type: 'layout' }]));
check('W. ... never the whole site (it is never in the introduction)', !pathsFor(ADDED, 1).some((p) => p.path === '/'));
check('W. a Hide of an added picture revalidates the same paths', /if \(added\) for \(const p of pathsFor\(added\.jobId, added\.chapter\)\) revalidatePath\(p\.path, p\.type\)/.test(hide));
check('W. the edition\'s pictures are unchanged (intro: whole site; sheet picture: chapter + /references)', JSON.stringify(pathsFor(INTRO_JOB, 1)) === JSON.stringify([{ path: '/', type: 'layout' }]) && JSON.stringify(pathsFor(EDITION_AT, 1)) === JSON.stringify([{ path: '/chapter/1' }, { path: '/references', type: 'layout' }]));
const cardRoute = readFileSync(path.join(ROOT, 'src/app/api/card/[n]/[range]/route.tsx'), 'utf8');
check('W. a card image naming any picture (shown now or not) is kept 10 minutes, never a year', /withImage \|\| sp\.get\('img'\) \? 'public, max-age=600/.test(cardRoute));

// S. Every reader of the edition's pictures reads the additions where intended.
const SEEDED_READ = /\b(loadIllustrations|seededImages|loadIntro|resolveQuote|loadIllustrationById|resolveIntroImage)\(/;
const SOURCES = new Set(['src/lib/illustrations.ts', 'src/lib/intro.ts', 'src/lib/quote.ts', 'src/lib/images/sheets.ts']);
/** Where an added picture must reach, and the call that brings it. */
const READS_ADDITIONS: Record<string, RegExp> = {
  'src/app/chapter/[n]/page.tsx': /addedPictures\(n, await shownAdditions\(\)/,
  'src/lib/seeded-shown.ts': /quoteShown[\s\S]*additionsEverywhere\(\)/,
  'src/lib/images/sheet-images.ts': /additionsEverywhere\(\)[\s\S]*keptAddedPictures\(additions/,
  'src/lib/pick-options.ts': /momentOptions[\s\S]*additionsEverywhere\(\)[\s\S]*addedPictures\(chapter, additions/,
  // Quote cards: through quoteShown (the share page, the card image, saved cards).
  'src/app/share/[n]/[range]/page.tsx': /quoteShown\(resolveQuote\(/,
  'src/app/api/card/[n]/[range]/route.tsx': /quoteShown\(resolveQuote\(/,
  'src/lib/cards.ts': /quoteShown\(/,
};
/** Where it is left out, and why. */
const LEFT_OUT: Record<string, string> = {
  'src/app/api/admin/hide/route.ts': 'not a picture shown to readers: the admin Hide looks the picture up (it reads the addition itself)',
};
const files = readdirSync(path.join(ROOT, 'src'), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: path.join('src', f), text: readFileSync(path.join(ROOT, 'src', f), 'utf8') }));
const introOf = (t: string) => t.slice(t.indexOf('export async function introShown'), t.indexOf('export function introPicture'));
const problems = (fs: { file: string; text: string }[]) => [
  ...fs.filter((f) => SEEDED_READ.test(f.text) && !SOURCES.has(f.file) && !(f.file in LEFT_OUT) && !(f.file in READS_ADDITIONS)).map((f) => `${f.file}: reads the edition's pictures, not listed`),
  ...fs.filter((f) => f.file in READS_ADDITIONS && !READS_ADDITIONS[f.file].test(f.text)).map((f) => `${f.file}: doesn't read the additions`),
  // The introduction shows fixed edition pictures: it must not take one an admin added.
  ...fs.filter((f) => f.file === 'src/lib/seeded-shown.ts' && /addition|added/i.test(introOf(f.text))).map((f) => `${f.file}: the introduction reads additions`),
];
check('S. every reader of the edition\'s pictures reads the additions where intended, and only there', problems(files).length === 0, problems(files).join('; '));
const without = (file: string, re: RegExp | string, by: string) => files.map((f) => (f.file === file ? { ...f, text: f.text.replace(re, by) } : f));
check('S. planted: the sheets stop reading the additions', problems(without('src/lib/images/sheet-images.ts', /additionsEverywhere\(\)/g, 'Promise.resolve([])')).length === 1);
check('S. planted: the moment options stop reading them', problems(without('src/lib/pick-options.ts', /addedPictures\(chapter, additions/, 'void (chapter, additions')).length === 1);
check('S. planted: quoteShown stops reading them', problems(without('src/lib/seeded-shown.ts', /additionsEverywhere\(\)/g, 'Promise.resolve([])')).length === 1);
check('S. planted: a new page shows edition pictures without saying whether additions belong', problems([...files, { file: 'src/app/planted/page.tsx', text: "import { loadIllustrations } from '~/lib/illustrations';\nexport default () => loadIllustrations(1)[0].url;" }]).length === 1);
check('S. planted: the introduction starts reading additions', problems(without('src/lib/seeded-shown.ts', 'const intro = loadIntro();', 'const intro = loadIntro(); void additionsEverywhere;')).length === 1);
// Writes stay in admin.ts (P5j): nothing in this branch's readers writes a chapter-picture table.
const writers = files.filter((f) => /(insert into|update|delete from)\s+studio\.chapter_picture_/i.test(f.text)).map((f) => f.file);
check('S. only src/lib/chapter-pictures/admin.ts writes the chapter-picture tables', JSON.stringify(writers) === JSON.stringify(['src/lib/chapter-pictures/admin.ts']), writers.join(', '));

await sql.end();
await server.stop();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
