/**
 * NEXT_linked_accounts (docs/proposals/linked-accounts.md), tested on an in-memory Postgres (PGlite). Never a production
 * database. Drafted by a coding agent (Claude, a closed model by Anthropic).
 *
 *   npm run test:linked-accounts-sql
 *
 * On a fresh database: main's numbered migrations (0001..0034, word for word as origin/main has them), made-up links
 * of today's kinds (a wallet linked to a FID, one unlinked, a Lens account linked to a FID, a Bluesky account linked
 * to that Lens account), then the SQL pack's pending items in apply order (2, 5, 3, 4, read from
 * docs/legal/sql-pack-2026-11-04.md on origin/sql-pack), then this migration:
 * - its blocks have the shape CLAUDE.md asks for: A is B ending in rollback; (a) is one select; (b) is one do block,
 *   with no set role and no temp table, raising "READ-BACK FAILED" and ending with "READ-BACK PASSED";
 * - A leaves nothing; B applies; the backfill puts each link where it belongs; (a), read only, is all true; (b)
 *   passes and leaves every row as it was; a second B stops with an error and changes nothing;
 * - as studio_writer: realistic rows go in; a row can only be ended, never changed or deleted; nothing for anon;
 * - planted faults, each rolled back: (a) shows a false row or (b) raises READ-BACK FAILED;
 * - the pack's read-backs still pass with this applied; the docs' copy blocks are this file's blocks, word for word;
 * - the whole file runs as one script in the folder's name order (as the other test runners apply it), before the
 *   pack's tables exist, and keeps no rows.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/NEXT_linked_accounts.sql');
const DOC = path.join(ROOT, 'docs/legal/linked-accounts-sql-for-owner.md');
const failures: string[] = [];
let passed = 0;
const log: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  log.push(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const gitShow = (ref: string) => {
  try {
    return execFileSync('git', ['show', ref], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
  } catch {
    return null;
  }
};
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '').trim();

// --- The blocks ------------------------------------------------------------------------------------------------------
const file = readFileSync(FILE, 'utf8');
const between = (from: string, to: string | null) => {
  const i = file.indexOf(from);
  if (i < 0) throw new Error(`no "${from}" in the migration`);
  const j = to ? file.indexOf(to, i + from.length) : file.length;
  return file.slice(i, j < 0 ? file.length : j);
};
const A = between('-- A. DRY RUN', '-- B. THE MIGRATION');
const B = between('-- B. THE MIGRATION.', '-- C. READ-BACK');
const C = between('\n-- (a)\n', '\n-- (b)\n');
const D = between('\n-- (b)\n', null);
const body = (s: string, end: string) => {
  const t = stripComments(s);
  return t.startsWith('begin;') && t.endsWith(end) ? t.slice('begin;'.length, -end.length).trim() : null;
};
check('A is B with rollback in place of commit', body(A, 'rollback;') !== null && body(A, 'rollback;') === body(B, 'commit;'));
const c = stripComments(C).replace(/'(?:[^']|'')*'/g, "''");
check('(a) is one read-only select', /^select\b/i.test(c) && c.endsWith(';') && c.slice(0, -1).split(';').length === 1 && !/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i.test(c));
const d = stripComments(D);
check('(b) is one do block: no set role, no temp table, READ-BACK FAILED and PASSED', /^do \$\$/.test(d) && d.endsWith('end $$;') && d.split('$$').length === 3 && !/set\s+role/i.test(d) && !/\btemp(orary)?\b/i.test(d) && /READ-BACK FAILED/.test(d) && /READ-BACK PASSED/.test(d));
check('the header says who runs it and where', /MUST RUN AS postgres/.test(file) && /Supabase SQL Editor/.test(file) && /DRAFT, NOT APPLIED/.test(file));
check('the header says it was drafted by a coding agent', /coding agent \(Claude, a closed model by Anthropic\)/.test(file));

// The owner's copy blocks are this file's, word for word.
{
  let doc = '';
  try {
    doc = readFileSync(DOC, 'utf8');
  } catch {
    /* checked below */
  }
  const blocks = [...doc.matchAll(/```sql\n([\s\S]*?)\n```/g)].map((m) => m[1].trim());
  const want = [A, B, C, D].map((s) => s.replace(/^-- \(a\)\n|^-- \(b\)\n/, '').trim());
  check('the doc has four copy blocks: A, B, (a), (b)', blocks.length === 4, String(blocks.length));
  for (let i = 0; i < 4; i++) {
    const strip = (s: string) => stripComments(s ?? '').replace(/\s+/g, ' ');
    check(`the doc's block ${'AB'[i] ?? `(${'ab'[i - 2]})`} is the migration's, word for word (comments aside)`, strip(blocks[i]) === strip(want[i]));
  }
}

