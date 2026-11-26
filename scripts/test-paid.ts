/**
 * Paid generations on the prepaid balance (owner, 2026-11-25; PR A, EPHELION_PAID off on the site). No network, no
 * production database: an in-memory Postgres (PGlite) with main's migrations and NEXT_paid_generations.sql applied,
 * reached as studio_writer, as the site does. Base and Neynar are stood in. Drafted by the coding agent (Claude, a
 * closed model by Anthropic).
 * - The account lock: lockAccount takes exactly the lock studio.record_wallet_refund takes (read from pg_locks in the
 *   same transaction); every charge path in src/ takes it before its balance check and charge (a source check; a
 *   planted path without it is caught).
 * - Refunds in the balance: balanceUsd and the admin page's "held" rows subtract refunds; a refunded charge leaves the
 *   balance and the held totals right, and a refund can't spend money a charge already spent (either order).
 * - Charges: what each bought (person, item, ref); the switch; no wallet; a short balance and what's missing; the
 *   per-person caps (5 entries, 10 pictures, net of charges added back); the site-wide cap; a Farcaster person
 *   spending a linked wallet's balance; Lens/Bluesky need a wallet first; a free retry after an add-back.
 * - Paying from a wallet verified on the Farcaster account; recording a refund (admins only); paid voice calls.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { EPHELION_PAID, IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught);
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));

// --- The account lock: every charge path takes it (source check, with a planted fault) -------------------------------
/** Each place in a file that charges a balance (debit( or an insert into wallet_debits) without lockAccount before it, since the start of its transaction. */
function unlocked(file: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/await debit\(|insert into studio\.wallet_debits/g)) {
    const at = m.index ?? 0;
    const begin = text.lastIndexOf('.begin(', at);
    const span = text.slice(begin < 0 ? 0 : begin, at);
    if (!/lockAccounts?\(/.test(span)) out.push(`${file}: a charge at ${at} without the account lock`);
  }
  return out;
}
const SRC = walk('src').filter((f) => !/\/wallet\/credits\.ts$/.test(f)).map((f) => ({ file: f, text: read(f) }));
const charging = SRC.filter((f) => /await debit\(|insert into studio\.wallet_debits/.test(f.text)).map((f) => f.file).sort();
check('the charge paths found are images, remix and paid generations', JSON.stringify(charging) === JSON.stringify(['src/lib/images/limits.ts', 'src/lib/remix/limits.ts', 'src/lib/wallet/paid.ts']), JSON.stringify(charging));
const problems = SRC.flatMap((f) => unlocked(f.file, f.text));
check('every charge path takes the account lock before it charges', problems.length === 0, problems.join('; '));
{
  const img = SRC.find((f) => f.file === 'src/lib/images/limits.ts')!;
  proof('an images charge without the lock is caught', unlocked(img.file, img.text.replace(/await lockAccount\(t, -fid\);/, '')).length === 1);
  const paid = SRC.find((f) => f.file === 'src/lib/wallet/paid.ts')!;
  proof('a paid charge without the lock is caught', unlocked(paid.file, paid.text.replace(/await lockAccounts\(t, accounts\);/, '')).length === 1);
}

// --- The database ----------------------------------------------------------------------------------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(read('supabase/migrations/NEXT_paid_generations.sql'));
const PORT = 54341;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1 });
await sql`set role studio_writer`;
type Sql = postgres.Sql;
const S = sql as unknown as Sql;
const { accountFor, balanceUsd, credit, creditBack } = await import('../src/lib/wallet/credits');
const { lockAccount } = await import('../src/lib/wallet/lock');
const paidLib = await import('../src/lib/wallet/paid');
const { charge, quote, recordRefund, claimVerified, addBack } = paidLib;
const E = EPHELION_PAID as unknown as { enabled: boolean; dailyCapUsd: number };
const hex = (s: string, n: number) => '0x' + Array.from({ length: n }, (_, i) => s[i % s.length]).join('');
let txn = 0;
const newTx = () => hex((++txn).toString(16).padStart(4, '0') + 'a', 64);
const fund = async (account: number, usd: number) => credit(S, account, { txHash: newTx(), token: 'USDC', amount: BigInt(Math.round(usd * 1e6)), usd, blockNumber: 100n });

