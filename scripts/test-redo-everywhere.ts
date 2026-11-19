/**
 * A kept redo reaches every place a chapter picture shows (owner, 2026-11-18/19; branch redo-everywhere). One check per
 * point:
 *  K. a kept redo shows on each surface: the introduction's cards (home, About, every page's "What is this?"), quote
 *     cards and their share pages, References' glossary cards, the place and character sheets, and the pick switch's
 *     options (a moment's and a term's), each with the redo's credit (who, when, the model and its maker) and recipe;
 *  L. the latest decision wins: a second keep replaces the first;
 *  R. a restore brings back the committed file everywhere, with the committed recipe;
 *  H. a hide still wins over a redo;
 *  N. no database (none configured, or one that can't be reached): the committed picture shows everywhere;
 *  W. after a Keep or a Restore the show route revalidates every page the picture is on, and the tag;
 *  S. every reader of seeded pictures goes through the redo (a static check, with a planted fault that must fail).
 *
 *   npm run test:redo-everywhere
 *
 * In-memory Postgres (PGlite, every migration, 0042_chapter_picture_versions included), reached through the site's own
 * db() as the pages reach it. No network, no model, no bucket: the redo's file is a stand-in address.
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

const INTRO_JOB = 'c1-b005-toy-drone'; // on the introduction's cards, and the Kalimar footpaths sheet
const PLACE_JOB = 'c1-b089-autobus'; // on the autobus sheet and the "autobus" References card
const CHARACTER_JOB = 'c1-b132-food-boxes'; // on Gladias's and Zven's sheets

/** What every surface shows for the three pictures, in one object, so the parent and the no-database children compare alike. */
async function surfaces(only?: string[]) {
  const { introShown } = await import('../src/lib/seeded-shown');
  const { quoteShown } = await import('../src/lib/seeded-shown');
  const { resolveQuote } = await import('../src/lib/quote');
  const { sheetImages } = await import('../src/lib/images/sheet-images');
  const { referenceCards } = await import('../src/lib/references');
  const { momentOptions, termOptions } = await import('../src/lib/pick-options');
  if (only) {
    // Only the surfaces that read nothing but the hides and the redos (the unreachable-database run: readers' images
    // wait out the connection's own limits there, src/lib/db.ts, which is not what this checks).
    const intro = await introShown();
    const introCard = intro.cards.find((c) => c.image?.id === INTRO_JOB)?.image ?? null;
    const quote = await quoteShown(resolveQuote(1, '4', null, INTRO_JOB));
    return { intro: introCard && { url: introCard.url, redone: introCard.redone ?? null }, quote: quote?.image ? { url: quote.image.url, recipe: quote.image.recipe, replaced: quote.image.replaced ?? null } : null };
  }
  const intro = await introShown();
  const introCard = intro.cards.find((c) => c.image?.id === INTRO_JOB)?.image ?? null;
  const quote = await quoteShown(resolveQuote(1, '4', null, INTRO_JOB));
  const footpaths = (await sheetImages('place', 'kalimar-footpaths', 'Kalimar footpaths')).find((i) => i.key === INTRO_JOB) ?? null;
  const autobus = (await sheetImages('place', 'autobus', 'Autobus')).find((i) => i.key === PLACE_JOB) ?? null;
  const gladias = (await sheetImages('character', 'gladias', 'Gladias')).find((i) => i.key === CHARACTER_JOB) ?? null;
  const ref = (await referenceCards()).find((c) => c.slug === 'autobus')?.images.find((i) => i.key === PLACE_JOB) ?? null;
  const moment = (await momentOptions(1)).get(89)?.find((o) => o.key === PLACE_JOB) ?? null;
  const term = (await termOptions('autobus')).find((o) => o.key === PLACE_JOB) ?? null;
  return {
    intro: introCard && { url: introCard.url, redone: introCard.redone ?? null },
    quote: quote?.image ? { url: quote.image.url, recipe: quote.image.recipe, replaced: quote.image.replaced ?? null } : null,
    footpaths: footpaths && { url: footpaths.url, redone: footpaths.redone ?? null },
    autobus: autobus && { url: autobus.url, redone: autobus.redone ?? null },
    gladias: gladias && { url: gladias.url, redone: gladias.redone ?? null },
    reference: ref && { url: ref.url, redone: ref.redone ?? null },
    moment: moment && { url: moment.url, redone: moment.redone ?? null },
    term: term && { url: term.url, redone: term.redone ?? null },
  };
}
type Surfaces = Awaited<ReturnType<typeof surfaces>>;

// A child run: no database at all, or one that can't be reached. It prints what every surface shows.
if (process.argv.includes('--child')) {
  console.log(JSON.stringify(await surfaces(process.argv.includes('--only') ? ['intro', 'quote'] : undefined)));
  process.exit(0);
}

const { PGlite } = await import('@electric-sql/pglite');
const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const PORT = 54381;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;

