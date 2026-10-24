/**
 * The owner's image review (owner, 2026-10-24), one check per point he set before the merge:
 *  1. the pre-fill is the stored fix line (not the finding);
 *  2. drafted_note equals the offered fix line, exactly;
 *  3. drafted_by names both models (the check's finding and the fix line's);
 *  4. a request carrying its own "drafted" text, model or edited flag is ignored;
 *  5. reviewMarkPublic is false, and no reviewed mark reaches a chapter's images.
 * Plus: an edited note is marked edited; a note with no stored fix line has no drafted record.
 *
 *   npm run test:illustration-review
 *
 * In-memory Postgres (PGlite, every migration), through postgres.js as studio_writer, as the site connects. No network.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const PORT = 54341;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1 });
await sql`set role studio_writer`;

const { decide, reviewItems } = await import('../src/lib/illustration-check/review');
const { ILLUSTRATION_CHECK } = await import('../src/lib/config');
type Sql = Parameters<typeof decide>[0];
const S = sql as unknown as Sql;

const FIX = 'Zei appears once, seated at the nearer glowing console.';
const FINDING = 'The main character is duplicated on both sides of the foreground.';
const answer = (fix: boolean) => ({
  who: { count: 2, identities: ['Zei'], notes: '' }, setting: 'An arena.', action: 'Playing.', time_of_day: 'night; agrees',
  problems: [{ type: 'reference_copy_in_crowd', detail: 'Zei twice.' }], verdict: 'wrong', why: FINDING,
  ...(fix ? { fix_line: { text: FIX, model: 'openai/gpt-oss-120b', prompt_file: 'config/prompts/illustration-fix-line.md', prompt_sha256: '0'.repeat(64), date: '2026-10-24T00:00:00Z' } } : {}),
});
for (const [job, fix] of [['c14-b030-semifinal-arena', true], ['c7-b049-toast', false]] as const) {
  await sql`insert into studio.illustration_checks ${sql({ run: 'test-run', job_id: job, image_sha256: null, model: 'google/gemini-4-argon', answer: sql.json(answer(fix)), inputs_sha256: sql.json({}), cost_usd: 0 })}`;
}
const latest = async (job: string) =>
  (await sql<{ note: string; drafted_note: string | null; drafted_by: string | null; note_edited: boolean | null; by_fid: string }[]>`select note, drafted_note, drafted_by, note_edited, by_fid from studio.illustration_reviews where job_id = ${job} order by id desc limit 1`)[0];

// 1. The pre-fill is the stored fix line. The page fills the box from the item's check (src/components/illustration-review.tsx: draft = fix_line.text).
const { items } = await reviewItems(S);
const item = items.find((i) => i.id === 'c14-b030-semifinal-arena')!;
check('1. the pre-fill is the stored fix line', item.check?.answer.fix_line?.text === FIX, String(item.check?.answer.fix_line?.text));
check('1. the finding stays beside it', item.check?.answer.why === FINDING);
const page = readFileSync(path.join(ROOT, 'src/components/illustration-review.tsx'), 'utf8');
check('1. the page pre-fills from fix_line only, never the finding', /const draft = \(a\?\.fix_line\?\.text \?\? ''\)\.trim\(\);/.test(page) && !/setNote\(a\.why\)/.test(page));

// 2 and 3. Accepted as offered.
let r = await decide(S, 6786, { jobId: 'c14-b030-semifinal-arena', decision: 'regenerate', note: FIX, fromCheck: true });
let row = await latest('c14-b030-semifinal-arena');
check('saved', r.status === 200, JSON.stringify(r.json));
check('2. drafted_note equals the offered fix line', row.drafted_note === FIX, String(row.drafted_note));
check('3. drafted_by names both models', row.drafted_by === 'google/gemini-4-argon finding; openai/gpt-oss-120b fix line', String(row.drafted_by));
check('accepted as offered: note_edited is false', row.note_edited === false);

// 4. A request carrying its own drafted text, model and edited flag: all ignored.
r = await decide(S, 6786, { jobId: 'c14-b030-semifinal-arena', decision: 'regenerate', note: FIX, fromCheck: true, draftedNote: 'Something else entirely.', drafted_note: 'Something else.', draftedBy: 'me', drafted_by: 'me', noteEdited: true, note_edited: true });
row = await latest('c14-b030-semifinal-arena');
check('4. a request\'s own drafted text is ignored', row.drafted_note === FIX, String(row.drafted_note));
check('4. a request\'s own drafted_by is ignored', row.drafted_by === 'google/gemini-4-argon finding; openai/gpt-oss-120b fix line', String(row.drafted_by));
check('4. a request\'s own edited flag is ignored', row.note_edited === false);

// Edited: the note differs from the fix line.
await decide(S, 6786, { jobId: 'c14-b030-semifinal-arena', decision: 'regenerate', note: `${FIX} He wears his orange jacket.`, fromCheck: true });
row = await latest('c14-b030-semifinal-arena');
check('an edited note is marked edited, the draft kept as offered', row.note_edited === true && row.drafted_note === FIX);

// No stored fix line: nothing is recorded as drafted, even when the request says it came from the check.
await decide(S, 6786, { jobId: 'c7-b049-toast', decision: 'regenerate', note: FINDING, fromCheck: true });
row = await latest('c7-b049-toast');
check('without a stored fix line there is no drafted record (the finding is never the draft)', row.drafted_note === null && row.drafted_by === null && row.note_edited === null);

// 5. reviewMarkPublic is false, and no chapter image carries the mark even with a "keep" in the job file.
check('5. ILLUSTRATION_CHECK.reviewMarkPublic is false', ILLUSTRATION_CHECK.reviewMarkPublic === false);
const { loadIllustrations } = await import('../src/lib/illustrations');
check('5. no chapter image carries the reviewed mark', Array.from({ length: 32 }, (_, i) => loadIllustrations(i + 1)).flat().every((im) => !im.reviewed));

await sql.end();
await server.stop();
if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nillustration review: all checks passed');
