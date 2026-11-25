/**
 * NEXT_episode_outlines.sql (branch episode1-opening, 2026-11-24), tested on an in-memory Postgres (PGlite), the way
 * scripts/test-challenge-daily-sql.ts tests 0038: the three parts are read from the file itself, so what is tested is
 * what the owner pastes. Never a production database.
 *
 *   npm run test:episode-sql
 *
 * On a fresh database with every numbered migration and a realistic published version:
 * - the file says who runs it and has its three parts in order; the dry run is the migration word for word;
 * - the dry run leaves the schema, grants, policies and rows exactly as before;
 * - the migration applies, twice; the read-back passes and leaves every row as it was;
 * - as studio_writer, the app's own role: an outline inserts as src/lib/challenge/episode/outlines.ts inserts it;
 *   withdrawing and hiding set their columns once; un-withdrawing, un-hiding, changing the cards or the person,
 *   deleting, and inserting a row already withdrawn are refused; bad cards (11, empty, an extra key, a bad picture id,
 *   121 characters) and a line past the last card are refused; anon and authenticated read nothing;
 * - planted faults, each rolled back: a missing column grant, a delete grant, a table-wide update grant, the dropped
 *   trigger, the dropped line check, public access: the read-back catches each.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/NEXT_episode_outlines.sql');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);

const text = readFileSync(FILE, 'utf8');
const part = (n: number) => {
  const i = text.indexOf(`\n-- ${n}. `);
  const j = n < 3 ? text.indexOf(`\n-- ${n + 1}. `) : text.length;
  return i < 0 || j < 0 ? '' : text.slice(text.indexOf('\n', i + 1) + 1, j);
};
// Comments only at a line's start (the functions' bodies hold no "--").
const stripComments = (s: string) => s.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n').trim();
const dry = stripComments(part(1));
const mig = stripComments(part(2));
const readBack = part(3).split('\n').filter((l) => l.startsWith('-- ')).map((l) => l.slice(3)).join('\n');
const doBlock = readBack.slice(readBack.indexOf('do $$'));
const selectA = readBack.slice(readBack.indexOf('select n, what, ok'), readBack.indexOf(') t order by n;') + ') t order by n;'.length);
check('the file says who runs it (postgres, in the Supabase SQL Editor)', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text));
check('the file is unnumbered until merge (NEXT_)', path.basename(FILE).startsWith('NEXT_'));
check('three parts in order: the dry run ends in rollback, the migration in commit, then a read-back do block', dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && doBlock.startsWith('do $$') && /raise notice 'READ-BACK PASSED'/.test(doBlock));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back inserts and deletes a realistic row', /insert into studio\.challenge_outlines/.test(doBlock) && /delete from studio\.challenge_outlines/.test(doBlock));
check('the read-back never sets a role (the SQL Editor can\'t)', !/set role/i.test(readBack));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const V = '72222222-2222-4222-8222-222222222222';
await pg.exec(`
  insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.entities (id, work_id, kind, name) values ('70000000-0000-4000-8000-000000000001','snowmoon','character','Zei');
  insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('71111111-1111-4111-8111-111111111111','snowmoon','design',6786,'70000000-0000-4000-8000-000000000001','published');
  insert into studio.element_versions (id, element_id, version_no, body) values ('${V}','71111111-1111-4111-8111-111111111111', 1, '{"title":"Zei"}');`);

const snapshotOf = async () => {
  const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
  return [
    await q(`select table_name, column_name from information_schema.columns where table_schema = 'studio' order by 1, 2`),
    await q(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'studio' order by 1`),
    await q(`select schemaname, tablename, policyname from pg_policies where schemaname = 'studio' order by 1, 2, 3`),
    await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'studio' order by 1, 2, 3`),
    await q(`select id from studio.element_versions order by id`),
  ].join('\n');
};
const before = await snapshotOf();
await pg.exec(dry);
check('the dry run leaves everything as it was', (await snapshotOf()) === before);
await pg.exec(mig);
await pg.exec(mig);
check('the migration applies, and again (safe to run twice)', true);

async function runReadBack(): Promise<string> {
  const notes: string[] = [];
  try {
    await pg.query(doBlock, [], { onNotice: (n: { message: string }) => notes.push(n.message) } as never);
    return notes.includes('READ-BACK PASSED') ? 'passed' : `no notice (${notes.join('; ')})`;
  } catch (e) {
    return (e as Error).message;
  }
}
const rows = async () => JSON.stringify((await pg.query(`select * from studio.challenge_outlines order by id`)).rows);
const rowsBefore = await rows();
const rb = await runReadBack();
check('the read-back passes', rb === 'passed', rb);
const aRows = (await pg.query<{ n: number; ok: boolean }>(selectA)).rows;
check('read-back (a): nine rows, all true', aRows.length === 9 && aRows.every((r) => r.ok === true), JSON.stringify(aRows.filter((r) => !r.ok)));
check('the read-back leaves every row as it was', (await rows()) === rowsBefore);

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
const card = (h: string, d: string, picture: string | null = null) => ({ happens: h, does: d, picture });
const good = [card('A', 'B', V), card('C', 'D'), card('E', 'F')];
const insert = (cards: unknown, minute: number, extra = '') =>
  asWriter(() => pg.query<{ id: string }>(`insert into studio.challenge_outlines (challenge, fid, by_name, title, cards, minute_after, decision${extra ? ', withdrawn_at' : ''}) values ('episode-1', 2147483601, 'tester', 'A title', $1::jsonb, $2, 'passed'${extra ? `, ${extra}` : ''}) returning id`, [JSON.stringify(cards), minute]));
const ins = await insert(good, 2);
check('studio_writer: an outline inserts', !(ins instanceof Error), ins instanceof Error ? ins.message : '');
const id = ins instanceof Error ? '' : ins.rows[0].id;
const social = await asWriter(() => pg.query(`insert into studio.challenge_outlines (challenge, fid, cards, minute_after, decision) values ('episode-1', -1000000001, $1::jsonb, 0, 'passed')`, [JSON.stringify(good)]));
check('studio_writer: a Lens or Bluesky person number (negative) inserts', !(social instanceof Error), social instanceof Error ? social.message : '');
const w1 = await asWriter(() => pg.query(`update studio.challenge_outlines set withdrawn_at = now() where id = $1 and withdrawn_at is null`, [id]));
check('studio_writer: withdrawing sets withdrawn_at', !(w1 instanceof Error) && w1.affectedRows === 1, w1 instanceof Error ? w1.message : '');
const un = await asWriter(() => pg.query(`update studio.challenge_outlines set withdrawn_at = null where id = $1`, [id]));
check('studio_writer: un-withdrawing is refused', un instanceof Error && /stays withdrawn/.test(un.message), un instanceof Error ? un.message : 'allowed');
const h1 = await asWriter(() => pg.query(`update studio.challenge_outlines set hidden_at = now(), hidden_by = 6786 where id = $1 and hidden_at is null`, [id]));
check('studio_writer: hiding sets hidden_at and hidden_by', !(h1 instanceof Error) && h1.affectedRows === 1, h1 instanceof Error ? h1.message : '');
const unh = await asWriter(() => pg.query(`update studio.challenge_outlines set hidden_at = null, hidden_by = null where id = $1`, [id]));
check('studio_writer: un-hiding is refused', unh instanceof Error && /stays hidden/.test(unh.message), unh instanceof Error ? unh.message : 'allowed');
const half = await asWriter(() => pg.query(`update studio.challenge_outlines set hidden_at = now() where fid = -1000000001`));
check('hidden without who hid it is refused', half instanceof Error && /check constraint/.test(half.message), half instanceof Error ? half.message : 'allowed');
for (const [label, sql] of [
  ['changing the cards', `update studio.challenge_outlines set cards = '[]'::jsonb where id = '${id}'`],
  ['changing the person', `update studio.challenge_outlines set fid = 1 where id = '${id}'`],
  ['deleting', `delete from studio.challenge_outlines where id = '${id}'`],
] as const) {
  const r = await asWriter(() => pg.query(sql));
  check(`studio_writer: ${label} is refused`, r instanceof Error && /permission denied/.test(r.message), r instanceof Error ? r.message : 'allowed');
}
const pre = await insert(good, 1, 'now()');
check('studio_writer: inserting a row already withdrawn is refused', pre instanceof Error, pre instanceof Error ? '' : 'allowed');
const many = Array.from({ length: 11 }, (_, i) => card(`h${i}`, `d${i}`));
for (const [label, cards, minute] of [
  ['eleven cards', many, 1],
  ['no cards', [], 0],
  ['an empty "what happens"', [card('   ', 'x')], 1],
  ['a card with an extra key', [{ happens: 'a', does: 'b', note: 'c' }], 1],
  ['a picture that is not a version id', [card('a', 'b', 'not-a-uuid')], 1],
  ['121 characters', [card('x'.repeat(121), 'b')], 1],
  ['a card that is not an object', ['a card'], 1],
  ['a line past the last card', good, 4],
  ['a negative line', good, -1],
] as const) {
  const r = await insert(cards, minute);
  check(`refused: ${label}`, r instanceof Error && /check constraint/.test(r.message), r instanceof Error ? r.message : 'allowed');
}
const ten = await insert(Array.from({ length: 10 }, (_, i) => card('x'.repeat(120), `d${i}`)), 10);
check('accepted: ten cards of 120 characters, the line after the last', !(ten instanceof Error), ten instanceof Error ? ten.message : '');
for (const role of ['anon', 'authenticated']) {
  await pg.exec(`set role ${role}`);
  const r = await pg.query(`select count(*) from studio.challenge_outlines`).then(() => 'read', (e: Error) => e.message);
  await pg.exec('reset role');
  check(`${role} reads nothing`, /permission denied/.test(r), r);
}
await pg.exec(`delete from studio.challenge_outlines`);

async function planted(label: string, sql: string) {
  await pg.exec('begin');
  await pg.exec(sql);
  const r = await runReadBack();
  const a = await pg.query<{ ok: boolean }>(selectA).then((x) => x.rows.some((row) => row.ok !== true), () => true);
  await pg.exec('rollback');
  proof(`${label} is caught by the read-back`, (r !== 'passed' && /READ-BACK FAILED/.test(r)) || a);
}
await planted('a missing column grant (studio_writer can\'t hide)', `revoke update (hidden_at) on studio.challenge_outlines from studio_writer`);
await planted('a delete grant', `grant delete on studio.challenge_outlines to studio_writer`);
await planted('a table-wide update grant', `grant update on studio.challenge_outlines to studio_writer`);
await planted('the dropped trigger (un-withdrawing allowed)', `drop trigger challenge_outlines_stay on studio.challenge_outlines`);
await planted('the dropped line check', `alter table studio.challenge_outlines drop constraint challenge_outlines_minute_in_deck`);
await planted('the dropped decision check', `alter table studio.challenge_outlines drop constraint challenge_outlines_decision_check`);
await planted('public access', `grant select on studio.challenge_outlines to anon`);
check('after the plants, the read-back passes again', (await runReadBack()) === 'passed');

console.log(`test:episode-sql: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