// --- The database -----------------------------------------------------------------------------------------------------
const numbered = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const mainList = gitShow('origin/main:supabase/migrations');
if (mainList === null) log.push('skip: the numbered migrations against origin/main (git show unavailable)');
else {
  const onMain = mainList.split('\n').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  check('this branch has exactly origin/main\'s numbered migrations (0001..0034)', onMain.join() === numbered.join() && numbered.at(-1)?.startsWith('0034'), `${onMain.length} on main, ${numbered.length} here`);
  for (const f of numbered) {
    const m = gitShow(`origin/main:supabase/migrations/${f}`);
    if (m !== null && m !== readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')) check(`${f} is main's, word for word`, false);
  }
}
async function base(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of numbered) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  return pg;
}
const pg = await base();
// Made-up accounts only. Wallets 1 (linked to FID 880001), 2 (linked, then unlinked), 3, 4, 5 (linked to FID 880002).
await pg.exec(`
  insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.elements (id, work_id, element_type, created_by_fid) values ('71111111-1111-4111-8111-111111111111','snowmoon','text',880001);
  insert into studio.element_versions (element_id, version_no, body) values ('71111111-1111-4111-8111-111111111111', 1, '{}'), ('71111111-1111-4111-8111-111111111111', 2, '{}');
  insert into studio.wallet_accounts (address) values
    ('0x8800000000000000000000000000000000000001'), ('0x8800000000000000000000000000000000000002'), ('0x8800000000000000000000000000000000000003'),
    ('0x8800000000000000000000000000000000000004'), ('0x8800000000000000000000000000000000000005');
  insert into studio.wallet_links (account_id, fid, how, linked_at) select id, 880001, 'signed', now() - interval '40 days' from studio.wallet_accounts where address = '0x8800000000000000000000000000000000000001';
  insert into studio.wallet_links (account_id, fid, how, linked_at) select id, 880001, 'verified', now() - interval '20 days' from studio.wallet_accounts where address = '0x8800000000000000000000000000000000000002';
  update studio.wallet_links set unlinked_at = now() - interval '10 days', ended_by = 'person' where account_id = (select id from studio.wallet_accounts where address = '0x8800000000000000000000000000000000000002');
  insert into studio.wallet_links (account_id, fid, how) select id, 880002, 'signed' from studio.wallet_accounts where address = '0x8800000000000000000000000000000000000005';
  insert into studio.image_asks (fid) values (880001), (880001);`);
const walletId = async (n: number) => (await pg.query<{ id: number }>(`select id::int from studio.wallet_accounts where address = '0x880000000000000000000000000000000000000${n}'`)).rows[0].id;

// The pack, from its doc on origin/sql-pack, in apply order.
const APPLY = ['2', '5', '3', '4'];
const packDoc = gitShow('origin/sql-pack:docs/legal/sql-pack-2026-11-04.md');
const pack = new Map<string, string>();
if (packDoc === null) check('the SQL pack is readable from origin/sql-pack', false, 'git show failed; run git fetch');
else for (const m of packDoc.matchAll(/^### (\d[A-D])\. [^\n]*\n[\s\S]*?```sql\n([\s\S]*?)\n```/gm)) pack.set(m[1], m[2]);
check('the pack has its pending items\' blocks (2, 5, 3, 4)', APPLY.every((k) => ['A', 'B', 'C', 'D'].every((x) => pack.has(k + x))), [...pack.keys()].join());
for (const k of APPLY) {
  let err: string | null = null;
  await pg.exec(pack.get(`${k}B`) ?? 'select 1').catch((e: Error) => (err = e.message));
  check(`pack ${k}B applies before this migration`, err === null, err ?? '');
}
// Lens account 1 linked to FID 880001; Bluesky account 2 linked to that Lens account; Lens account 3 alone, linked to nothing.
await pg.exec(`
  insert into studio.social_accounts (kind, subject, handle) values
    ('lens', '0x88000000000000000000000000000000000000aa', 'lens/madeup'),
    ('bluesky', 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'madeup.bsky.social'),
    ('lens', '0x88000000000000000000000000000000000000bb', null);
  insert into studio.social_links (account_id, fid) select id, 880001 from studio.social_accounts where subject = '0x88000000000000000000000000000000000000aa';
  insert into studio.social_links (account_id, lens_account_id) select b.id, l.id from studio.social_accounts b, studio.social_accounts l where b.subject = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa' and l.subject = '0x88000000000000000000000000000000000000aa';`);

async function snapshot(db = pg): Promise<string> {
  const q = async (s: string) => JSON.stringify((await db.query(s)).rows);
  const parts = [
    await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'studio' order by 1, 2`),
    await q(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as d from pg_constraint where connamespace = 'studio'::regnamespace order by 1, 2`),
    await q(`select indexname, indexdef from pg_indexes where schemaname = 'studio' order by 1`),
    await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'studio' order by 1, 2`),
    await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'studio' order by 1, 2, 3`),
    await q(`select table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'studio' order by 1, 2, 3, 4`),
    await q(`select relname, relrowsecurity from pg_class where relnamespace = 'studio'::regnamespace and relkind = 'r' order by 1`),
    await q(`select tgrelid::regclass::text as t, tgname, tgenabled from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'studio.%' order by 1, 2`),
    await q(`select proname, prosecdef, proacl::text from pg_proc where pronamespace = 'studio'::regnamespace order by 1`),
  ];
  const tables = (await db.query<{ t: string }>(`select tablename as t from pg_tables where schemaname = 'studio' order by 1`)).rows.map((r) => r.t);
  for (const t of tables) parts.push(`${t}:${await q(`select * from studio.${t} order by 1`)}`);
  return parts.join('\n');
}
const diff = (a: string, b: string) => {
  const x = a.split('\n');
  const y = b.split('\n');
  const i = x.findIndex((l, n) => l !== y[n]);
  return i < 0 ? '' : `first difference: ${(x[i] ?? '').slice(0, 200)} → ${(y[i] ?? '').slice(0, 200)}`;
};
type Row = { what: string; ok: boolean | null };
async function readA(sqlText = C, readOnly = true): Promise<{ rows: Row[]; error?: string }> {
  try {
    if (readOnly) await pg.exec('begin read only;');
    return { rows: (await pg.query<Row>(sqlText)).rows };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  } finally {
    if (readOnly) await pg.exec('rollback;');
  }
}
async function readB(sqlText = D): Promise<string | null> {
  try {
    await pg.exec(sqlText);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
const allTrue = (r: { rows: Row[]; error?: string }) => !r.error && r.rows.length > 0 && r.rows.every((x) => x.ok === true);
const falseRows = (r: { rows: Row[]; error?: string }) => (r.error ? [`error: ${r.error}`] : r.rows.filter((x) => x.ok !== true).map((x) => x.what));

// --- A, B, the backfill, (a), (b), twice ----------------------------------------------------------------------------
const s0 = await snapshot();
let err: string | null = null;
await pg.exec(A).catch((e: Error) => (err = e.message));
await pg.exec('rollback;').catch(() => {});
check('A (dry run) runs without an error', err === null, err ?? '');
check('A (dry run) leaves nothing', (await snapshot()) === s0, diff(s0, await snapshot()));
err = null;
await pg.exec(B).catch((e: Error) => (err = e.message));
if (err) await pg.exec('rollback;').catch(() => {});
check('B (migration) applies after 0001..0034 and the pack', err === null, err ?? '');
{
  const w = [await walletId(1), await walletId(2), await walletId(3), await walletId(4), await walletId(5)];
  const personOf = async (account: number) => (await pg.query<{ p: number | null }>(`select person_id::int as p from studio.person_accounts where account = ${account} and unlinked_at is null`)).rows[0]?.p ?? null;
  const [lens1, sky2, lens3] = (await pg.query<{ id: number }>(`select id::int from studio.social_accounts order by id`)).rows.map((r) => -(1e9 + r.id));
  const f1 = await personOf(880001);
  check('backfill: FID 880001 has a person', f1 !== null);
  check('backfill: the linked wallet joins its FID\'s person', (await personOf(-w[0])) === f1);
  check('backfill: the Lens account linked to the FID joins its person', (await personOf(lens1)) === f1);
  check('backfill: the Bluesky account linked to that Lens account joins the same person', (await personOf(sky2)) === f1);
  const u = (await pg.query<{ n: number; own: number | null }>(`select count(*)::int as n, max(person_id) filter (where unlinked_at is null)::int as own from studio.person_accounts where account = ${-w[1]}`)).rows[0];
  check('backfill: the unlinked wallet has its ended row under the FID\'s person and a person of its own', u.n === 2 && u.own !== null && u.own !== f1, JSON.stringify(u));
  const since = (await pg.query<{ ok: boolean }>(`select (a.linked_at = l.unlinked_at) as ok from studio.person_accounts a, studio.wallet_links l where a.account = ${-w[1]} and a.unlinked_at is null and l.account_id = ${w[1]}`)).rows[0];
  check('backfill: its own person starts when the link ended (the 30-day wait can read it)', since?.ok === true);
  check('backfill: the wallet linked to FID 880002 joins its person', (await personOf(-w[4])) === (await personOf(880002)) && (await personOf(880002)) !== null);
  check('backfill: accounts never linked get no person (made when the app first needs one)', (await personOf(-w[2])) === null && (await personOf(lens3)) === null);
  const n = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.image_asks where person_id is not null`)).rows[0].n;
  check('backfill: existing counts are left as they were (no person_id written)', n === 0);
}
const a = await readA();
check(`(a) is all true (${a.rows.length} rows), read only`, allTrue(a), falseRows(a).join('; '));
const s1 = await snapshot();
const b = await readB();
check('(b) passes', b === null, b ?? '');
check('(b) leaves every row as it was', (await snapshot()) === s1, diff(s1, await snapshot()));
err = null;
await pg.exec(B).catch((e: Error) => (err = e.message));
await pg.exec('rollback;').catch(() => {});
check('B run twice: stops with an error and changes nothing (the header says so)', err !== null && (await snapshot()) === s1, err ?? 'no error');
check('(a) and (b) still pass after the second run', allTrue(await readA()) && (await readB()) === null);

// --- As studio_writer -----------------------------------------------------------------------------------------------
async function asWriter<T>(f: () => Promise<T>): Promise<T | string> {
  await pg.exec('begin; set local role studio_writer;');
  try {
    return await f();
  } catch (e) {
    return `error: ${(e as Error).message}`;
  } finally {
    await pg.exec('rollback;');
  }
}
{
  const w3 = await walletId(3);
  const r = await asWriter(async () => {
    const [{ id: p }] = (await pg.query<{ id: number }>(`insert into studio.people default values returning id::int`)).rows;
    await pg.query(`insert into studio.person_accounts (person_id, kind, account, how) values (${p}, 'farcaster', 880077, 'first'), (${p}, 'wallet', ${-w3}, 'signed')`);
    await pg.query(`insert into studio.image_asks (fid, person_id) values (880077, ${p})`);
    await pg.query(`insert into studio.remix_asks (person, person_id) values (880077, ${p})`);
    await pg.query(`insert into studio.person_link_attempts (person_id) values (${p})`);
    const ended = await pg.query(`update studio.person_accounts set unlinked_at = now(), ended_by = 'person' where account = ${-w3} and unlinked_at is null returning 1`);
    return `${ended.rows.length}`;
  });
  check('studio_writer: a person, two accounts, counted rows and an attempt go in; a link is ended', r === '1', String(r));
}
const refusedAsWriter = async (label: string, sqlText: string) => {
  const r = await asWriter(async () => (await pg.query(sqlText)).affectedRows ?? 0);
  check(`studio_writer: ${label} is refused or changes nothing`, (typeof r === 'string' && /error/.test(r)) || r === 0, String(r));
};
await refusedAsWriter('moving an active row to another person', `update studio.person_accounts set person_id = person_id + 1`);
await refusedAsWriter('changing an ended row', `update studio.person_accounts set ended_by = 'unverified' where unlinked_at is not null`);
await refusedAsWriter('deleting a row', `delete from studio.person_accounts`);
await refusedAsWriter('deleting a person', `delete from studio.people`);
await refusedAsWriter('inserting a row already ended', `insert into studio.person_accounts (person_id, kind, account, how, unlinked_at, ended_by) select id, 'farcaster', 880078, 'first', now(), 'person' from studio.people limit 1`);
{
  const r = await asWriter(async () => {
    await pg.exec('reset role; set local role anon;');
    return (await pg.query(`select * from studio.person_accounts`)).rows.length;
  });
  check('anon: reading person_accounts is refused', typeof r === 'string' && /error/.test(r), String(r));
}

// --- Planted faults -------------------------------------------------------------------------------------------------
async function plant(label: string, sqlText: string) {
  const before = await snapshot();
  await pg.exec('begin;');
  let fa: string[] = [];
  let fb: string | null = null;
  try {
    await pg.exec(sqlText);
    fa = falseRows(await readA(C, false));
    await pg.exec('savepoint before_b;');
    fb = await readB();
    await pg.exec('rollback to savepoint before_b;');
  } catch (e) {
    fa = [`the plant itself failed: ${(e as Error).message}`];
  }
  await pg.exec('rollback;');
  const byA = fa.length > 0 && !fa[0].startsWith('the plant itself failed');
  const byB = fb !== null && /READ-BACK FAILED/.test(fb);
  check(`planted: ${label} — caught`, byA || byB, fa.join('; ') || fb || 'neither read-back noticed');
  log.push(`       caught by ${[byA ? `(a) ${fa.join('; ')}` : '', byB ? `(b) ${fb!.replace(/^.*?(READ-BACK FAILED)/s, '$1')}` : ''].filter(Boolean).join(' | ') || 'nothing'}`);
  check(`planted: ${label} — rolled back, nothing left`, (await snapshot()) === before);
}
const PLANTS: [string, string][] = [
  ['A1 gone: the one-active-row index dropped', `drop index studio.person_accounts_one_active;`],
  ['A1 weakened: the index no longer partial (an unlinked account could never come back)', `drop index studio.person_accounts_one_active; create unique index person_accounts_one_active on studio.person_accounts (account, linked_at) where unlinked_at is null;`],
  ['A6 gone: one-of-each-kind index dropped', `drop index studio.person_accounts_one_of_kind;`],
  ['A6 gone: the 3-wallet trigger dropped', `drop trigger person_accounts_wallets on studio.person_accounts;`],
  ['A6 weakened: the trigger allows 4 wallets', `create or replace function studio.person_accounts_wallet_limit() returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $fn$ begin if new.kind = 'wallet' and (select count(*) from studio.person_accounts where person_id = new.person_id and kind = 'wallet' and unlinked_at is null) >= 4 then raise exception 'x' using errcode = '23514'; end if; return new; end $fn$;`],
  ['the kind check gone (a wallet number as a Farcaster account)', `alter table studio.person_accounts drop constraint person_accounts_kind_range;`],
  ['missing grant: studio_writer loses insert on person_accounts', `revoke insert on studio.person_accounts from studio_writer;`],
  ['missing grant: studio_writer loses select on people', `revoke select on studio.people from studio_writer;`],
  ['studio_writer may delete links', `grant delete on studio.person_accounts to studio_writer;`],
  ['studio_writer may move a row (update of person_id)', `grant update (person_id) on studio.person_accounts to studio_writer;`],
  ['missing policy: writer_unlink dropped', `drop policy writer_unlink on studio.person_accounts;`],
  ['public access: anon may read person_accounts', `grant select on studio.person_accounts to anon;`],
  ['row-level security off on people', `alter table studio.people disable row level security;`],
  ['the via pair check dropped (a kind of account without the account)', `alter table studio.challenge_eligibility drop constraint challenge_eligibility_via_pair;`],
  ['the backfill lost the active wallet link', `update studio.person_accounts set unlinked_at = now(), ended_by = 'person' where account = (select -account_id from studio.wallet_links where unlinked_at is null order by id limit 1) and unlinked_at is null;`],
  ['a person left without any active account', `insert into studio.people default values;`],
  ['wrong column type: image_asks.person_id as text', `alter table studio.image_asks drop column person_id; alter table studio.image_asks add column person_id text;`],
  ['person_id missing on remix_asks', `alter table studio.remix_asks drop column person_id;`],
  ['the kind check lets a wallet number in as a Bluesky account', `alter table studio.person_accounts drop constraint person_accounts_kind_range; alter table studio.person_accounts add constraint person_accounts_kind_range check ((kind = 'farcaster' and account > 0) or (kind in ('wallet', 'lens', 'bluesky') and account < 0));`],
];
for (const [label, sqlText] of PLANTS) await plant(label, sqlText);

// --- The pack's read-backs with this applied ------------------------------------------------------------------------
for (const k of ['1', ...APPLY]) {
  if (!pack.has(`${k}C`)) continue;
  const ra = await readA(pack.get(`${k}C`)!, true);
  check(`pack ${k}C still all true with this applied`, allTrue(ra), falseRows(ra).join('; '));
  const r = await readB(pack.get(`${k}D`) ?? 'select');
  check(`pack ${k}D still passes with this applied`, r === null, r ?? '');
}
await pg.close();

// --- The whole file in the folder's name order (as test runners apply it), before the pack ----------------------------
{
  const whole = new PGlite();
  await whole.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  let e2: string | null = null;
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await whole.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')).catch(async (e: Error) => {
      e2 ??= `${f}: ${e.message}`;
      await whole.exec('rollback;').catch(() => {});
    });
  }
  check('every migration file in name order runs (this one before the Lens/Bluesky tables exist)', e2 === null, e2 ?? '');
  const n = (await whole.query<{ n: number }>(`select count(*)::int as n from studio.person_accounts where account in (990001, 990002, -1000990001) or account in (select -id from studio.wallet_accounts where address like '0x990000%')`)).rows[0]?.n;
  check('and keeps none of the read-back\'s made-up rows', n === 0);
  const linked = (await whole.query<{ n: number }>(`select count(*)::int as n from studio.person_accounts a join studio.person_accounts f on f.person_id = a.person_id and f.kind = 'farcaster' where a.kind = 'wallet' and a.unlinked_at is null and f.account in (6852, 193912)`)).rows[0]?.n;
  check('0026\'s two wallet links are backfilled under their FIDs\' people', linked === 2, String(linked));
  await whole.close();
}

for (const l of log) console.log(l);
console.log(`\ntest:linked-accounts-sql: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const x of failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