// The same lock as the refund function: read from pg_locks inside the same transaction.
const held = async (tx: Sql) => JSON.stringify((await tx`select classid::text, objid::text from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() order by 1, 2`).map((r) => [r.classid, r.objid]));
const lockAcct = await accountFor(S, hex('1a', 40));
await fund(lockAcct, 1);
const [ld] = await sql`insert into studio.wallet_debits (account_id, usd, person, item, ref) values (${lockAcct}, 1, ${-lockAcct}, 'ephelion-entry', 'doing-fine') returning id::int as id`;
const ours = await S.begin(async (tx) => {
  await lockAccount(tx as unknown as Sql, lockAcct);
  return held(tx as unknown as Sql);
});
const theirs = await S.begin(async (tx) => {
  await tx`select studio.record_wallet_refund(${ld.id}, ${hex('1a', 40)}, ${newTx()}, 6786)`.catch(() => null);
  return held(tx as unknown as Sql);
}).catch(() => 'refused');
// record_wallet_refund raises (the charge isn't added back) after taking the lock, so read its lock without the raise:
const theirs2 = await S.begin(async (tx) => {
  await tx`select pg_advisory_xact_lock(hashtext('snowmoon.wallet.account'), ${lockAcct}::int)`;
  return held(tx as unknown as Sql);
});
check('lockAccount takes exactly the lock the refund function names', ours !== '[]' && ours === theirs2, `${ours} vs ${theirs2} (${theirs})`);
const fnText = (await db.query<{ src: string }>(`select prosrc as src from pg_proc where proname = 'record_wallet_refund'`)).rows[0].src;
check("the refund function's own lock is hashtext('snowmoon.wallet.account') on the account", /pg_advisory_xact_lock\(hashtext\('snowmoon\.wallet\.account'\), d\.account_id::int\)/.test(fnText));

// --- Charges ---------------------------------------------------------------------------------------------------------
E.enabled = false;
const w1 = await accountFor(S, hex('2b', 40));
check('switch off: nothing is charged', (await charge(S, -w1, 'ephelion-entry', 'doing-fine')).ok === false && (await charge(S, -w1, 'ephelion-entry', 'doing-fine') as { refusal?: string }).refusal === 'off');
E.enabled = true;
const r0 = await charge(S, -w1, 'ephelion-entry', 'doing-fine');
check('an empty balance: refused, with what is missing', !r0.ok && r0.refusal === 'balance' && r0.shortUsd === 1, JSON.stringify(r0));
const q0 = await quote(S, -w1, 'ephelion-picture');
check('the quote: price, balance, missing, and at least the smallest payment', q0.priceUsd === 0.2 && q0.balanceUsd === 0 && q0.shortUsd === 0.2 && q0.payUsd === IMAGES.prepaid.minUsd, JSON.stringify(q0));
await fund(w1, 0.35);
const q1 = await quote(S, -w1, 'ephelion-entry');
check('the quote after a top-up: $0.65 missing', Math.abs(q1.shortUsd - 0.65) < 1e-9 && q1.payUsd === 0.65, JSON.stringify(q1));
await fund(w1, 0.65);
const c1 = await charge(S, -w1, 'ephelion-entry', 'doing-fine');
check('topped up exactly: the entry is charged $1.00 and the balance is 0', c1.ok && c1.usd === 1 && (await balanceUsd(S, w1)) === 0, JSON.stringify(c1));
const [row] = await sql`select person::float8 as person, item, ref, usd::float8 as usd from studio.wallet_debits where id = ${c1.ok ? c1.debitId : 0}`;
check('the charge records who, what and for which speech', row.person === -w1 && row.item === 'ephelion-entry' && row.ref === 'doing-fine' && row.usd === 1, JSON.stringify(row));
// Not made: added back, and trying again is free.
await addBack(S, c1.ok ? c1.debitId : 0, 'failed');
check('not made: the charge is added back', (await balanceUsd(S, w1)) === 1);
const c2 = await charge(S, -w1, 'ephelion-entry', 'doing-fine');
check('the retry spends the added-back money, so nothing is charged twice', c2.ok && (await balanceUsd(S, w1)) === 0);

