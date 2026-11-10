/**
 * scripts/publish-style.ts (owner, 2026-11-10): a style is published only with 2 to 4 sample pictures, each with its
 * full recipe, through the site's own makeDesign; a style published without samples gets them as a new version.
 * On an in-memory Postgres with every migration (never a production database), with a stand-in for the site's storage.
 * Each check runs on the real inputs and on a planted violation, which it must catch.
 *
 *   npm run test:publish-style
 *
 *  S1 publishing without samples is refused (none, one, five), and writes nothing;
 *  S2 with 2 samples it publishes the style, every picture with its recipe, through makeDesign; P1c (its own rule,
 *     scripts/lib/p1c.ts) passes for the new style on the local database;
 *  S3 adding samples to a style published without any (as on 2026-11-09) writes a new version with them (the old one
 *     untouched: append-only) and P1c passes for the new version; adding to a style that has samples, or whose text
 *     differs, is refused;
 *  S4 the manifest: a file's sha256, its size, the style's text in its prompt, a model on config/models.json and its
 *     maker are checked; a recipe can come from a style-test ledger; a 560 px copy of a ledger picture is caught;
 *  S5 nothing names an artist, studio or film, and no one on the blocked list (planted prompts are caught);
 *  S6 the script's dry run writes nothing and uploads nothing, and --apply without --confirm-owner-go writes nothing.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import sharp from 'sharp';
import { COMIC_BOOK, COMIC_3D_MIX, MOOD, OFFERED_STYLES } from '../src/lib/challenge/base-style';
import { IMAGES } from '../src/lib/config';
import { addSamples, applyStyle, planStyle, readManifest, sampleProblems, StyleRefused, type ReadySample } from './lib/publish-style';
import { fakeStore, samplesFor } from './lib/style-samples-fixture';
import { p1cProblems, type P1cRow } from './lib/p1c';

const ROOT = path.resolve(import.meta.dirname, '..');
let passed = 0;
const failed: string[] = [];
const need = (ok: boolean, what: string) => (ok ? [] : [what]);
function proven(name: string, problems: string[], planted: string[]) {
  const ok = problems.length === 0 && planted.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${problems.length ? `real: ${problems.join('; ')}` : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${problems.length ? ` (${problems.join('; ')})` : ''}${planted.length ? '' : ' (plant not caught)'}`);
}

// The local database, every numbered migration, as studio_writer (the site's role).
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const PORT = 54377;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const DB_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
const sql = postgres(DB_URL, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const S = sql as never;
const count = async () => Number(((await db.query<{ n: number }>('select count(*)::int as n from studio.element_versions')).rows[0]).n);
const p1cFor = async (elementId: string) => p1cProblems((await sql<P1cRow[]>`select v.id::text as id, v.recipe_id, e.element_type, v.body from studio.element_versions v join studio.elements e on e.id = v.element_id where e.status = 'published' and e.id = ${elementId}`) as P1cRow[]);
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const refusedOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e instanceof StyleRefused ? e.message : `threw ${(e as Error).message}`; } };

// S1
{
  const store = fakeStore();
  const before = await count();
  const none = await refusedOf(() => applyStyle(S, 'naaate', COMIC_BOOK, [], store.put));
  const one = await refusedOf(async () => applyStyle(S, 'naaate', COMIC_BOOK, await samplesFor(COMIC_BOOK, 1, 's1'), store.put));
  const five = await refusedOf(async () => applyStyle(S, 'naaate', COMIC_BOOK, await samplesFor(COMIC_BOOK, 5, 's1'), store.put));
  const after = await count();
  const real = [...need(!!none && !!one && !!five, `refusals: none ${none}, one ${one}, five ${five}`), ...need(/2 to 4/.test(none ?? ''), `the refusal doesn't say 2 to 4: ${none}`), ...need(after === before && store.puts.length === 0, 'something was written or uploaded')];
  // Planted: the old path (a style body with no samples, straight to makeDesign) would have written one.
  const planted = sampleProblems(COMIC_BOOK, []);
  proven('S1 publishing a style without 2 to 4 sample pictures is refused (none, one, five), and nothing is written or uploaded', real, planted);
}

// S2
let comicBook = '';
{
  const store = fakeStore();
  const samples = await samplesFor(COMIC_BOOK, 2, 's2');
  const out = await applyStyle(S, 'naaate', COMIC_BOOK, samples, store.put);
  comicBook = out.elementId;
  const [v] = await sql<{ body: { samples: { url: string; sha256: string; recipe: Record<string, unknown> }[] } }[]>`select body from studio.element_versions where id = ${out.versionId}`;
  const real = [
    ...need(v.body.samples.length === 2 && v.body.samples.every((x, i) => x.sha256 === samples[i].sha256 && canon(x.recipe) === canon(samples[i].recipe)), 'the samples or their recipes were not written as given'),
    ...need(store.puts.length === 2 && store.puts.every((s, i) => s === samples[i].sha256), 'the pictures were not put in storage first'),
    ...(await p1cFor(out.elementId)),
  ];
  // Planted: the same version without its recipes fails P1c.
  const planted = p1cProblems([{ id: 'x', recipe_id: null, element_type: 'design', body: { ...v.body, samples: v.body.samples.map((x) => ({ ...x, recipe: {} })) } }]);
  proven('S2 with 2 samples it publishes the style through makeDesign, every picture with its recipe; P1c passes for it on the local database', real, planted);
}

// S3
{
  const store = fakeStore();
  // As on 2026-11-09: Comic 3D mix published with no samples (the old script's body, straight to makeDesign).
  const DS = await import('../src/lib/images/designs');
  const old = await DS.makeDesign(S, { fid: 6786, mode: 'create', kind: 'style', styleName: COMIC_3D_MIX.title, body: { title: COMIC_3D_MIX.title, text: COMIC_3D_MIX.text, samples: [], views: {}, by_name: 'naaate', by_name_source: 'relay', assist: null, role: 'maintainer', style: null } as never });
  const oldBody = JSON.stringify((await sql`select body from studio.element_versions where id = ${old.versionId}`)[0].body);
  const p1cBefore = await p1cFor(old.elementId);
  const plan = await planStyle(S, COMIC_3D_MIX);
  const added = await addSamples(S, COMIC_3D_MIX, await samplesFor(COMIC_3D_MIX, 3, 's3'), store.put);
  const rows = await sql<{ id: string; version_no: number; body: { samples: unknown[]; title: string; text: string; by_name: string } }[]>`select id::text, version_no, body from studio.element_versions where element_id = ${old.elementId} order by version_no`;
  const p1cNew = p1cProblems((await sql<P1cRow[]>`select v.id::text as id, v.recipe_id, e.element_type, v.body from studio.element_versions v join studio.elements e on e.id = v.element_id where v.id = ${added.versionId}`) as P1cRow[]);
  const again = await refusedOf(async () => addSamples(S, COMIC_3D_MIX, await samplesFor(COMIC_3D_MIX, 2, 's3b'), store.put));
  const toCreated = await refusedOf(async () => addSamples(S, COMIC_BOOK, await samplesFor(COMIC_BOOK, 2, 's3c'), store.put));
  const real = [
    ...need(p1cBefore.length === 1 && plan.exists?.samples === 0, 'the sample-less style was not seen as such'),
    ...need(rows.length === 2 && rows[1].version_no === 2 && rows[1].id === added.versionId && rows[1].body.samples.length === 3 && rows[1].body.title === COMIC_3D_MIX.title && rows[1].body.text === COMIC_3D_MIX.text && rows[1].body.by_name === 'naaate', 'the samples were not added as version 2 with the same title, text and byline'),
    ...need(JSON.stringify(rows[0].body) === oldBody, 'version 1 changed'),
    ...p1cNew,
    ...need(!!again && /already has 3 sample pictures/.test(again), `adding again: ${again}`),
    ...need(!!toCreated && /already has 2 sample pictures/.test(toCreated), `adding to a style published with samples: ${toCreated}`),
  ];
  console.log(`     note: version 1 of the style, published without pictures, is still listed by P1c (${(await p1cFor(old.elementId)).length} row): element_versions is append-only, so only the new version has samples.`);
  // Planted: a "version" without the samples.
  const planted = p1cProblems([{ id: 'v2', recipe_id: null, element_type: 'design', body: { ...rows[1].body, samples: [] } }]);
  proven('S3 adding samples to a style published without any writes version 2 with them (version 1 untouched); P1c passes for version 2; adding again, or to a style with samples, is refused', real, planted);
}

// S4 and S5: the manifest.
const dir = path.join(tmpdir(), `publish-style-test-${process.pid}`);
mkdirSync(dir, { recursive: true });
const writeJpeg = async (name: string, w: number, h: number, seed: number) => {
  const bytes = await sharp({ create: { width: w, height: h, channels: 3, background: { r: seed % 256, g: 80, b: 40 } } }).jpeg().toBuffer();
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
};
{
  const a = await writeJpeg('comic-book-zei-gemini.jpg', 1024, 576, 11);
  const b = await writeJpeg('comic-book-bai-gpt.jpg', 1024, 576, 12);
  const small = await writeJpeg('comic-book-mu-gemini.jpg', 560, 315, 13);
  const promptFor = (s: string) => `Zei is the person in reference image 1, the main figure.\n\nStyle: ${s}\n\nNo text, no lettering, no signs with words.`;
  // A ledger shaped as docs/starting-sheet-drafts/style-test-2026-11-08/ledger.json is.
  const ps = createHash('sha256').update(promptFor(COMIC_BOOK.text)).digest('hex');
  const ledger = {
    prompts: { [ps]: promptFor(COMIC_BOOK.text) },
    refs: { zei: { version: 'bffc7b6a-edc7-4fd7-8922-bcab5f8c4c2d', sha256: '131f'.padEnd(64, '0') } },
    calls: [
      { kind: 'guard', prompt_sha256: ps, status: 'ok' },
      { kind: 'picture', model: 'gemini', character: 'zei', style: 'comic-book', prompt_sha256: ps, endpoint: 'google/gemini-3.1-flash-image', host: 'Vercel AI Gateway', request_id: 'gen_A', seed: null, status: 'ok', cost_usd: 0.0676025, sha256: a.sha256, file: 'comic-book-zei-gemini.jpg', out_size: '1024x576', settings: { aspect_ratio: '16:9' }, at: '2026-11-09T01:30:00.000Z' },
      { kind: 'picture', model: 'gemini', character: 'zei', style: 'comic-book', prompt_sha256: ps, endpoint: 'google/gemini-3.1-flash-image', host: 'Vercel AI Gateway', request_id: 'gen_C', seed: null, status: 'ok', cost_usd: 0.0676, sha256: 'f'.repeat(64), file: 'comic-book-mu-gemini.jpg', out_size: '1024x576', settings: {}, at: '2026-11-09T01:31:00.000Z' },
    ],
  };
  const ledgerFile = path.join(dir, 'ledger.json');
  writeFileSync(ledgerFile, JSON.stringify(ledger));
  const whole = { prompt: promptFor(COMIC_BOOK.text), model: 'gpt-image-2.5-sunburst', maker: 'OpenAI', endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', settings: { size: '1536x1024' }, seed: null, request_id: 'gen_B', cost_usd: 0.0479, made_at: '2026-11-09T01:33:51.019Z', width: 1024, height: 576, checks: { prompt: { model: 'gpt-oss-safeguard-20b', verdict: 'ok' }, host_safety_checker: 'not run' }, assist: null };
  const write = (name: string, m: unknown) => { const f = path.join(dir, name); writeFileSync(f, JSON.stringify(m)); return f; };
  const good = write('good.json', { styles: { 'Comic book': [{ file: a.file, sha256: a.sha256, ledger: ledgerFile }, { file: b.file, sha256: b.sha256, recipe: whole }] } });
  const g = await readManifest(good, ROOT);
  const ready = g.ready.get('Comic book') ?? [];
  const fromLedger = ready[0]?.recipe;
  const realS4 = [
    ...g.problems,
    ...need(ready.length === 2, `ready: ${ready.length}`),
    ...need(fromLedger?.prompt === promptFor(COMIC_BOOK.text) && fromLedger.model === 'gemini-3.1-flash-image' && fromLedger.request_id === 'gen_A' && fromLedger.checks.prompt.verdict === 'ok' && fromLedger.references?.[0]?.sha256 === ledger.refs.zei.sha256 && fromLedger.references?.[0]?.what === "Zei's base front (version bffc7b6a-edc7-4fd7-8922-bcab5f8c4c2d)" && fromLedger.width === 1024, `the recipe from the ledger: ${JSON.stringify(fromLedger)}`),
    ...need(!('maker' in (ready[1]?.recipe ?? {})), 'the maker was stored (the site shows it from config/models.json)'),
  ];
  const bad = (name: string, sample: Record<string, unknown>) => write(name, { styles: { 'Comic book': [{ file: a.file, sha256: a.sha256, ledger: ledgerFile }, sample] } });
  const plants = [
    ['a wrong sha256', bad('p1.json', { file: b.file, sha256: '0'.repeat(64), recipe: whole }), /sha256 isn't the one given/],
    ['a wrong size', bad('p2.json', { file: b.file, sha256: b.sha256, recipe: { ...whole, width: 1536 } }), /but the recipe says 1536/],
    ['a prompt without the style text', bad('p3.json', { file: b.file, sha256: b.sha256, recipe: { ...whole, prompt: 'Zei in a hat.' } }), /doesn't carry the style's text/],
    ['a model not on the list', bad('p4.json', { file: b.file, sha256: b.sha256, recipe: { ...whole, model: 'some-model' } }), /isn't on config\/models\.json/],
    ['a wrong maker', bad('p5.json', { file: b.file, sha256: b.sha256, recipe: { ...whole, maker: 'Google' } }), /says OpenAI/],
    ['the 560 px copy of a ledger picture', bad('p6.json', { file: small.file, sha256: small.sha256, ledger: ledgerFile }), /560 px/],
    ['one sample only', write('p7.json', { styles: { 'Comic book': [{ file: a.file, sha256: a.sha256, ledger: ledgerFile }] } }), /2 to 4/],
    ['a style not offered', write('p8.json', { styles: { Bolder: [] } }), /isn't one of the offered styles/],
  ] as const;
  const caught: string[] = [];
  for (const [what, f, want] of plants) {
    const r = await readManifest(f, ROOT);
    if (r.problems.some((p) => want.test(p))) caught.push(what);
    else realS4.push(`${what} was not caught (${r.problems.join('; ') || 'no problems'})`);
  }
  proven('S4 the manifest: sha256, size, the style text in the prompt, a listed model and its maker are checked; a recipe comes from a style-test ledger; a 560 px copy is caught', realS4, caught.length === plants.length ? caught : []);

  // S5: no artist, studio or film, and no one on the blocked list, in any style text or sample prompt.
  const realS5 = [...OFFERED_STYLES.flatMap((s) => sampleProblems(s, []).filter((p) => /names/.test(p))), ...ready.flatMap((x) => sampleProblems(COMIC_BOOK, [x, ...ready.filter((y) => y !== x)]).filter((p) => /names/.test(p)))];
  const planted5 = [
    ...sampleProblems(COMIC_BOOK, [{ ...ready[0], recipe: { ...ready[0].recipe, prompt: `${ready[0].recipe.prompt} In the style of Studio Ghibli.` } }, ready[1]]).filter((p) => /artist, studio or film/.test(p)),
    ...sampleProblems(MOOD, [{ ...ready[0], recipe: { ...ready[0].recipe, prompt: `${MOOD.text} Donald Trump on a stage.` } }, ready[1]]).filter((p) => /blocked list/.test(p)),
  ];
  proven('S5 no style text or sample prompt names an artist, studio or film, or anyone on the blocked list (planted prompts caught)', realS5, planted5.length === 2 ? planted5 : []);

  // S6: the script, against this database: the dry run and --apply without --confirm-owner-go write and upload nothing.
  // (The socket takes one client at a time: this test's own client is closed first.)
  await sql.end();
  await db.exec('reset role');
  const before = await count();
  // Run asynchronously: the database's socket is served by this process.
  const run = async (...args: string[]) => {
    try {
      const r = await promisify(execFile)('npx', ['tsx', '--conditions=react-server', path.join(ROOT, 'scripts/publish-style.ts'), `--db=${DB_URL}`, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, STUDIO_DATABASE_URL: '', R2_ACCOUNT_ID: '' } });
      return { code: 0, out: r.stdout };
    } catch (e) {
      const x = e as { code: number; stdout: string };
      return { code: x.code, out: x.stdout };
    }
  };
  const dry = await run(`--manifest=${good}`);
  const noGo = await run(`--manifest=${good}`, '--apply');
  const noManifest = await run('--apply', '--confirm-owner-go');
  const after = await count();
  const realS6 = [
    ...need(dry.code === 0 && /DRY RUN/.test(dry.out) && /style "Comic book": published, version 1 \([0-9a-f-]+\), 2 sample pictures/.test(dry.out) && /SKIP: "Comic book" already has 2 sample pictures/.test(dry.out) && /Dry run: nothing written, nothing uploaded\./.test(dry.out), `dry run: ${dry.code} ${dry.out.slice(0, 600)}`),
    ...need(OFFERED_STYLES.every((s) => dry.out.includes(`style "${s.title}"`)), 'the dry run did not report every style'),
    ...need(noGo.code === 3 && /Refusing --apply without --confirm-owner-go/.test(noGo.out), `--apply alone: ${noGo.code}`),
    ...need(noManifest.code === 3 && /Refusing --apply without --manifest/.test(noManifest.out), `--apply without a manifest: ${noManifest.code}`),
    ...need(after === before, `the database changed: ${before} -> ${after} versions`),
  ];
  proven('S6 the dry run writes and uploads nothing; --apply refuses without --confirm-owner-go and without a manifest', realS6, after === before + 1 ? [] : ['planted: a run that wrote one version would change the count']);
  void comicBook;
}

await server.stop();
console.log(`\ntest:publish-style: ${passed} passed, ${failed.length} failed (samples ${IMAGES.designs.samplesMin} to ${IMAGES.designs.samplesMax})`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
