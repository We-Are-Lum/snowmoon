/**
 * NEXT_challenge_backstories.sql (branch challenge-models, 2026-11-09), tested on an in-memory Postgres (PGlite), the
 * parts read from the file itself (as test:remix-model-choice-sql does). Never a production database.
 *
 *   npm run test:challenge-backstories-sql
 *
 * The four parts in order, the dry run the migration word for word; A changes nothing; B applies twice; as
 * studio_writer a backstory inserts and reads, but can't be changed or deleted; anon reads nothing; the read-back sets no
 * role, passes and leaves every row as it was, and each of its raises fires on a planted fault; D undoes B.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const text = readFileSync(path.join(ROOT, 'supabase/migrations/NEXT_challenge_backstories.sql'), 'utf8');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const part = (k: string) => {
  const order = ['A', 'B', 'C', 'D'];
  const i = text.indexOf(`\n-- ${k}. `);
  const next = order[order.indexOf(k) + 1];
  const j = next ? text.indexOf(`\n-- ${next}. `) : text.length;
  return i < 0 || j < 0 ? '' : text.slice(text.indexOf('\n', i + 1) + 1, j);
};
const strip = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const uncomment = (s: string) => s.split('\n').filter((l) => l.startsWith('-- ')).map((l) => l.slice(3)).join('\n');
const dry = strip(part('A')), mig = strip(part('B')), C = uncomment(part('C'));
const selectA = C.slice(C.indexOf('select n, what, ok'), C.indexOf(') as t(n, what, ok) order by n;') + ') as t(n, what, ok) order by n;'.length);
const doBlock = C.slice(C.indexOf('do $$'), C.lastIndexOf('end $$;') + 'end $$;'.length);
const undo = uncomment(part('D')).split('\n').filter((l) => !/^[A-Z]/.test(l)).join('\n').trim();
const setsRole = (s: string) => /\bset\s+(local\s+|session\s+)?role\b/i.test(s);

check('the file says who runs it and that it is not applied', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text) && /NOT APPLIED/.test(text));
check('four parts: A ends in rollback, B in commit, C a select and a do block, D the undo', dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && selectA.startsWith('select') && doBlock.startsWith('do $$') && undo.startsWith('begin;') && undo.endsWith('commit;'));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back sets no role (postgres can\'t switch roles in the SQL Editor)', !setsRole(C));
check('proof: a read-back with SET ROLE is caught', setsRole('do $$ begin set local role studio_writer; end $$;'));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`
  insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.elements (id, work_id, element_type, created_by_fid, status) values ('71111111-1111-4111-8111-111111111111','snowmoon','image',6786,'published');
  insert into studio.element_versions (id, element_id, version_no, body) values ('72222222-2222-4222-8222-222222222222','71111111-1111-4111-8111-111111111111', 1, '{"lettering":[]}');`);
const snap = async () => JSON.stringify((await pg.query(`select table_name from information_schema.tables where table_schema = 'studio' order by 1`)).rows);
const before = await snap();
await pg.exec(dry);
check('A leaves the schema as it was', (await snap()) === before);
await pg.exec(mig);
await pg.exec(mig);
check('B applies, and again', true);

const asWriter = async <T>(fn: () => Promise<T>): Promise<T | Error> => {
  await pg.exec('set role studio_writer');
  try { return await fn(); } catch (e) { return e as Error; } finally { await pg.exec('reset role'); }
};
const V = '72222222-2222-4222-8222-222222222222';
const ins = await asWriter(() => pg.query(`insert into studio.challenge_backstories (version_id, text, spoils, added_by) values ($1, 'She keeps the map now.', false, 6786) returning id`, [V]));
check('studio_writer: a backstory inserts as the site writes it', !(ins instanceof Error), ins instanceof Error ? ins.message : '');
const read = await asWriter(() => pg.query<{ text: string }>(`select text from studio.challenge_backstories where version_id = $1`, [V]));
check('studio_writer: it reads back', !(read instanceof Error) && read.rows[0]?.text === 'She keeps the map now.');
const upd = await asWriter(() => pg.query(`update studio.challenge_backstories set text = 'x'`));
check('studio_writer can\'t change a backstory', upd instanceof Error && /permission denied/.test(upd.message), upd instanceof Error ? upd.message : 'allowed');
const del = await asWriter(() => pg.query(`delete from studio.challenge_backstories`));
check('studio_writer can\'t delete a backstory', del instanceof Error && /permission denied/.test(del.message), del instanceof Error ? del.message : 'allowed');
const long = await asWriter(() => pg.query(`insert into studio.challenge_backstories (version_id, text, added_by) values ($1, repeat('x', 401), 6786)`, [V]));
check('over 400 characters is refused', long instanceof Error && /check constraint/.test(long.message));
for (const role of ['anon', 'authenticated']) {
  await pg.exec(`set role ${role}`);
  const r = await pg.query(`select count(*) from studio.challenge_backstories`).then(() => 'read', (e: Error) => e.message);
  await pg.exec('reset role');
  check(`${role} reads nothing`, /permission denied/.test(r), r);
}

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
const rows = JSON.stringify((await pg.query(`select * from studio.challenge_backstories order by id`)).rows);
check('C (a): four rows, all true', await allTrue());
check('C (b) passes', (await runReadBack()) === 'passed');
check('C leaves every row as it was', JSON.stringify((await pg.query(`select * from studio.challenge_backstories order by id`)).rows) === rows);
async function raises(label: string, sql: string, want: RegExp) {
  await pg.exec('begin');
  await pg.exec(sql);
  const r = await runReadBack();
  await pg.exec('rollback');
  check(`proof: ${label}: the read-back raises "${want.source}"`, want.test(r), r);
}
await raises('studio_writer can update', `grant update on studio.challenge_backstories to studio_writer`, /READ-BACK FAILED: studio_writer can change or delete backstories/);
await raises('studio_writer can delete', `grant delete on studio.challenge_backstories to studio_writer`, /READ-BACK FAILED: studio_writer can change or delete backstories/);
await raises('studio_writer can\'t insert', `revoke insert on studio.challenge_backstories from studio_writer`, /READ-BACK FAILED: studio_writer cannot add a backstory/);
await raises('the length check dropped', `alter table studio.challenge_backstories drop constraint challenge_backstories_text_check`, /READ-BACK FAILED: a backstory over 400 characters was accepted/);
await raises('rows left behind', `create rule plant_keep as on delete to studio.challenge_backstories where old.added_by = 2147483646 do instead nothing;`, /READ-BACK FAILED: 1 test rows left after the delete/);
await pg.exec(undo);
check('D undoes B (the table gone)', (await pg.query<{ t: string | null }>(`select to_regclass('studio.challenge_backstories')::text as t`)).rows[0].t === null);
await pg.exec(mig);
check('B applies again after D, and the read-back passes', (await allTrue()) && (await runReadBack()) === 'passed');

console.log(`test:challenge-backstories-sql: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
