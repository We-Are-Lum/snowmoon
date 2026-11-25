/**
 * X posts from Discord (owner, 2026-11-25; branch x-posts; docs/proposals/x-posts.md). No network, no production
 * database: an in-memory Postgres (PGlite) with every numbered migration, then NEXT_x_posts.sql part by part. Fails
 * (exit 1) on any problem; each rule is proven on a planted fault ("proof: …").
 *
 *   npm run test:x-posts
 *
 * - NEXT_x_posts.sql: who runs it; A is B word for word; A leaves everything as it was; B applies twice; C's read-back
 *   passes and keeps nothing; D undoes it; studio_writer's rights are exactly the site's (the log insert-only, no
 *   proposal ever deleted), anon and authenticated have none; planted faults make C fail.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

// --- The migration file -------------------------------------------------------------------------------------------
const FILE = 'supabase/migrations/NEXT_x_posts.sql';
const text = read(FILE);
const at = (h: string) => text.indexOf(`\n-- ${h}`);
const between = (a: string, b: string | null) => text.slice(text.indexOf('\n', at(a) + 1) + 1, b ? at(b) : text.length);
const strip = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const dry = strip(between('A. DRY RUN', 'B. MIGRATION'));
const mig = strip(between('B. MIGRATION', 'C. READ-BACK'));
/** The pasted part of a commented section: its lines from "-- begin;" through its last "-- rollback;" or "-- commit;", without "-- ". */
const uncomment = (s: string) => {
  const lines = s.split('\n');
  const i = lines.findIndex((l) => l === '-- begin;');
  const j = lines.map((l, k) => (/^-- (rollback|commit);$/.test(l) ? k : -1)).filter((k) => k > i).pop() ?? -1;
  return i < 0 || j < 0 ? '' : lines.slice(i, j + 1).map((l) => l.replace(/^-- ?/, '')).join('\n');
};
const readBack = uncomment(between('C. READ-BACK', 'D. UNDO'));
const undo = uncomment(between('D. UNDO', null));
const TABLES = ['x_proposals', 'x_approvals', 'x_post_log'];
check('the file says who runs it (postgres, in the Supabase SQL Editor)', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text));
check('unnumbered on the branch (NEXT_), and says it is not applied', /^NEXT_/.test(path.basename(FILE)) && /NOT APPLIED/.test(text));
check('A ends in rollback, B in commit, C in a rolled-back read-back ending READ-BACK PASSED, then D', dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && readBack.startsWith('begin;') && readBack.trim().endsWith('rollback;') && /READ-BACK PASSED/.test(readBack) && /drop table/.test(undo));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back inserts and deletes realistic rows in every table', TABLES.every((t) => new RegExp(`insert into studio\\.${t}`).test(readBack) && new RegExp(`delete from studio\\.${t}`).test(readBack)));
check('the read-back sets no role (the SQL Editor cannot)', !/set role/i.test(readBack));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
const snapshot = async () => {
  const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
  return [
    await q(`select table_name, column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name like 'x\\_%' order by 1, 2`),
    await q(`select tablename, policyname from pg_policies where schemaname = 'studio' and tablename like 'x\\_%' order by 1, 2`),
    await q(`select count(*) from information_schema.tables where table_schema = 'studio'`),
  ].join('\n');
};
const before = await snapshot();
check('before B, there are no X posts tables', !/x_proposals/.test(before));
await pg.exec(dry);
check('the dry run leaves everything as it was', (await snapshot()) === before);
await pg.exec(mig);
let twice = true;
try {
  await pg.exec(mig);
} catch (e) {
  twice = false;
  console.log(String(e));
}
check('the migration applies, and applies again (safe to run twice)', twice);
const runReadBack = async (sqlText: string) => {
  try {
    await pg.exec(sqlText);
  } catch (e) {
    await pg.exec('rollback;').catch(() => {});
    return { ok: false, why: String((e as Error).message) };
  }
  return { ok: true, why: '' };
};
const rb = await runReadBack(readBack);
check('the read-back passes', rb.ok, rb.why);
check('the read-back keeps nothing', Number((await pg.query<{ n: number }>(`select (select count(*) from studio.x_proposals) + (select count(*) from studio.x_approvals) + (select count(*) from studio.x_post_log) as n`)).rows[0].n) === 0);
const priv = async (role: string, t: string, p: string) => (await pg.query<{ v: boolean }>(`select has_table_privilege('${role}', 'studio.${t}', '${p}') as v`)).rows[0].v;
const rights = async (role: string, t: string) => (await Promise.all(['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map(async (p) => ((await priv(role, t, p)) ? p : '')))).filter(Boolean).join(',');
check('studio_writer on x_proposals: select, insert, update (never delete)', (await rights('studio_writer', 'x_proposals')) === 'select,insert,update');
check('studio_writer on x_approvals: select, insert, delete', (await rights('studio_writer', 'x_approvals')) === 'select,insert,delete');
check('studio_writer on x_post_log: select, insert only (append-only)', (await rights('studio_writer', 'x_post_log')) === 'select,insert');
for (const r of ['anon', 'authenticated']) for (const t of TABLES) check(`${r} has no rights on ${t}`, (await rights(r, t)) === '');
// The site's own writes, as studio_writer: an insert works through the identity column without a sequence grant.
await pg.exec(`set role studio_writer;`);
let writerInsert = true;
try {
  await pg.exec(`begin; insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body) values ('team', '100000000000000001', 'naaate', 'Hello'); insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, body) select id, 'proposed', '100000000000000001', 'naaate', 'Hello' from studio.x_proposals; rollback;`);
} catch (e) {
  writerInsert = false;
  console.log(String(e));
  await pg.exec('rollback;').catch(() => {});
}
let writerLogUpdate = false;
try {
  await pg.exec(`begin; update studio.x_post_log set detail = 'x'; rollback;`);
  writerLogUpdate = true;
} catch {
  await pg.exec('rollback;').catch(() => {});
}
await pg.exec(`reset role;`);
check('studio_writer can insert a proposal and its log row', writerInsert);
check('studio_writer cannot change the log', !writerLogUpdate);
// Planted faults: each must make the read-back fail.
for (const [name, plant] of [
  ['an update grant on the log', 'grant update on studio.x_post_log to studio_writer;'],
  ['a delete grant on proposals', 'grant delete on studio.x_proposals to studio_writer;'],
  ['a read grant to anon', 'grant select on studio.x_approvals to anon;'],
  ['row level security off', 'alter table studio.x_post_log disable row level security;'],
  ['no check on Discord IDs', 'alter table studio.x_proposals drop constraint x_proposals_proposer_discord_id_check;'],
  ['two suggestions for one work allowed', 'drop index studio.x_proposals_one_suggestion;'],
  ['posted without an X post allowed', 'alter table studio.x_proposals drop constraint x_proposals_posted;'],
  ['a check that refuses every post', "alter table studio.x_proposals add constraint plant check (body = '');"],
  ['a link check that refuses every link', "alter table studio.x_proposals add constraint plant check (link is null);"],
] as const) {
  await pg.exec(`begin; ${plant}`);
  const r = await runReadBack(readBack.replace(/^begin;/, 'savepoint s;').replace(/rollback;\s*$/, 'rollback to savepoint s;'));
  await pg.exec('rollback;').catch(() => {});
  proof(`the read-back fails on ${name}`, !r.ok && /READ-BACK FAILED|violates/.test(r.why));
}
// D, then B again.
await pg.exec(undo);
check('D removes the three tables', (await snapshot()) === before);
await pg.exec(mig);
check('B applies again after D', /x_proposals/.test(await snapshot()));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}
