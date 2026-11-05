/**
 * NEXT_challenge_daily.sql (branch contest, 2026-11-04), tested on an in-memory Postgres (PGlite), the way
 * scripts/test-sql-pack.ts tests the SQL pack: the three parts are read from the file itself, so what is tested is
 * what the owner pastes. Never a production database.
 *
 *   npm run test:challenge-daily-sql
 *
 * On a fresh database with every numbered migration (0001…, as main has them) and a realistic published version:
 * - the file has its three parts in order (the dry run ending in rollback, the migration ending in commit, the
 *   read-back), and the dry run is the migration word for word;
 * - the dry run leaves the schema, grants, policies and rows exactly as before;
 * - the migration applies, twice; the read-back passes and leaves every row as it was;
 * - as studio_writer: a submission inserts as main's "Mark as my entry" inserts it (safe with today's live code);
 *   withdrawing sets withdrawn_at once; a second withdraw changes nothing; changing another column, un-withdrawing,
 *   a withdrawal before the submission and deleting are all refused; anon and authenticated read nothing;
 * - the day's count (Pacific) holds a withdrawn submission, and 23:59 and 00:00 Pacific are different days;
 * - planted faults, each in a transaction rolled back: a missing column grant, a delete grant, the dropped check,
 *   public access, a table-wide update grant: the read-back raises READ-BACK FAILED, or the plant fails the test.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/NEXT_challenge_daily.sql');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);

// The three parts, from the file.
const text = readFileSync(FILE, 'utf8');
const part = (n: number) => {
  const i = text.indexOf(`\n-- ${n}. `);
  const j = n < 3 ? text.indexOf(`\n-- ${n + 1}. `) : text.length;
  return i < 0 || j < 0 ? '' : text.slice(text.indexOf('\n', i + 1) + 1, j);
};
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const dry = stripComments(part(1));
const mig = stripComments(part(2));
const readBack = part(3).split('\n').filter((l) => l.startsWith('-- ')).map((l) => l.slice(3)).join('\n');
const doBlock = readBack.slice(readBack.indexOf('do $$'));
check('the file says who runs it (postgres, in the Supabase SQL Editor)', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text));
check('three parts in order: the dry run ends in rollback, the migration in commit, then a read-back do block', dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && doBlock.startsWith('do $$') && /raise notice 'read-back passed'/.test(doBlock));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back inserts and deletes a realistic row', /insert into studio\.challenge_marks/.test(doBlock) && /delete from studio\.challenge_marks/.test(doBlock));

// The database.
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`
  insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.entities (id, work_id, kind, name) values ('70000000-0000-4000-8000-000000000001','snowmoon','character','Bai');
  insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('71111111-1111-4111-8111-111111111111','snowmoon','design',6786,'70000000-0000-4000-8000-000000000001','published');
  insert into studio.element_versions (id, element_id, version_no, body) values ('72222222-2222-4222-8222-222222222222','71111111-1111-4111-8111-111111111111', 1, '{"title":"Bai, remixed"}');
  insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 6852, 'bai', '72222222-2222-4222-8222-222222222222');`);

async function snapshot(): Promise<string> {
  const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
  return [
    await q(`select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_marks' order by 1, 2`),
    await q(`select conname, pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'studio.challenge_marks'::regclass order by 1`),
    await q(`select indexname, indexdef from pg_indexes where schemaname = 'studio' and tablename = 'challenge_marks' order by 1`),
    await q(`select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'studio' and tablename = 'challenge_marks' order by 1`),
    await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'studio' and table_name = 'challenge_marks' order by 1, 2`),
    await q(`select column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'studio' and table_name = 'challenge_marks' and grantee not in ('postgres') order by 1, 2, 3`),
    await q(`select id, challenge, fid, character, version_id from studio.challenge_marks order by id`),
  ].join('\n');
}
const before = await snapshot();
await pg.exec(dry);
check('the dry run leaves everything as it was', (await snapshot()) === before);
await pg.exec(mig);
await pg.exec(mig);
check('the migration applies, and again (safe to run twice)', true);
const cols = (await pg.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_marks'`)).rows.map((r) => r.column_name);
check('challenge_marks has withdrawn_at', cols.includes('withdrawn_at'));

/** The read-back's result: 'passed', or its error. */
async function runReadBack(): Promise<string> {
  const notes: string[] = [];
  try {
    await pg.query(doBlock, [], { onNotice: (n) => notes.push(n.message) } as never);
    return notes.includes('read-back passed') ? 'passed' : `no notice (${notes.join('; ')})`;
  } catch (e) {
    return (e as Error).message;
  }
}
const rowsBefore = JSON.stringify((await pg.query(`select * from studio.challenge_marks order by id`)).rows);
const rb = await runReadBack();
check('the read-back passes', rb === 'passed', rb);
check('the read-back leaves every row as it was', JSON.stringify((await pg.query(`select * from studio.challenge_marks order by id`)).rows) === rowsBefore);

