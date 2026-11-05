/**
 * NEXT_person_balance (docs/proposals/person-balance.md), tested on an in-memory Postgres (PGlite). Never a production
 * database. Drafted by a coding agent (Claude, a closed model by Anthropic).
 *
 *   npm run test:person-balance
 *
 * On a fresh database: main's numbered migrations (0001..0033, as origin/main has them), a wallet account with a
 * payment already credited (the backfill must take it), then the SQL pack of 2026-11-04 (its five B blocks, read from
 * docs/legal/sql-pack-2026-11-04.md on origin/sql-pack, in apply order), then this migration:
 * - its blocks have the shape CLAUDE.md asks for: A is B ending in rollback; (a) is one select; (b) is one do block,
 *   raising "READ-BACK FAILED" and ending with "READ-BACK PASSED";
 * - A leaves nothing; B applies; (a), in a read-only transaction, is all true; (b) passes and leaves every row as it
 *   was; a second B stops with an error and changes nothing;
 * - as studio_writer: realistic rows go in for a Farcaster person, a Bluesky person and a wallet account; the same
 *   transaction is never credited twice; nothing can be changed, deleted or written to the ledger directly;
 * - planted faults, each in a transaction that is rolled back: (a) shows a false row or (b) raises READ-BACK FAILED;
 * - the pack's read-backs (all ten) still pass with this applied; the whole file runs as one script, as
 *   check:principles and test:wallet run every migration.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'supabase/migrations/NEXT_person_balance.sql');
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

// ---------------------------------------------------------------------------------------------------------------------
// The blocks of this migration.
// ---------------------------------------------------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------------------------------------------------
// The database: main's migrations, a wallet payment already credited, the SQL pack.
// ---------------------------------------------------------------------------------------------------------------------
const numbered = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const mainList = gitShow('origin/main:supabase/migrations');
if (mainList === null) log.push('skip: the numbered migrations against origin/main (git show unavailable)');
else {
  const onMain = mainList.split('\n').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  check('this branch has exactly origin/main\'s numbered migrations', onMain.join() === numbered.join(), `${onMain.length} on main, ${numbered.length} here`);
  for (const f of numbered) {
    const m = gitShow(`origin/main:supabase/migrations/${f}`);
    if (m !== null && m !== readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')) check(`${f} is main's, word for word`, false);
  }
}

async function fresh(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of numbered) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  return pg;
}
const pg = await fresh();
const OLD_TX = '0x' + 'ab'.repeat(32);
await pg.exec(`
  insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.elements (id, work_id, element_type, created_by_fid) values ('71111111-1111-4111-8111-111111111111','snowmoon','text',6786);
  insert into studio.element_versions (element_id, version_no, body) values ('71111111-1111-4111-8111-111111111111', 1, '{}'), ('71111111-1111-4111-8111-111111111111', 2, '{}'), ('71111111-1111-4111-8111-111111111111', 3, '{}');
  insert into studio.wallet_accounts (address) values ('0x4fea94b8947926ddd3c02f4e133357b547f74ff0');
  insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number)
    select '${OLD_TX}', id, 8453, 'USDC', 5000000, 5, 37000000 from studio.wallet_accounts where address = '0x4fea94b8947926ddd3c02f4e133357b547f74ff0';`);

// The pack's items still pending after main's 0034-0036 (items 1, 2 and 5 are applied and on main), from its doc on origin/sql-pack.
const PACK = ['3', '4', '6'];
const packDoc = gitShow('origin/sql-pack:docs/legal/sql-pack-2026-11-04.md');
const pack = new Map<string, string>();
if (packDoc === null) check('the SQL pack is readable from origin/sql-pack', false, 'git show failed; run git fetch');
else for (const m of packDoc.matchAll(/^### (\d[A-D])\. [^\n]*\n[\s\S]*?```sql\n([\s\S]*?)\n```/gm)) pack.set(m[1], m[2]);
check('the pack has its pending items\' blocks (3, 4, 6)', PACK.every((k) => ['A', 'B', 'C', 'D'].every((x) => pack.has(k + x))), [...pack.keys()].join());
for (const k of PACK) {
  let err: string | null = null;
  await pg.exec(pack.get(`${k}B`) ?? 'select 1').catch((e: Error) => (err = e.message));
  check(`pack ${k}B applies before this migration`, err === null, err ?? '');
}

/** Everything a migration could change: tables, columns, constraints, indexes, policies, grants, triggers, functions, rows. */
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

