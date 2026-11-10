/**
 * 0041_image_asks_back.sql (branch challenge-models, owner 2026-11-09), tested on an in-memory Postgres (PGlite), as
 * scripts/test-remix-model-choice-sql.ts tests its file: the parts are read from the file itself, so what is tested is
 * what the owner pastes. Never a production database.
 *
 *   npm run test:image-asks-back-sql
 *
 * - the file says who runs it, has its four parts in order, the dry run is the migration word for word, and the
 *   read-back sets no role and inserts and deletes a realistic row;
 * - A leaves everything as it was; B applies, and again;
 * - as studio_writer a row given back inserts and reads as the site writes it, and the site's count (made minus given
 *   back) reads 1 of 2; studio_writer can't update or delete; anon and authenticated read nothing;
 * - C (a) is all true, C (b) passes and leaves every row as it was; planted faults are caught;
 * - D undoes B, and B applies again after it.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/0041_image_asks_back.sql');
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

check('the file says who runs it (postgres, in the Supabase SQL Editor) and that it is not applied', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text) && /NOT APPLIED/.test(text));
check('four parts in order: A ends in rollback, B in commit, C a select and a do block, D the undo', ['A', 'B', 'C', 'D'].every((k, i, a) => i === 0 || text.indexOf(`\n-- ${a[i - 1]}. `) < text.indexOf(`\n-- ${k}. `)) && dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && selectA.startsWith('select n, what, ok') && doBlock.startsWith('do $$') && /READ-BACK PASSED/.test(doBlock) && undo.startsWith('begin;') && undo.endsWith('commit;'));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
const setsRole = (sql: string) => /\bset\s+(local\s+|session\s+)?role\b/i.test(sql);
check('the read-back sets no role (postgres can\'t SET ROLE in the SQL Editor)', !setsRole(C));
check('the read-back inserts and deletes a realistic row', /insert into studio\.image_asks_back/.test(doBlock) && /delete from studio\.image_asks_back/.test(doBlock));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations/0040_remix_model_choice.sql'), 'utf8'));
await pg.exec(`insert into studio.image_asks (fid, at) values (6852, now()), (6852, now() - interval '1 day')`);

async function snapshot(): Promise<string> {
  const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
  return [
    await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'studio' and table_name like 'image_asks%' order by 1, 2`),
    await q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'studio' and table_name like 'image_asks%' order by 1, 2, 3`),
    await q(`select fid, at from studio.image_asks order by at, fid`),
  ].join('\n');
}
const before = await snapshot();
await pg.exec(dry);
check('A (the dry run) leaves everything as it was', (await snapshot()) === before);
await pg.exec(mig);
await pg.exec(mig);
check('B applies, and again (safe to run twice)', true);

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
const made = await asWriter(() => pg.query(`insert into studio.image_asks (fid) values ($1), ($1)`, [P]));
const back = await asWriter(() => pg.query(`insert into studio.image_asks_back (fid) values ($1)`, [P]));
check('studio_writer: a picture given back inserts as the site writes it', !(made instanceof Error) && !(back instanceof Error), [made, back].filter((x) => x instanceof Error).map((x) => (x as Error).message).join('; '));
// The site's count (src/lib/images/limits.ts generationsLeft): today's pictures made, less today's given back.
const DAY = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
const counted = await asWriter(() => pg.query<{ n: number }>(`select (select count(*)::int from studio.image_asks where fid = $1 and at >= ${DAY}) - (select count(*)::int from studio.image_asks_back where fid = $1 and at >= ${DAY}) as n`, [P]));
check('the site\'s count reads 1 used of 2 made, one given back', !(counted instanceof Error) && counted.rows[0].n === 1, counted instanceof Error ? counted.message : String(counted.rows[0].n));
const upd = await asWriter(() => pg.query(`update studio.image_asks_back set at = now() where fid = $1`, [P]));
check('studio_writer can\'t change a row', upd instanceof Error && /permission denied/.test(upd.message), upd instanceof Error ? upd.message : 'allowed');
const del = await asWriter(() => pg.query(`delete from studio.image_asks_back where fid = $1`, [P]));
check('studio_writer can\'t delete', del instanceof Error && /permission denied/.test(del.message), del instanceof Error ? del.message : 'allowed');
for (const role of ['anon', 'authenticated']) {
  await pg.exec(`set role ${role}`);
  const r = await pg.query(`select count(*) from studio.image_asks_back`).then(() => 'read', (e: Error) => e.message);
  await pg.exec('reset role');
  check(`${role} reads nothing`, /permission denied/.test(r), r);
}
await pg.exec(`delete from studio.image_asks_back where fid = ${P}; delete from studio.image_asks where fid = ${P}`);

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
const rowsBefore = await snapshot();
check('C (a): four rows, all true', await allTrue());
const rb = await runReadBack();
check('C (b) passes', rb === 'passed', rb);
check('C leaves every row as it was', (await snapshot()) === rowsBefore);

async function planted(label: string, sql: string) {
  await pg.exec('begin');
  await pg.exec(sql);
  const r = await runReadBack();
  const ok = await allTrue();
  await pg.exec('rollback');
  proof(`${label} is caught by the read-back`, r !== 'passed' || !ok);
}
await planted('studio_writer can delete', `grant delete on studio.image_asks_back to studio_writer`);
await planted('studio_writer can update', `grant update on studio.image_asks_back to studio_writer`);
await planted('studio_writer can\'t insert', `revoke insert on studio.image_asks_back from studio_writer`);
await planted('public access', `grant select on studio.image_asks_back to anon`);
await planted('row level security off', `alter table studio.image_asks_back disable row level security`);
await planted('each given-back picture written twice', `create function studio.plant_twice() returns trigger language plpgsql as $f$ begin if new.fid = 2147483646 and pg_trigger_depth() = 1 then insert into studio.image_asks_back (fid) values (new.fid); end if; return new; end $f$;
  create trigger plant_twice after insert on studio.image_asks_back for each row execute function studio.plant_twice();`);
await planted('rows left behind', `create rule plant_keep as on delete to studio.image_asks_back where old.fid = 2147483646 do instead nothing;`);
check('after the plants, the read-back passes again', (await runReadBack()) === 'passed');

await pg.exec(undo);
const gone = (await pg.query(`select to_regclass('studio.image_asks_back') is null as gone`)).rows[0] as { gone: boolean };
check('D undoes B (the table gone), image_asks kept', gone.gone && (await pg.query<{ n: number }>(`select count(*)::int as n from studio.image_asks where fid = 6852`)).rows[0].n === 2);
await pg.exec(mig);
check('B applies again after D', (await allTrue()) && (await runReadBack()) === 'passed');

console.log(`test:image-asks-back-sql: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