// As studio_writer: the app's own role.
const asWriter = async <T>(fn: () => Promise<T>): Promise<T | Error> => {
  await pg.exec('set role studio_writer');
  try {
    return await fn();
  } catch (e) {
    return e as Error;
  } finally {
    await pg.exec('reset role');
  }
};
const V = '72222222-2222-4222-8222-222222222222';
const ins = await asWriter(() => pg.query<{ id: number }>(`insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 2147483601, 'bai', $1) returning id`, [V]));
check('studio_writer: a submission inserts as main\'s "Mark as my entry" inserts it (safe with today\'s live code)', !(ins instanceof Error), ins instanceof Error ? ins.message : '');
const id = ins instanceof Error ? 0 : ins.rows[0].id;
const w1 = await asWriter(() => pg.query(`update studio.challenge_marks set withdrawn_at = now() where id = $1 and withdrawn_at is null`, [id]));
check('studio_writer: withdrawing sets withdrawn_at', !(w1 instanceof Error) && w1.affectedRows === 1, w1 instanceof Error ? w1.message : String(w1.affectedRows));
const w2 = await asWriter(() => pg.query(`update studio.challenge_marks set withdrawn_at = now() where id = $1`, [id]));
check('studio_writer: a second withdraw changes nothing (the row is no longer the writer\'s to update)', !(w2 instanceof Error) && w2.affectedRows === 0, w2 instanceof Error ? w2.message : String(w2.affectedRows));
const un = await asWriter(() => pg.query(`update studio.challenge_marks set withdrawn_at = null where id = $1`, [id]));
check('studio_writer: un-withdrawing changes nothing', !(un instanceof Error) && un.affectedRows === 0);
const other = await asWriter(() => pg.query(`update studio.challenge_marks set version_id = version_id, withdrawn_at = now() where fid = 6852`));
check('studio_writer: changing another column is refused', other instanceof Error && /permission denied/.test(other.message), other instanceof Error ? other.message : 'allowed');
const del = await asWriter(() => pg.query(`delete from studio.challenge_marks where id = $1`, [id]));
check('studio_writer: deleting a submission is refused', del instanceof Error && /permission denied/.test(del.message), del instanceof Error ? del.message : 'allowed');
const early = await pg.query(`insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 2147483602, 'bai', $1) returning id`, [V]);
const bad = await asWriter(() => pg.query(`update studio.challenge_marks set withdrawn_at = marked_at - interval '1 minute' where id = $1`, [early.rows[0].id as number]));
check('a withdrawal before the submission is refused', bad instanceof Error && /check constraint/.test(bad.message), bad instanceof Error ? bad.message : 'allowed');
for (const role of ['anon', 'authenticated']) {
  await pg.exec(`set role ${role}`);
  const r = await pg.query(`select count(*) from studio.challenge_marks`).then(() => 'read', (e: Error) => e.message);
  await pg.exec('reset role');
  check(`${role} reads nothing`, /permission denied/.test(r), r);
}

// The day's count, in Pacific time, as the code counts it: withdrawn ones included.
await pg.exec(`
  insert into studio.challenge_marks (challenge, fid, character, version_id, marked_at, withdrawn_at) values
    ('day-test', 9, 'bai', '${V}', '2026-11-10T23:59:00-08:00', null),
    ('day-test', 9, 'zei', '${V}', '2026-11-11T00:00:00-08:00', '2026-11-11T00:05:00-08:00')`);
const day = async (d: string) => (await pg.query<{ n: number }>(`select count(*)::int as n from studio.challenge_marks where challenge = 'day-test' and fid = 9 and (marked_at at time zone 'America/Los_Angeles')::date = $1::date`, [d])).rows[0].n;
check('23:59 and 00:00 Pacific are two days, and a withdrawn submission counts for its day', (await day('2026-11-10')) === 1 && (await day('2026-11-11')) === 1);
await pg.exec(`delete from studio.challenge_marks where challenge = 'day-test' or fid in (2147483601, 2147483602)`);

// Planted faults, each rolled back.
async function planted(label: string, sql: string) {
  await pg.exec('begin');
  await pg.exec(sql);
  const r = await runReadBack();
  await pg.exec('rollback');
  proof(`${label} is caught by the read-back`, r !== 'passed' && /READ-BACK FAILED/.test(r));
}
await planted('a missing column grant (studio_writer can\'t withdraw)', `revoke update (withdrawn_at) on studio.challenge_marks from studio_writer`);
await planted('a delete grant', `grant delete on studio.challenge_marks to studio_writer`);
await planted('a table-wide update grant', `grant update on studio.challenge_marks to studio_writer`);
await planted('the dropped check (a withdrawal before the submission)', `alter table studio.challenge_marks drop constraint challenge_marks_withdrawn_after_marked`);
await planted('public access', `grant select on studio.challenge_marks to anon`);
check('after the plants, the read-back passes again', (await runReadBack()) === 'passed');

console.log(`test:challenge-daily-sql: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