// ---------------------------------------------------------------------------------------------------------------------
// A, B, (a), (b), twice.
// ---------------------------------------------------------------------------------------------------------------------
const s0 = await snapshot();
let err: string | null = null;
await pg.exec(A).catch((e: Error) => (err = e.message));
check('A (dry run) runs without an error', err === null, err ?? '');
check('A (dry run) leaves nothing', (await snapshot()) === s0, diff(s0, await snapshot()));
err = null;
await pg.exec(B).catch((e: Error) => (err = e.message));
check('B (migration) applies after main and the pack', err === null, err ?? '');
const back = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.paid_transactions where tx_hash = '${OLD_TX}' and credited_to = 'wallet'`)).rows[0].n;
check('B put the wallet payment already credited into the ledger', back === 1);
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

// ---------------------------------------------------------------------------------------------------------------------
// As studio_writer, the app's role: what the code will do, and what it must not be able to do.
// ---------------------------------------------------------------------------------------------------------------------
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
const refusedAsWriter = async (label: string, sqlText: string) => {
  const r = await asWriter(async () => (await pg.query(sqlText)).affectedRows ?? 0);
  check(`studio_writer: ${label} is refused`, typeof r === 'string' && /error/.test(r), String(r));
};
{
  const r = await asWriter(async () => {
    const [{ id: fidIntent }] = (await pg.query<{ id: string }>(`insert into studio.person_pay_intents (person, address) values (6786, '0x51e24a4b3a171739c4a105147fc2b10a298d73c5') returning id`)).rows;
    const [{ id: skyIntent }] = (await pg.query<{ id: string }>(`insert into studio.person_pay_intents (person, address) values (-1000000042, '0x5a692bd9deb26f7f728bb69caa46f8db75b5a479') returning id`)).rows;
    const one = await pg.query(`insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number) values ('0x${'01'.repeat(32)}', '${fidIntent}', 6786, 8453, 'USDC', 5000000, 5, 1) on conflict (tx_hash) do nothing returning 1`);
    const two = await pg.query(`insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number) values ('0x${'02'.repeat(32)}', '${skyIntent}', -1000000042, 8453, 'ETH', 2000000000000000, 5, 1) on conflict (tx_hash) do nothing returning 1`);
    // The wallet's own claim of the Farcaster person's transaction, as src/lib/wallet/credits.ts writes it.
    const again = await pg.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) select '0x${'01'.repeat(32)}', id, 8453, 'USDC', 5000000, 5, 1 from studio.wallet_accounts limit 1 on conflict (tx_hash) do nothing returning 1`);
    // A person's claim of the wallet's old transaction.
    const [{ id: spare }] = (await pg.query<{ id: string }>(`insert into studio.person_pay_intents (person, address) values (6786, '0x4fea94b8947926ddd3c02f4e133357b547f74ff0') returning id`)).rows;
    const stolen = await pg.query(`insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number) values ('${OLD_TX}', '${spare}', 6786, 8453, 'USDC', 5000000, 5, 1) on conflict (tx_hash) do nothing returning 1`);
    const newWallet = await pg.query(`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) select '0x${'03'.repeat(32)}', id, 8453, 'USDC', 1000000, 1, 1 from studio.wallet_accounts limit 1 on conflict (tx_hash) do nothing returning 1`);
    const [{ id: debit }] = (await pg.query<{ id: number }>(`insert into studio.person_debits (person, usd) values (-1000000042, 0.016) returning id`)).rows;
    const credit = await pg.query(`insert into studio.person_credits (debit_id, person, usd, reason) select id, person, usd, 'failed' from studio.person_debits where id = ${debit} on conflict (debit_id) do nothing returning 1`);
    const ledger = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.paid_transactions`)).rows[0].n;
    return [one.rows.length, two.rows.length, again.rows.length, stolen.rows.length, newWallet.rows.length, credit.rows.length, ledger].join();
  });
  check('studio_writer: a Farcaster and a Bluesky person credited, each transaction once either way, a new wallet payment and a credit-back go in', r === '1,1,0,0,1,1,4', String(r));
}
await refusedAsWriter('a wallet account\'s number as a person', `insert into studio.person_pay_intents (person, address) values (-5, '0x51e24a4b3a171739c4a105147fc2b10a298d73c5')`);
await refusedAsWriter('zero as a person', `insert into studio.person_debits (person, usd) values (0, 0.016)`);
await refusedAsWriter('writing the ledger directly', `insert into studio.paid_transactions (tx_hash, credited_to) values ('0x${'09'.repeat(32)}', 'person')`);
await refusedAsWriter('deleting from the ledger', `delete from studio.paid_transactions`);
await refusedAsWriter('changing a payment', `update studio.person_payments set usd = 100`);
await refusedAsWriter('deleting a debit', `delete from studio.person_debits`);
await refusedAsWriter('calling the ledger function', `select studio.claim_paid_transaction()`);
{
  const r = await asWriter(async () => {
    await pg.exec('reset role;');
    await pg.exec('set local role anon;');
    return (await pg.query(`select * from studio.person_payments`)).rows.length;
  });
  check('anon: reading payments is refused', typeof r === 'string' && /error/.test(r), String(r));
}

// ---------------------------------------------------------------------------------------------------------------------
// Planted faults: each must be caught by (a) or (b), and leave nothing.
// ---------------------------------------------------------------------------------------------------------------------
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
  ['a person check that refuses a Bluesky person (FIDs only)', `alter table studio.person_pay_intents drop constraint person_pay_intents_person_check; alter table studio.person_pay_intents add constraint person_pay_intents_person_check check (person > 0);`],
  ['a person check that refuses a Farcaster person', `alter table studio.person_payments drop constraint person_payments_person_check; alter table studio.person_payments add constraint person_payments_person_check check (person <= -1000000000);`],
  ['a person check that takes a wallet account\'s number', `alter table studio.person_pay_intents drop constraint person_pay_intents_person_check; alter table studio.person_pay_intents add constraint person_pay_intents_person_check check (person <> 0);`],
  ['missing grant: studio_writer loses insert on person_payments', `revoke insert on studio.person_payments from studio_writer;`],
  ['missing grant: studio_writer loses select on person_debits', `revoke select on studio.person_debits from studio_writer;`],
  ['missing policy: writer_insert on person_credits dropped', `drop policy writer_insert on studio.person_credits;`],
  ['duplicate credit: the trigger on wallet_payments dropped', `drop trigger wallet_payments_once on studio.wallet_payments;`],
  ['duplicate credit: the trigger on person_payments dropped', `drop trigger person_payments_once on studio.person_payments;`],
  ['duplicate credit: the ledger function lets a known hash through', `create or replace function studio.claim_paid_transaction() returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$ begin insert into studio.paid_transactions (tx_hash, credited_to) values (new.tx_hash, tg_argv[0]) on conflict (tx_hash) do nothing; return new; end $fn$;`],
  ['the ledger function runs as the caller (studio_writer can\'t write the ledger)', `alter function studio.claim_paid_transaction() security invoker;`],
  ['the ledger function callable by studio_writer', `grant execute on function studio.claim_paid_transaction() to studio_writer;`],
  ['studio_writer may write the ledger', `grant insert on studio.paid_transactions to studio_writer;`],
  ['studio_writer may delete payments', `grant delete on studio.person_payments to studio_writer;`],
  ['public access: anon may read intents', `grant select on studio.person_pay_intents to anon;`],
  ['the backfill missed a wallet payment', `delete from studio.paid_transactions where tx_hash = '${OLD_TX}';`],
  ['a payment may go to someone other than its intent\'s person (FK on intent only)', `alter table studio.person_payments drop constraint person_payments_intent_id_person_fkey; alter table studio.person_payments add foreign key (intent_id) references studio.person_pay_intents (id);`],
  ['two payments on one intent', `alter table studio.person_payments drop constraint person_payments_intent_id_key;`],
  ['a credit-back for any amount (FK on the debit only)', `alter table studio.person_credits drop constraint person_credits_debit_id_person_usd_fkey; alter table studio.person_credits add foreign key (debit_id) references studio.person_debits (id);`],
  ['a debit credited back twice', `alter table studio.person_credits drop constraint person_credits_debit_id_key;`],
  ['wrong column type: person as integer', `alter table studio.person_debits alter column person type integer;`],
  ['row-level security off on person_payments', `alter table studio.person_payments disable row level security;`],
];
for (const [label, sqlText] of PLANTS) await plant(label, sqlText);

// ---------------------------------------------------------------------------------------------------------------------
// The pack's read-backs with this applied, and the whole file as one script.
// ---------------------------------------------------------------------------------------------------------------------
for (const k of PACK) {
  check(`pack ${k}C still all true with this applied`, allTrue(await readA(pack.get(`${k}C`) ?? 'select', true)), falseRows(await readA(pack.get(`${k}C`) ?? 'select', true)).join('; '));
  const r = await readB(pack.get(`${k}D`) ?? 'select');
  check(`pack ${k}D still passes with this applied`, r === null, r ?? '');
}
await pg.close();
{
  const whole = await fresh();
  let e2: string | null = null;
  await whole.exec(file).catch((e: Error) => (e2 = e.message));
  check('the whole file runs as one script on main\'s migrations (as test:wallet and check:principles run it)', e2 === null, e2 ?? '');
  const n = (await whole.query<{ n: number }>(`select count(*)::int as n from studio.person_pay_intents`)).rows[0]?.n;
  check('and keeps no test rows', n === 0);
  await whole.close();
}

for (const l of log) console.log(l);
console.log(`\ntest:person-balance: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const x of failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