// Refunds in the balance, and in the admin page's held totals.
const { defs, countSql } = await import('../src/lib/admin-activity-defs');
const heldTotal = async (id: string) => {
  const d = defs('x').find((x) => x.id === id)!;
  const rows = await db.query<{ n: number; total: boolean }>(countSql(d), [30]);
  return Number(rows.rows.find((r) => r.total)?.n ?? 0);
};
const w2 = await accountFor(S, hex('3c', 40));
await fund(w2, 1);
const c3 = await charge(S, -w2, 'ephelion-entry', 'the-last-five-years');
const heldBefore = await heldTotal('wallet_owed');
const holdingBefore = await heldTotal('wallet_holding');
check('a refund is refused while the charge is spent', (await recordRefund(S, 6786, { debitId: c3.ok ? c3.debitId : 0, txHash: newTx() })).status === 409);
await creditBack(S, c3.ok ? c3.debitId : 0, 'failed');
check('added back: the balance holds it again', (await balanceUsd(S, w2)) === 1);
const heldMid = await heldTotal('wallet_owed');
check('the held total rose by the added-back $1.00', Math.abs(heldMid - heldBefore - 1) < 1e-6, `${heldBefore} -> ${heldMid}`);
check('a refund by someone who is not an admin: not found', (await recordRefund(S, 12345, { debitId: c3.ok ? c3.debitId : 0, txHash: newTx() })).status === 404);
check('a refund without a good transaction hash: refused', (await recordRefund(S, 6786, { debitId: c3.ok ? c3.debitId : 0, txHash: '0x12' })).status === 400);
const rf = await recordRefund(S, 6786, { debitId: c3.ok ? c3.debitId : 0, txHash: newTx() });
check('the admin records the refund: the balance is 0 again, sent to the balance’s own wallet', rf.status === 200 && rf.body.balanceUsd === 0 && rf.body.to === hex('3c', 40) && (await balanceUsd(S, w2)) === 0, JSON.stringify(rf));
check('the held total subtracts the refund (back where it was)', Math.abs((await heldTotal('wallet_owed')) - heldBefore) < 1e-6);
check('the accounts holding a balance subtract it too', (await heldTotal('wallet_holding')) === holdingBefore);
check('the same charge can’t be refunded twice', (await recordRefund(S, 6786, { debitId: c3.ok ? c3.debitId : 0, txHash: newTx() })).status === 409);
check('after the refund, the money can’t be charged again', (await charge(S, -w2, 'ephelion-entry', 'the-last-five-years')).ok === false);
// The other order: a charge spends the added-back money first; the refund then finds nothing to refund.
const w3 = await accountFor(S, hex('4d', 40));
await fund(w3, 0.2);
const c4 = await charge(S, -w3, 'ephelion-picture', 'doing-fine');
await creditBack(S, c4.ok ? c4.debitId : 0, 'dropped');
const c5 = await charge(S, -w3, 'ephelion-picture', 'doing-fine');
const rf2 = await recordRefund(S, 6786, { debitId: c4.ok ? c4.debitId : 0, txHash: newTx() });
check('charged again first: the refund is refused, the balance stays at 0, never below', c5.ok && rf2.status === 409 && (await balanceUsd(S, w3)) === 0, JSON.stringify(rf2));
const neg = await db.query<{ n: number }>(`select count(*)::int as n from (select account_id, sum(u) b from (select account_id, usd u from studio.wallet_payments union all select account_id, -usd from studio.wallet_debits union all select account_id, usd from studio.wallet_credits union all select account_id, -usd from studio.wallet_refunds) y group by account_id) x where b < -0.000001`);
check('no balance is below zero', neg.rows[0].n === 0);

// The caps: 5 entries a person a day (net of add-backs), 10 pictures, and $25 across the site.
const w4 = await accountFor(S, hex('5e', 40));
await fund(w4, 20);
const five: boolean[] = [];
for (let i = 0; i < 5; i++) five.push((await charge(S, -w4, 'ephelion-entry', 'doing-fine')).ok);
const sixth = await charge(S, -w4, 'ephelion-entry', 'doing-fine');
check('5 paid entries a day; the 6th is refused', five.every(Boolean) && !sixth.ok && sixth.refusal === 'person-cap', JSON.stringify(sixth));
const [last] = await sql`select max(id)::int as id from studio.wallet_debits where account_id = ${w4} and item = 'ephelion-entry'`;
await creditBack(S, last.id, 'failed');
check('one added back (not made): the retry fits under the cap', (await charge(S, -w4, 'ephelion-entry', 'doing-fine')).ok);
const pics: boolean[] = [];
for (let i = 0; i < 10; i++) pics.push((await charge(S, -w4, 'ephelion-picture', 'doing-fine')).ok);
const p11 = await charge(S, -w4, 'ephelion-picture', 'doing-fine');
check('10 paid pictures a day; the 11th is refused', pics.every(Boolean) && !p11.ok && p11.refusal === 'person-cap');
const [tot] = await sql`select coalesce(sum(d.usd), 0)::float8 as usd from studio.wallet_debits d where d.item is not null and not exists (select 1 from studio.wallet_credits c where c.debit_id = d.id)`;
E.dailyCapUsd = tot.usd + 0.5;
const w5 = await accountFor(S, hex('6f', 40));
await fund(w5, 5);
const siteFull = await charge(S, -w5, 'ephelion-entry', 'doing-fine');
check('the site-wide cap counts everyone’s paid charges that day', !siteFull.ok && siteFull.refusal === 'site-cap', JSON.stringify(siteFull));
E.dailyCapUsd = 25;
check('under the site-wide cap again, the same charge goes through', (await charge(S, -w5, 'ephelion-entry', 'doing-fine')).ok);

