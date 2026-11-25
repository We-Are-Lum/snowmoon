/**
 * NEXT_paid_generations.sql on an in-memory Postgres (PGlite) with main's migrations 0001-0051 applied first. No network,
 * no production database. Checks: A (the dry run) is B word for word and changes nothing; B applies, and applies again;
 * C (the read-back) passes and keeps nothing; existing charges are untouched; D (the undo) is refused once a paid charge
 * exists, and puts back main's shape when there is none. Drafted by the coding agent (Claude, a closed model by Anthropic).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = 'supabase/migrations/NEXT_paid_generations.sql';
let failed = 0;
const check = (label: string, ok: boolean, why = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !why ? '' : ` (${why})`}`);
  if (!ok) failed++;
};
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const text = read(FILE);
const at = (h: string) => text.indexOf(`\n-- ${h}`);
const between = (a: string, b: string | null) => text.slice(text.indexOf('\n', at(a) + 1) + 1, b ? at(b) : text.length);
const strip = (s: string) => s.replace(/^--[^\n]*$/gm, '').trim();
const uncomment = (s: string) => {
  const lines = s.split('\n');
  const i = lines.findIndex((l) => l === '-- begin;');
  const j = lines.map((l, k) => (/^-- (rollback|commit);$/.test(l) ? k : -1)).filter((k) => k > i).pop() ?? -1;
  return i < 0 || j < 0 ? '' : lines.slice(i, j + 1).map((l) => l.replace(/^-- ?/, '')).join('\n');
};
const dry = strip(between('A. DRY RUN', 'B. MIGRATION'));
const mig = strip(between('B. MIGRATION', 'C. READ-BACK'));
const readBack = uncomment(between('C. READ-BACK', 'D. UNDO'));
const undo = uncomment(between('D. UNDO', null));
check('the file says who runs it; A ends in rollback, B in commit; C ends READ-BACK PASSED and rolls back', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text) && dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && /READ-BACK PASSED/.test(readBack) && readBack.trim().endsWith('rollback;'));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back inserts and deletes realistic rows, and sets no role', /insert into studio\.wallet_debits/.test(readBack) && /delete from studio\.wallet_debits/.test(readBack) && !/set role/i.test(readBack));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
// An existing account with an image charge, as production has.
await pg.exec(`insert into studio.wallet_accounts (address) values ('0x${'1'.repeat(40)}');
  insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number) values ('0x${'2'.repeat(64)}', 1, 8453, 'USDC', 500000, 0.5, 1);
  insert into studio.wallet_debits (account_id, usd) values (1, 0.028);`);
const shape = async () => JSON.stringify((await pg.query(`select table_name, column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name in ('wallet_debits', 'wallet_refunds') order by 1, 2`)).rows)
  + JSON.stringify((await pg.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'voice_costs_funded_check'`)).rows);
const before = await shape();
await pg.exec(dry);
check('the dry run leaves everything as it was', (await shape()) === before);
await pg.exec(mig);
let twice = true;
try {
  await pg.exec(mig);
} catch (e) {
  twice = false;
  console.log(String(e));
}
check('the migration applies, and applies again', twice);
const old = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.wallet_debits where id = 1 and usd = 0.028 and item is null and person is null`)).rows[0].n;
check('the existing image charge is untouched', old === 1);
const counts = async () => JSON.stringify((await pg.query(`select (select count(*) from studio.wallet_accounts)::int a, (select count(*) from studio.wallet_payments)::int p, (select count(*) from studio.wallet_debits)::int d, (select count(*) from studio.wallet_credits)::int c, (select count(*) from studio.wallet_refunds)::int r, (select count(*) from studio.voice_costs)::int v`)).rows[0]);
const c0 = await counts();
let rbOk = true, rbWhy = '';
try {
  await pg.exec(readBack);
} catch (e) {
  rbOk = false;
  rbWhy = String((e as Error).message);
  await pg.exec('rollback;').catch(() => {});
}
const c1 = await counts();
check('the read-back passes and keeps nothing', rbOk && c1 === c0, rbWhy || `${c0} -> ${c1}`);

// Proofs: the read-back must fail on a planted fault.
for (const [label, fault, heal] of [
  ['studio_writer may insert refunds', 'grant insert on studio.wallet_refunds to studio_writer;', 'revoke insert on studio.wallet_refunds from studio_writer;'],
  ['anon may record a refund', 'grant execute on function studio.record_wallet_refund(bigint, text, text, bigint) to anon;', 'revoke execute on function studio.record_wallet_refund(bigint, text, text, bigint) from anon;'],
  ['the item check is gone', 'alter table studio.wallet_debits drop constraint wallet_debits_item_check;', `alter table studio.wallet_debits add constraint wallet_debits_item_check check (item is null or item in ('ephelion-entry', 'ephelion-picture'));`],
] as const) {
  await pg.exec(fault);
  let caught = false;
  try {
    await pg.exec(readBack);
  } catch {
    caught = true;
    await pg.exec('rollback;').catch(() => {});
  }
  await pg.exec(heal);
  check(`proof: the read-back catches it when ${label}`, caught);
}

// The undo: refused once a paid charge exists; otherwise main's shape again.
await pg.exec(`insert into studio.wallet_debits (account_id, usd, person, item, ref) values (1, 0.2, 6786, 'ephelion-picture', 'doing-fine');`);
let refused = false;
try {
  await pg.exec(undo);
} catch {
  refused = true;
  await pg.exec('rollback;').catch(() => {});
}
check('the undo is refused once a paid charge is on record', refused);
await pg.exec(`delete from studio.wallet_debits where item is not null;`);
await pg.exec(undo);
check('the undo puts back main\'s shape', (await shape()) === before);
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