const { db } = await import('../src/lib/db');
const sql = db()!;
await sql`set role studio_writer`;
type Sql = Parameters<typeof import('../src/lib/chapter-pictures/admin').saveVersion>[0];
const S = sql as unknown as Sql;
const { saveVersion, saveDecision } = await import('../src/lib/chapter-pictures/admin');
const { recipePath } = await import('../src/lib/chapter-pictures/shared');
const { forgetHidden } = await import('../src/lib/admin-hidden');
const { loadIllustrationById } = await import('../src/lib/illustrations');
const { pathsFor } = await import('../src/lib/chapter-pictures/where');

const GARANCE = 193912;
const committed = (id: string) => loadIllustrationById(id)!;
const recipe = (job: string) => ({ v: 1, kind: 'chapter-picture', job, prompt: 'p', sha256: 'a'.repeat(64) }) as never;

async function keep(job: string, chapter: number, n: number) {
  const sha = String(n).repeat(64).slice(0, 64);
  const id = await saveVersion(S, GARANCE, {
    jobId: job, chapter, model: 'gpt-image-2.5-sunburst', maker: 'OpenAI', open: false, look: null, note: `Stand-in note ${n}.`,
    prompt: `Redraw the reference picture as this scene. Stand-in ${n}.`, recipe: recipe(job), sha256: sha, width: 1536, height: 1024, jpeg: Buffer.alloc(200, n), costUsd: 0.05,
  });
  const url = `https://pictures.snowmoon.party/images/readers/stand-in-${n}.jpg`;
  await saveDecision(S, GARANCE, { jobId: job, chapter, versionId: id, action: 'keep', publicUrl: url, byHandle: 'garance' });
  return { id, url };
}

// Before any decision: every surface shows the committed file.
const before = await surfaces();
check('N0. with an empty database every surface shows the committed file', Object.entries(before).every(([k, v]) => v && v.url === committed(k === 'autobus' || k === 'reference' || k === 'moment' || k === 'term' ? PLACE_JOB : k === 'gladias' ? CHARACTER_JOB : INTRO_JOB).url), JSON.stringify(before));

// K. A kept redo shows on each surface.
const a = await keep(INTRO_JOB, 1, 1);
const b = await keep(PLACE_JOB, 1, 2);
const c = await keep(CHARACTER_JOB, 1, 3);
const kept = await surfaces();
const credit = (x: { by: string; at: string; model: string; versionId: string; view?: { file: string } } | null | undefined, id: string) =>
  !!x && x.by === 'Redone by @garance' && x.model === 'GPT Image 2.5 Sunburst, a closed model by OpenAI' && x.versionId === id && !Number.isNaN(Date.parse(x.at)) && (!x.view || x.view.file === recipePath(id));
check('K. the introduction card shows the redo', kept.intro?.url === a.url, JSON.stringify(kept.intro));
check('K. ... with "Redone by @garance", the time and "…, a closed model by OpenAI", and the redo\'s recipe sheet', credit(kept.intro?.redone, a.id) && !!kept.intro?.redone?.view);
check('K. ... and the redo\'s own prompt on the "How this was made" card', /Stand-in 1/.test(kept.intro?.redone?.prompt ?? ''));
check('K. the quote card (share page and card image) shows the redo', kept.quote?.url === a.url, JSON.stringify(kept.quote));
check('K. ... credited, with its recipe at /api/chapter-pictures/<version>', credit(kept.quote?.replaced, a.id) && kept.quote?.recipe === recipePath(a.id));
check('K. the place sheet (Kalimar footpaths) shows the redo, credited', kept.footpaths?.url === a.url && credit(kept.footpaths?.redone, a.id), JSON.stringify(kept.footpaths));
check('K. the place sheet (Autobus) shows the redo, credited', kept.autobus?.url === b.url && credit(kept.autobus?.redone, b.id));
check('K. the character sheet (Gladias) shows the redo, credited', kept.gladias?.url === c.url && credit(kept.gladias?.redone, c.id));
check('K. References\' "autobus" card shows the redo, credited', kept.reference?.url === b.url && credit(kept.reference?.redone, b.id), JSON.stringify(kept.reference));
check('K. the pick switch\'s option for the moment (c1-b89) shows the redo, credited; its key is still the job', kept.moment?.url === b.url && credit(kept.moment?.redone, b.id));
check('K. the pick switch\'s option for the term "autobus" shows the redo, credited', kept.term?.url === b.url && credit(kept.term?.redone, b.id));

// L. The latest decision wins.
const a2 = await keep(INTRO_JOB, 1, 4);
const later = await surfaces();
check('L. a second keep replaces the first on the introduction and the quote card', later.intro?.url === a2.url && later.quote?.url === a2.url && credit(later.quote?.replaced, a2.id));

