/**
 * X posts from Discord (owner, 2026-11-25; branch x-posts; docs/proposals/x-posts.md). No network, no production
 * database: an in-memory Postgres (PGlite) with every numbered migration, then NEXT_x_posts.sql part by part. Fails
 * (exit 1) on any problem; each rule is proven on a planted fault ("proof: …").
 *
 *   npm run test:x-posts
 *
 * - Delete and redraft: a new open team card with the same text, once per card, logged on both cards.
 * - A posted card is frozen (version 2): only posted to deleted, nothing else changed; a deleted card never changes.
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
    await q(`select proname from pg_proc where pronamespace = 'studio'::regnamespace and proname like 'x\\_%' order by 1`),
    await q(`select tgname from pg_trigger where tgrelid::regclass::text like 'studio.x\\_%' and not tgisinternal order by 1`),
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
// A posted card is frozen, as studio_writer (owner, 2026-11-25: version 1 let it rewrite or reopen one).
const tryAs = async (s: string) => {
  try {
    await pg.exec(s);
    return true;
  } catch {
    await pg.exec('rollback to savepoint t;').catch(() => {});
    return false;
  }
};
await pg.exec(`begin;`);
await pg.exec(`insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, link) values ('team', '100000000000000001', 'naaate', 'Posted text', 'https://snowmoon.party/a');`);
const idRow = (await pg.query<{ id: number }>(`select id from studio.x_proposals where body = 'Posted text'`)).rows[0];
const id = idRow.id;
const openEdit = await tryAs(`savepoint t; update studio.x_proposals set body = 'Edited while open' where id = ${id}; update studio.x_proposals set body = 'Posted text' where id = ${id}; release savepoint t;`);
const toPosting = await tryAs(`savepoint t; update studio.x_proposals set status = 'posting' where id = ${id} and status = 'open'; release savepoint t;`);
const backToOpen = await tryAs(`savepoint t; update studio.x_proposals set status = 'open' where id = ${id}; update studio.x_proposals set status = 'posting' where id = ${id}; release savepoint t;`);
const toPosted = await tryAs(`savepoint t; update studio.x_proposals set status = 'posted', x_post_id = '1993000000000000009', posted_at = now() where id = ${id}; release savepoint t;`);
const postedBody = await tryAs(`savepoint t; update studio.x_proposals set body = 'Rewritten' where id = ${id}; release savepoint t;`);
const postedLink = await tryAs(`savepoint t; update studio.x_proposals set link = 'https://snowmoon.party/b' where id = ${id}; release savepoint t;`);
const reopened = await tryAs(`savepoint t; update studio.x_proposals set status = 'open', x_post_id = null, posted_at = null where id = ${id}; release savepoint t;`);
const newPostId = await tryAs(`savepoint t; update studio.x_proposals set x_post_id = '1993000000000000010' where id = ${id}; release savepoint t;`);
const deleteAndEdit = await tryAs(`savepoint t; update studio.x_proposals set status = 'deleted', deleted_at = now(), body = 'Rewritten' where id = ${id}; release savepoint t;`);
const toDeleted = await tryAs(`savepoint t; update studio.x_proposals set status = 'deleted', deleted_at = now(), updated_at = now() where id = ${id}; release savepoint t;`);
const afterDelete = (await pg.query<{ status: string; body: string; link: string; x_post_id: string }>(`select status, body, link, x_post_id from studio.x_proposals where id = ${id}`)).rows[0];
const deletedChange = await tryAs(`savepoint t; update studio.x_proposals set status = 'posted', deleted_at = null where id = ${id}; release savepoint t;`);
const deletedTouch = await tryAs(`savepoint t; update studio.x_proposals set updated_at = now() where id = ${id}; release savepoint t;`);
await pg.exec(`rollback;`);
await pg.exec(`reset role;`);
check('an open card can still be edited, claimed for posting and put back', openEdit && toPosting && backToOpen);
check('a card can be marked posted with its X post', toPosted);
check("a posted card's text can't be changed", !postedBody);
check("a posted card's link can't be changed", !postedLink);
check("a posted card can't be reopened", !reopened);
check("a posted card's X post can't be changed", !newPostId);
check("a delete that also changes the text is refused", !deleteAndEdit);
check('posted to deleted still works, and keeps the card as posted', toDeleted && afterDelete?.status === 'deleted' && afterDelete.body === 'Posted text' && afterDelete.link === 'https://snowmoon.party/a' && afterDelete.x_post_id === '1993000000000000009');
check('a deleted card never changes', !deletedChange && !deletedTouch);
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
  ['two redrafts of one card allowed', 'drop index studio.x_proposals_one_redraft;'],
  ['a redraft without its other card in the log', 'alter table studio.x_post_log drop constraint x_post_log_redraft;'],
  ['no voice_take kind', "alter table studio.x_proposals drop constraint x_proposals_subject_kind_check; alter table studio.x_proposals add constraint x_proposals_subject_kind_check check (subject_kind in ('voice_publication', 'challenge_entry'));"],
  ['any kind of work allowed', 'alter table studio.x_proposals drop constraint x_proposals_subject_kind_check;'],
  ['no freeze on posted cards', 'drop trigger x_proposals_freeze on studio.x_proposals;'],
  ['a freeze that also refuses the delete', `create or replace function studio.x_proposals_freeze() returns trigger language plpgsql as $f$ begin if old.status in ('posted', 'deleted') then raise exception 'plant: frozen' using errcode = 'check_violation'; end if; return new; end $f$;`],
  ['a freeze that lets a deleted card change', `create or replace function studio.x_proposals_freeze() returns trigger language plpgsql as $f$ begin if old.status = 'posted' and new.status <> 'deleted' then raise exception 'plant: frozen' using errcode = 'check_violation'; end if; if old.status = 'posted' and new.body is distinct from old.body then raise exception 'plant: frozen' using errcode = 'check_violation'; end if; if old.status = 'posted' and new.link is distinct from old.link then raise exception 'plant: frozen' using errcode = 'check_violation'; end if; return new; end $f$;`],
] as const) {
  await pg.exec(`begin; ${plant}`);
  const r = await runReadBack(readBack.replace(/^begin;/, 'savepoint s;').replace(/rollback;\s*$/, 'rollback to savepoint s;'));
  await pg.exec('rollback;').catch(() => {});
  proof(`the read-back fails on ${name}`, !r.ok && /READ-BACK FAILED|violates|plant: /.test(r.why));
}
// D, then B again.
await pg.exec(undo);
check('D removes the three tables and the trigger function', (await snapshot()) === before);
await pg.exec(mig);
check('B applies again after D', /x_proposals/.test(await snapshot()));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}