// A Farcaster person spends a linked wallet's balance; Lens/Bluesky need a wallet first.
const FID = 2147483646;
const w6 = await accountFor(S, hex('7a', 40));
await sql`insert into studio.wallet_links (account_id, fid, how) values (${w6}, ${FID}, 'verified')`;
await fund(w6, 0.2);
const c6 = await charge(S, FID, 'ephelion-picture', 'doing-fine');
const [r6] = await sql`select account_id::int as a, person::float8 as p from studio.wallet_debits where id = ${c6.ok ? c6.debitId : 0}`;
check('a Farcaster person pays from the wallet linked to their account, recorded as theirs', c6.ok && r6.a === w6 && r6.p === FID && (await balanceUsd(S, w6)) === 0, JSON.stringify(r6));
check('a Farcaster person with no linked wallet: connect one first', ((await charge(S, 2147483645, 'ephelion-picture', 'doing-fine')) as { refusal?: string }).refusal === 'no-wallet');
check('a Lens or Bluesky account: connect a wallet first', ((await charge(S, -1_000_000_007, 'ephelion-picture', 'doing-fine')) as { refusal?: string }).refusal === 'no-wallet');

// Paying from a wallet verified on the Farcaster account.
const usdcPaid = async () => ({ ok: true as const, token: 'USDC' as const, amount: 1_000_000n, usd: 1, blockNumber: 100n });
const linkedTo = (fid: number | null) => async () => ({ linked: fid, why: 'stub' });
const vAddr = hex('8b', 40);
const v1 = await claimVerified(S, FID, { txHash: newTx(), address: vAddr }, { read: usdcPaid, autoLink: linkedTo(FID) });
const vAcct = await accountFor(S, vAddr);
check('a payment from a wallet verified on the account is added to that wallet’s balance', v1.status === 200 && v1.body.added === 1 && (await balanceUsd(S, vAcct)) === 1, JSON.stringify(v1));
const vTx = newTx();
await claimVerified(S, FID, { txHash: vTx, address: vAddr }, { read: usdcPaid, autoLink: linkedTo(FID) });
check('the same payment twice: added once', (await claimVerified(S, FID, { txHash: vTx, address: vAddr }, { read: usdcPaid, autoLink: linkedTo(FID) })).status === 409);
check('a wallet verified on someone else’s account: refused, nothing added', (await claimVerified(S, 2147483645, { txHash: newTx(), address: hex('9c', 40) }, { read: usdcPaid, autoLink: linkedTo(42) })).status === 403);
check('signed out: 401', (await claimVerified(S, null, { txHash: newTx(), address: vAddr }, { read: usdcPaid, autoLink: linkedTo(FID) })).status === 401);
E.enabled = false;
check('switch off: not found', (await claimVerified(S, FID, { txHash: newTx(), address: vAddr }, { read: usdcPaid, autoLink: linkedTo(FID) })).status === 404);
E.enabled = true;

// Paid voice calls: their own pool; the free daily number of conversions doesn't stop a paid entry.
const { refusal } = await import('../src/lib/voice/costs');
await sql`insert into studio.voice_asks (fid) values (${FID}), (${FID}), (${FID})`;
check('free: a third whole take today is refused', (await refusal(S, FID, 100, true, 'free')) !== null);
check('paid: the same take is allowed (the paid entry cap counts it)', (await refusal(S, FID, 100, true, 'prepaid')) === null);
await sql`insert into studio.voice_costs (kind, model, funded, verdict, calls, seconds, credits, estimated_credits, cost_usd) values ('convert', 'eleven_multilingual_sts_v2', 'prepaid', 'ok', 1, 64, 704, 710, 0.128)`;
check('paid voice costs are kept apart', Number((await sql`select count(*)::int as n from studio.voice_costs where funded = 'prepaid'`)[0].n) === 1);

// P7: nothing orders or scores by payment in the new code.
for (const f of ['src/lib/wallet/paid.ts', 'src/components/admin-payments.tsx', 'src/components/top-up.tsx']) {
  const t = read(f);
  check(`${f}: no ordering or scoring by amount`, ![...t.matchAll(/order by[^`'"]{0,200}|\.sort\([^)]{0,200}\)/gi)].some((m) => /\b(amount|usd|cost_usd|price)\b/i.test(m[0])));
}

await sql.end();
await server.stop();
if (failures.length) {
  console.error(`paid tests FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`paid tests passed: ${passed} checks (the account lock, refunds in the balance, charges and caps, verified wallets, refunds by admins, paid voice)`);
process.exit(0);
