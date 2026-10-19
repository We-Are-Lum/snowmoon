/**
 * Concurrent inserts and hides, checked for SWAPS: a row written with another request's values, a hide recorded
 * for the wrong person, or a read returning another row (owner, 2026-10-19: "Add a test with concurrent inserts and
 * hides that would catch a swap"). docs/db-interleave.md.
 *   npm run test:db-swaps            (the site's code alone, as in production: must find 0)
 *   npm run test:db-swaps -- --planted   (the test also queries PGlite's one session mid-flight, ungated: must
 *                                         find something, or the test can't catch a swap)
 * The site's own library functions (saveFrame, setHidden, saveBoard, setBoardHidden, frameById) run on the site's
 * client (src/lib/db.ts: postgres.js, prepare: false, max 1) against PGlite, all people at once, several rounds.
 * Every value written encodes its person and index, so a swapped value can't pass the checks.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { gatePglite } from './lib/pglite-gate';

const ROOT = path.resolve(import.meta.dirname, '..');
const PLANTED = process.argv.includes('--planted');
const ROUNDS = 4, PEOPLE = 8, EACH = 6;
const MAINT = 6786;

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec('set role studio_writer');
// Checks after each round go through the gate; the planted run adds ungated direct queries during the work.
const raw = { query: pg.query.bind(pg) };
const gate = gatePglite(pg);
const gated = pg.query.bind(pg);
if (PLANTED) (pg as unknown as { query: typeof raw.query }).query = raw.query;
const srv = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await srv.start();
// Hides move files in the readers' bucket; here a folder stands in for it, as in test:remix.
process.env.REMIX_TEST_FAKES = 'store';
process.env.REMIX_TEST_STORE = mkdtempSync(path.join(tmpdir(), 'db-swaps-'));
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${(srv as unknown as { port: number }).port}/postgres`;
const { db } = await import('../src/lib/db');
const { saveFrame, setHidden, frameById } = await import('../src/lib/remix/frames');
const { saveBoard, setBoardHidden } = await import('../src/lib/remix/storyboards');
const sql = db()!;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const people = Array.from({ length: PEOPLE }, (_, i) => 1000 + i);
const problems: string[] = [];
let writes = 0, hides = 0, refusals = 0, reads = 0, errors = 0;
const codes: Record<string, number> = {};
const err = (e: unknown) => { errors++; if (errors <= 2) console.log("error:", String((e as Error).message).slice(0, 160)); const c = (e as { code?: string }).code ?? (e as Error).name; codes[c] = (codes[c] ?? 0) + 1; return null; };

let noise = true;
const noiseLoop = PLANTED
  ? (async () => { let i = 0; while (noise) { await raw.query(`select $1::bigint as v`, [i++]).catch(() => {}); await new Promise((r) => setImmediate(r)); } })()
  : Promise.resolve();

for (let round = 0; round < ROUNDS; round++) {
  // 1. Everyone saves frames and storyboards at once; each value names its person, round and index.
  const made = await Promise.all(people.flatMap((p) => Array.from({ length: EACH }, async (_, i) => {
    const tag = `p${p}-r${round}-i${i}`;
    const f = await saveFrame(sql as never, {
      adaptationId: 1, versionId: 1, shotId: '48-b4-1', person: p, ownWords: `words ${tag}`, prompt: `prompt ${tag}`,
      recipe: { tag }, imageUrl: `https://media.snowmoon.party/test/${tag}.jpg`, imageSha256: sha(tag), costUsd: (p % 7) / 100 + i / 1000, byName: `name-${p}`,
    }).catch(err);
    const b = await saveBoard(sql as never, { adaptation: 1, version: 1, person: p, title: `board ${tag}`, items: [{ frame: f?.id ?? null, seconds: 2 + i }] as never, takes: {}, byName: `name-${p}` }).catch(err);
    writes += 2;
    return { p, i, tag, f, b };
  })));
  // 2. At once: makers hide their even ones, others try to hide the odd ones (must be refused), the maintainer
  //    hides each person's index 1, and everyone reads frames back by id.
  await Promise.all(made.flatMap(({ p, i, f, b }) => {
    const jobs: Promise<unknown>[] = [];
    if (!f || !b) return jobs;
    if (i % 2 === 0) jobs.push(setHidden(sql as never, p, f.id, true).then((r) => (hides++, !r.ok && problems.push(`maker ${p} could not hide own frame ${f.id}`))).catch(err));
    if (i % 2 === 0) jobs.push(setBoardHidden(sql as never, p, b.id, true).then((r) => (hides++, !r.ok && problems.push(`maker ${p} could not hide own board`))).catch(err));
    if (i % 2 === 1 && i !== 1) {
      const other = people[(people.indexOf(p) + 1) % PEOPLE];
      jobs.push(setHidden(sql as never, other, f.id, true).then((r) => (r.ok ? problems.push(`person ${other} hid ${p}'s frame`) : refusals++)).catch(err));
      jobs.push(setBoardHidden(sql as never, other, b.id, true).then((r) => (r.ok ? problems.push(`person ${other} hid ${p}'s board`) : refusals++)).catch(err));
    }
    if (i === 1) jobs.push(setHidden(sql as never, MAINT, f.id, true).then((r) => (hides++, !r.ok && problems.push('maintainer hide refused'))).catch(err));
    jobs.push(frameById(sql as never, f.id).then((g) => (reads++, (!g || g.id !== f.id || g.ownWords !== f.ownWords || g.person !== p) && problems.push(`read of ${f.id} returned ${g?.id} (${g?.ownWords})`))).catch(err));
    return jobs;
  }));
  // 3. Check every row of this round, through the gate (the site is idle now).
  const rows = (await gated<{ person: string; own_words: string; prompt: string; image_sha256: string; recipe: { tag: string }; image_url: string; by_name: string; hidden: boolean; hidden_by: string | null; hidden_role: string | null }>(
    `select person, own_words, prompt, image_sha256, recipe, image_url, by_name, hidden, hidden_by, hidden_role from studio.remix_frames where own_words like $1 or recipe->>'tag' like $1`, [`%-r${round}-%`])).rows;
  for (const r of rows) {
    const tag = r.recipe?.tag ?? '';
    const p = Number(tag.match(/^p(\d+)-/)?.[1]);
    const i = Number(tag.match(/-i(\d+)$/)?.[1]);
    const want = { person: p, own_words: `words ${tag}`, prompt: `prompt ${tag}`, image_sha256: sha(tag), image_url: `https://media.snowmoon.party/test/${tag}.jpg`, by_name: `name-${p}` };
    for (const [k, v] of Object.entries(want)) if (String((r as Record<string, unknown>)[k]) !== String(v)) problems.push(`frame ${tag}: ${k} is ${String((r as Record<string, unknown>)[k]).slice(0, 60)}, not ${v}`);
    const shouldHide = i % 2 === 0 || i === 1;
    if (r.hidden !== shouldHide) problems.push(`frame ${tag}: hidden ${r.hidden}, expected ${shouldHide}`);
    if (r.hidden && i === 1 && (Number(r.hidden_by) !== MAINT || r.hidden_role !== 'maintainer')) problems.push(`frame ${tag}: hidden by ${r.hidden_by} as ${r.hidden_role}, expected the maintainer`);
    if (r.hidden && i % 2 === 0 && (Number(r.hidden_by) !== p || r.hidden_role !== 'maker')) problems.push(`frame ${tag}: hidden by ${r.hidden_by} as ${r.hidden_role}, expected its maker ${p}`);
  }
  if (rows.length !== PEOPLE * EACH) problems.push(`round ${round}: ${rows.length} frames, expected ${PEOPLE * EACH}`);
  const boards = (await gated<{ person: string; title: string; by_name: string; items: { seconds: number }[]; hidden: boolean; hidden_by: string | null; hidden_role: string | null }>(
    `select person, title, by_name, items, hidden, hidden_by, hidden_role from studio.storyboards where title like $1`, [`board %-r${round}-%`])).rows;
  for (const b of boards) {
    const tag = b.title.replace(/^board /, '');
    const p = Number(tag.match(/^p(\d+)-/)?.[1]);
    const i = Number(tag.match(/-i(\d+)$/)?.[1]);
    if (Number(b.person) !== p || b.by_name !== `name-${p}` || b.items?.[0]?.seconds !== 2 + i) problems.push(`board ${tag}: person ${b.person}, name ${b.by_name}, seconds ${b.items?.[0]?.seconds}`);
    if (b.hidden !== (i % 2 === 0)) problems.push(`board ${tag}: hidden ${b.hidden}`);
    if (b.hidden && (Number(b.hidden_by) !== p || b.hidden_role !== 'maker')) problems.push(`board ${tag}: hidden by ${b.hidden_by} as ${b.hidden_role}`);
  }
  if (boards.length !== PEOPLE * EACH) problems.push(`round ${round}: ${boards.length} boards, expected ${PEOPLE * EACH}`);
}
noise = false;
await noiseLoop;
await sql.end({ timeout: 1 });
await srv.stop();
const summary = { rounds: ROUNDS, people: PEOPLE, writes, hides, refusals, reads, errors, codes, problems: problems.length, protocolErrors: gate.protocolErrors().length };
console.log(JSON.stringify(summary));
if (problems.length) console.log('first problems:\n- ' + problems.slice(0, 8).join('\n- '));
if (PLANTED) {
  if (problems.length + errors === 0) { console.log('DB-SWAPS PLANTED RUN FAILED: interleaving was not detected, so the test cannot catch a swap'); process.exit(1); }
  console.log(`db-swaps (planted): caught ${problems.length} wrong rows or hides and ${errors} errors, as it should`);
  process.exit(0);
}
if (problems.length || errors || gate.protocolErrors().length) { console.log('DB-SWAPS TEST FAILED'); process.exit(1); }
console.log(`db-swaps: ${writes} concurrent writes, ${hides} hides, ${refusals} refused hides, ${reads} reads; every row and hide is its own`);
await pg.close();