// R. Restore brings back the committed file.
for (const [job] of [[INTRO_JOB], [PLACE_JOB], [CHARACTER_JOB]]) await saveDecision(S, GARANCE, { jobId: job, chapter: 1, versionId: null, action: 'restore', publicUrl: null, byHandle: 'garance' });
const restored = await surfaces();
check('R. after a restore every surface shows the committed file again', JSON.stringify(restored) === JSON.stringify(before), JSON.stringify(restored));
check('R. ... with the committed recipe and no redo credit', restored.quote?.recipe === committed(INTRO_JOB).recipe && Object.values(restored).every((v) => v && !('redone' in v && v.redone) && !('replaced' in v && v.replaced)));
// A restore to an earlier kept version shows that version.
await saveDecision(S, GARANCE, { jobId: INTRO_JOB, chapter: 1, versionId: a.id, action: 'restore', publicUrl: a.url, byHandle: 'garance' });
check('R. a restore of an earlier redo shows that redo', (await surfaces()).intro?.url === a.url);

// H. A hide still wins over a redo.
await sql`insert into studio.seeded_hidden ${sql({ image_id: INTRO_JOB, by_fid: GARANCE })}`;
forgetHidden();
const hiddenNow = await surfaces();
check('H. a hidden picture stays off the introduction and the quote card, redo or not', hiddenNow.intro === null && hiddenNow.quote === null && hiddenNow.footpaths === null);
// A hide is never undone by the site (studio_writer can't delete it); the test database's owner takes it off.
await sql`reset role`;
await sql`delete from studio.seeded_hidden where image_id = ${INTRO_JOB}`;
await sql`set role studio_writer`;
forgetHidden();

// N. No database: the committed files.
// Run apart (a fresh process: db() keeps its first connection), without blocking this one's test database.
const child = async (env: NodeJS.ProcessEnv, only = false) =>
  JSON.parse((await promisify(execFile)(process.execPath, ['--import', 'tsx', '--conditions=react-server', path.join(ROOT, 'scripts/test-redo-everywhere.ts'), '--child', ...(only ? ['--only'] : [])], { cwd: ROOT, env, encoding: 'utf8', timeout: 120_000 })).stdout.trim().split('\n').pop()!) as Surfaces;
const { STUDIO_DATABASE_URL: _unused, ...noDb } = process.env;
void _unused;
check('N. no database configured: every surface shows the committed file', JSON.stringify(await child(noDb)) === JSON.stringify(before));
const unreachable = await child({ ...noDb, STUDIO_DATABASE_URL: 'postgres://studio_writer@127.0.0.1:1/postgres' }, true);
check('N. a database that can\'t be reached: the introduction and the quote card show the committed file', JSON.stringify(unreachable) === JSON.stringify({ intro: before.intro, quote: before.quote }), JSON.stringify(unreachable));

// W. Revalidation after a Keep or a Restore.
const route = readFileSync(path.join(ROOT, 'src/app/api/you/illustrations/show/route.ts'), 'utf8');
check('W. the show route revalidates the tag the other places read through', /revalidateTag\(PICTURES_TAG\)/.test(route));
check('W. ... and every path pathsFor names', /for \(const p of pathsFor\(.+\)\) revalidatePath\(p\.path, p\.type\)/.test(route));
check('W. an introduction picture: the whole site (it is in every page\'s shell)', JSON.stringify(pathsFor(INTRO_JOB, 1)) === JSON.stringify([{ path: '/', type: 'layout' }]));
check('W. a place or character picture: its chapter and everything under /references', JSON.stringify(pathsFor(PLACE_JOB, 1)) === JSON.stringify([{ path: '/chapter/1' }, { path: '/references', type: 'layout' }]));
check('W. a picture on no sheet: its chapter only', JSON.stringify(pathsFor('c1-b082-snatch', 1)) === JSON.stringify([{ path: '/chapter/1' }]));

// S. Every reader of seeded pictures goes through the redo.
const SEEDED_READ = /\b(loadIllustrations|seededImages|loadIntro|resolveQuote|loadIllustrationById|resolveIntroImage)\(/;
const THROUGH_REDO = /\b(withReplacements|shownPicture|introShown|quoteShown|introPicture)\(/;
const SOURCES = new Set(['src/lib/illustrations.ts', 'src/lib/intro.ts', 'src/lib/quote.ts', 'src/lib/images/sheets.ts', 'src/lib/seeded-shown.ts']);
// Not a picture shown to readers: the admin Hide looks the image up (as P5f's exemption).
const EXEMPT = new Set(['src/app/api/admin/hide/route.ts']);
const files = readdirSync(path.join(ROOT, 'src'), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: path.join('src', f), text: readFileSync(path.join(ROOT, 'src', f), 'utf8') }));
const problems = (fs: { file: string; text: string }[]) => fs.filter((f) => SEEDED_READ.test(f.text) && !SOURCES.has(f.file) && !EXEMPT.has(f.file) && !THROUGH_REDO.test(f.text)).map((f) => f.file);
check('S. every reader of seeded pictures shows the kept redo', problems(files).length === 0, problems(files).join(', '));
check('S. a planted reader that skips it is caught', problems([...files, { file: 'src/app/planted/page.tsx', text: "import { loadIllustrations } from '~/lib/illustrations';\nexport default () => loadIllustrations(1)[0].url;" }]).length === 1);

await sql.end();
await server.stop();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
