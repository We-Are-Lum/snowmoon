/**
 * NEXT_remix_model_choice.sql (branches remix-model-choice and challenge-models), tested on an in-memory Postgres
 * (PGlite), as scripts/test-challenge-daily-sql.ts tests 0038: the parts are read from the file itself, so what is
 * tested is what the owner pastes. Never a production database.
 *
 *   npm run test:remix-model-choice-sql
 *
 * On a fresh database with every numbered migration and some realistic rows written before it:
 * - the file says who runs it and has its four parts in order (A the dry run ending in rollback, B the migration ending
 *   in commit, C the read-back, D the undo), and the dry run is the migration word for word;
 * - A leaves the schema, grants and rows exactly as before; B applies, and again (safe to run twice);
 * - rows already there are 'open'; as studio_writer a closed picture and an open one insert as the site writes them
 *   (src/lib/images/limits.ts), and the site's weighted count reads 4; a bad pool is refused; studio_writer can't
 *   update or delete; anon and authenticated read nothing;
 * - C (a) is all true, C (b) passes and leaves every row as it was;
 * - planted faults, each rolled back: the check dropped, the default changed, public access: C catches each;
 * - D undoes B (the column, check and index gone; the rows kept), and B applies again after it.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/NEXT_remix_model_choice.sql');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);

const text = readFileSync(FILE, 'utf8');
const part = (k: 'A' | 'B' | 'C' | 'D') => {
  const order = ['A', 'B', 'C', 'D'];
  const i = text.indexOf(`\n-- ${k}. `);
  const next = order[order.indexOf(k) + 1];
  const j = next ? text.indexOf(`\n-- ${next}. `) : text.length;
  return i < 0 || j < 0 ? '' : text.slice(text.indexOf('\n', i + 1) + 1, j);
};
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const uncomment = (s: string) => s.split('\n').filter((l) => l.startsWith('-- ')).map((l) => l.slice(3)).join('\n');
const dry = stripComments(part('A'));
const mig = stripComments(part('B'));
const C = uncomment(part('C'));
const selectA = C.slice(C.indexOf('select n, what, ok'), C.indexOf(') as t(n, what, ok) order by n;') + ') as t(n, what, ok) order by n;'.length);
const doBlock = C.slice(C.indexOf('do $$'), C.lastIndexOf('end $$;') + 'end $$;'.length);
const undo = uncomment(part('D')).split('\n').filter((l) => !/^[A-Z]/.test(l)).join('\n').trim();

check('the file says who runs it (postgres, in the Supabase SQL Editor) and when it was applied', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text) && /APPLIED on production by the owner on 2026-11-08/.test(text));
check('four parts in order: A ends in rollback, B in commit, C a select and a do block, D the undo', ['A', 'B', 'C', 'D'].every((k, i, a) => i === 0 || text.indexOf(`\n-- ${a[i - 1]}. `) < text.indexOf(`\n-- ${k}. `)) && dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && selectA.startsWith('select n, what, ok') && doBlock.startsWith('do $$') && /READ-BACK PASSED/.test(doBlock) && undo.startsWith('begin;') && undo.endsWith('commit;'));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
// Postgres can't SET ROLE in the Supabase SQL Editor (0030's note; this file's first do block failed there on
// 2026-11-08). This in-memory test runs as a superuser and can't catch that, so a read-back that sets a role fails here.
const setsRole = (sql: string) => /\bset\s+(local\s+|session\s+)?role\b/i.test(sql);
check('the read-back sets no role (postgres can\'t SET ROLE in the SQL Editor)', !setsRole(C), 'part C uses SET ROLE: replace it with the coordinator\'s read-back (privileges checked, rows inserted and deleted as postgres)');
proof('a read-back with SET ROLE is caught', setsRole('do $$ begin set local role studio_writer; end $$;') && setsRole('SET ROLE studio_writer;') && !setsRole('select has_table_privilege(\'studio_writer\', \'studio.image_asks\', \'INSERT\');'));
check('the read-back inserts and deletes a realistic row', /insert into studio\.image_asks/.test(doBlock) && /delete from studio\.image_asks/.test(doBlock));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
// Rows the site wrote before: two pictures of one person today, one yesterday.
await pg.exec(`insert into studio.image_asks (fid, at) values (6852, now()), (6852, now()), (6852, now() - interval '1 day')`);

async function snapshot(): Promise<string> {
  const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
  return [
    await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'studio' and table_name = 'image_asks' order by 1`),
    await q(`select conname, pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'studio.image_asks'::regclass order by 1`),
    await q(`select indexname, indexdef from pg_indexes where schemaname = 'studio' and tablename = 'image_asks' order by 1`),
    await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'studio' and table_name = 'image_asks' order by 1, 2`),
    await q(`select fid, at from studio.image_asks order by at, fid`),
  ].join('\n');
}
const before = await snapshot();
await pg.exec(dry);
check('A (the dry run) leaves everything as it was', (await snapshot()) === before);
await pg.exec(mig);
await pg.exec(mig);
check('B applies, and again (safe to run twice)', true);
const pools = (await pg.query<{ pool: string }>(`select distinct pool from studio.image_asks where fid = 6852`)).rows.map((r) => r.pool);
check('rows written before B are open', pools.length === 1 && pools[0] === 'open', pools.join(','));

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
const P = 2147483601;
const a = await asWriter(() => pg.query(`insert into studio.image_asks (fid, pool) values ($1, 'closed')`, [P]));
const b = await asWriter(() => pg.query(`insert into studio.image_asks (fid) values ($1)`, [P]));
check('studio_writer: a closed picture and an open one insert as the site writes them', !(a instanceof Error) && !(b instanceof Error), [a, b].filter((x) => x instanceof Error).map((x) => (x as Error).message).join('; '));
// The site's count (src/lib/images/limits.ts generationsLeft, with closed models on).
const counted = await asWriter(() => pg.query<{ n: number }>(`select coalesce(sum(case when pool = 'closed' then 3 else 1 end), 0)::int as n from studio.image_asks where fid = $1 and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`, [P]));
check('the site\'s weighted count reads a closed picture as 3 (4 in all)', !(counted instanceof Error) && counted.rows[0].n === 4, counted instanceof Error ? counted.message : String(counted.rows[0].n));
const bad = await asWriter(() => pg.query(`insert into studio.image_asks (fid, pool) values ($1, 'other')`, [P]));
check('a pool other than open or closed is refused', bad instanceof Error && /check constraint/.test(bad.message), bad instanceof Error ? bad.message : 'allowed');
const upd = await asWriter(() => pg.query(`update studio.image_asks set pool = 'open' where fid = $1`, [P]));
check('studio_writer can\'t change a row\'s pool', upd instanceof Error && /permission denied/.test(upd.message), upd instanceof Error ? upd.message : 'allowed');
const del = await asWriter(() => pg.query(`delete from studio.image_asks where fid = $1`, [P]));
check('studio_writer can\'t delete', del instanceof Error && /permission denied/.test(del.message), del instanceof Error ? del.message : 'allowed');
for (const role of ['anon', 'authenticated']) {
  await pg.exec(`set role ${role}`);
  const r = await pg.query(`select count(*) from studio.image_asks`).then(() => 'read', (e: Error) => e.message);
  await pg.exec('reset role');
  check(`${role} reads nothing`, /permission denied/.test(r), r);
}
await pg.exec(`delete from studio.image_asks where fid = ${P}`);

async function runReadBack(): Promise<string> {
  const notes: string[] = [];
  try {
    await pg.query(doBlock, [], { onNotice: (n: { message: string }) => notes.push(n.message) } as never);
    return notes.includes('READ-BACK PASSED') ? 'passed' : `no notice (${notes.join('; ')})`;
  } catch (e) {
    return (e as Error).message;
  }
}
const allTrue = async () => pg.query<{ ok: boolean }>(selectA).then((x) => x.rows.length === 4 && x.rows.every((r) => r.ok === true), () => false);
const rowsBefore = JSON.stringify((await pg.query(`select fid, at, pool from studio.image_asks order by at, fid`)).rows);
check('C (a): four rows, all true', await allTrue());
const rb = await runReadBack();
check('C (b) passes', rb === 'passed', rb);
check('C leaves every row as it was', JSON.stringify((await pg.query(`select fid, at, pool from studio.image_asks order by at, fid`)).rows) === rowsBefore);

async function planted(label: string, sql: string) {
  await pg.exec('begin');
  await pg.exec(sql);
  const r = await runReadBack();
  const ok = await allTrue();
  await pg.exec('rollback');
  proof(`${label} is caught by the read-back`, (r !== 'passed' && /READ-BACK FAILED|violates|permission/.test(r)) || !ok);
}
await planted('the check dropped (any pool accepted)', `alter table studio.image_asks drop constraint image_asks_pool`);
await planted('a default of closed (every picture would count as 3)', `alter table studio.image_asks alter column pool set default 'closed'`);
await planted('public access', `grant select on studio.image_asks to anon`);
check('after the plants, the read-back passes again', (await runReadBack()) === 'passed');

await pg.exec(undo);
const gone = (await pg.query(`select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'image_asks' and column_name = 'pool'`)).rows.length === 0;
const kept = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.image_asks where fid = 6852`)).rows[0].n === 3;
check('D undoes B (the column gone) and keeps the rows', gone && kept);
await pg.exec(mig);
check('B applies again after D', (await allTrue()) && (await runReadBack()) === 'passed');

console.log(`test:remix-model-choice-sql: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
