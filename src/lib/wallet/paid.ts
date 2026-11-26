import 'server-only';
import type postgres from 'postgres';
import { EPHELION_PAID, IMAGES, type PaidItem } from '../config';
import { isAdmin } from '../admins';
import { isFarcasterPerson, isWalletPerson } from '../people';
import { balanceUsd, creditBack, prepaidOpen, type CreditReason } from './credits';
import { walletLinksOf } from './links';
import { lockAccounts } from './lock';

/**
 * Paid generations for the Ephelion challenge, on the prepaid balance (owner, 2026-11-25; EPHELION_PAID, OFF; PR A).
 * - Who pays: a wallet account pays from its own balance; a Farcaster person from the balances of the wallets linked
 *   to their account (verified on Farcaster, or linked by both sign-ins). Lens and Bluesky accounts connect a wallet first.
 * - A charge (studio.wallet_debits, with person, item and ref) is taken under the site's paid lock and every candidate
 *   account's lock (src/lib/wallet/lock.ts, the lock studio.record_wallet_refund takes), after the caps: 5 entries and
 *   10 pictures a person a UTC day, and $25 a day across the site, both counted at the price, net of charges added back.
 * - A charge for something not made is added back to the balance (creditBack), so trying again is free.
 * - If we can't make it, an admin refunds it in USDC to the balance's own wallet: studio.record_wallet_refund checks
 *   the charge was added back, the balance still holds it, the wallet, and that it isn't refunded twice.
 * Payment buys generations, never standing (P7): nothing here is read to order, rank or score anything.
 */
type Sql = postgres.Sql;
const TODAY = "((now() at time zone 'utc')::date)";
const SPEND_LOCK = 'snowmoon.paid.spend';

export const paidOpen = () => EPHELION_PAID.enabled && prepaidOpen();
export const priceOf = (item: PaidItem) => EPHELION_PAID.prices[item];

/** The wallet accounts whose balance this person may spend, in a fixed order (the oldest link first). */
export async function spendableAccounts(sql: Sql, person: number): Promise<number[]> {
  if (isWalletPerson(person)) return [-person];
  if (isFarcasterPerson(person)) return (await walletLinksOf(sql, person)).map((l) => l.account);
  return [];
}

export type PaidRefusal = 'off' | 'no-wallet' | 'balance' | 'person-cap' | 'site-cap';
export type Charge = { ok: true; debitId: number; account: number; usd: number } | { ok: false; refusal: PaidRefusal; shortUsd?: number };

/** What the top-up panel shows before anyone pays: the price, the best balance, what's missing, and the smallest payment that covers it. */
export async function quote(sql: Sql, person: number, item: PaidItem): Promise<{ priceUsd: number; balanceUsd: number; shortUsd: number; payUsd: number; account: number | null }> {
  const price = priceOf(item);
  const accounts = await spendableAccounts(sql, person);
  let best = 0, account: number | null = null;
  for (const a of accounts) {
    const b = await balanceUsd(sql, a);
    if (account === null || b > best) [best, account] = [b, a];
  }
  const short = Math.max(0, Math.round((price - best) * 1e6) / 1e6);
  // A payment below the prepaid minimum isn't added, so the smallest top-up is at least that.
  return { priceUsd: price, balanceUsd: best, shortUsd: short, payUsd: short > 0 ? Math.max(short, IMAGES.prepaid.minUsd) : 0, account };
}

/** Today's paid charges not added back: for one person and item, or across the site. */
async function chargedToday(sql: Sql, person: number | null, item: PaidItem | null): Promise<{ n: number; usd: number }> {
  const [r] = await sql`select count(*)::int as n, coalesce(sum(d.usd), 0)::float8 as usd from studio.wallet_debits d
    where d.item is not null and (d.at at time zone 'utc')::date = ${sql.unsafe(TODAY)}
      and (${person}::bigint is null or d.person = ${person}) and (${item}::text is null or d.item = ${item})
      and not exists (select 1 from studio.wallet_credits c where c.debit_id = d.id)`;
  return { n: r.n, usd: r.usd };
}

/** Charge this person for one paid item (ref: the speech, or the take the picture is for). */
export async function charge(sql: Sql, person: number, item: PaidItem, ref: string | null): Promise<Charge> {
  if (!paidOpen()) return { ok: false, refusal: 'off' };
  if (ref !== null && !/^[a-z0-9-]{1,80}$/.test(ref)) throw new Error('bad ref');
  const price = priceOf(item);
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    const accounts = await spendableAccounts(t, person);
    if (!accounts.length) return { ok: false as const, refusal: 'no-wallet' as const };
    await tx`select pg_advisory_xact_lock(hashtext(${SPEND_LOCK}))`;
    await lockAccounts(t, accounts);
    if ((await chargedToday(t, person, item)).n >= EPHELION_PAID.perPersonPerDay[item]) return { ok: false as const, refusal: 'person-cap' as const };
    if ((await chargedToday(t, null, null)).usd + price > EPHELION_PAID.dailyCapUsd) return { ok: false as const, refusal: 'site-cap' as const };
    let best = 0;
    for (const a of accounts) {
      const b = await balanceUsd(t, a);
      if (b >= price) {
        const [d] = await tx`insert into studio.wallet_debits (account_id, usd, person, item, ref) values (${a}, ${price}, ${person}, ${item}, ${ref}) returning id::int as id`;
        return { ok: true as const, debitId: d.id as number, account: a, usd: price };
      }
      best = Math.max(best, b);
    }
    return { ok: false as const, refusal: 'balance' as const, shortUsd: Math.round((price - best) * 1e6) / 1e6 };
  });
}

/** Not made: the charge goes back to the balance, so trying again is free (the same rule as images, IMAGES.prepaid.creditBack). */
export const addBack = (sql: Sql, debitId: number, reason: CreditReason) => creditBack(sql, debitId, reason);

export type RefundAnswer = { status: number; body: Record<string, unknown> };

/**
 * An admin records a refund already sent in USDC on Base (its transaction) for a charge we couldn't make. The database
 * function checks the charge was added back, the balance still holds it, the wallet (the balance's own), and that it
 * isn't a second refund; all under the account's lock. Admins only: everyone else 404, before anything is read.
 */
export async function recordRefund(sql: Sql | null, fid: number | null, body: { debitId?: unknown; txHash?: unknown }): Promise<RefundAnswer> {
  if (!isAdmin(fid)) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'No database' } };
  const debitId = Number(body.debitId);
  const tx = typeof body.txHash === 'string' ? body.txHash.trim().toLowerCase() : '';
  if (!Number.isInteger(debitId) || debitId <= 0 || !/^0x[0-9a-f]{64}$/.test(tx)) return { status: 400, body: { error: 'Give the charge and the refund’s transaction hash.' } };
  const [d] = await sql`select d.account_id::int as account, a.address from studio.wallet_debits d join studio.wallet_accounts a on a.id = d.account_id where d.id = ${debitId}`;
  if (!d) return { status: 404, body: { error: 'No such charge.' } };
  try {
    const [r] = await sql`select studio.record_wallet_refund(${debitId}, ${d.address}, ${tx}, ${fid}) as id`;
    return { status: 200, body: { refunded: Number(r.id), to: d.address, balanceUsd: await balanceUsd(sql, d.account) } };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'P0002' || code === '22023' || code === '23505') return { status: 409, body: { error: (e as Error).message } };
    throw e;
  }
}

/** /admin/payments: the ledger, newest first, and the totals by UTC day. Admins only (the caller checks). Never public. */
export async function ledger(sql: Sql, days = 30) {
  const since = `((now() at time zone 'utc')::date - ${Math.max(1, Math.min(365, Math.floor(days)))})`;
  const payments = await sql`select p.credited_at as at, p.account_id::int as account, a.address, p.token, p.usd::float8 as usd, p.tx_hash as "txHash"
    from studio.wallet_payments p join studio.wallet_accounts a on a.id = p.account_id
    where (p.credited_at at time zone 'utc')::date >= ${sql.unsafe(since)} order by p.credited_at desc limit 500`;
  const charges = await sql`select d.id::int as id, d.at, d.account_id::int as account, d.person::float8 as person, d.item, d.ref, d.usd::float8 as usd,
      (select c.reason from studio.wallet_credits c where c.debit_id = d.id) as "addedBack",
      (select r.tx_hash from studio.wallet_refunds r where r.debit_id = d.id) as "refundTx"
    from studio.wallet_debits d where (d.at at time zone 'utc')::date >= ${sql.unsafe(since)} order by d.at desc limit 1000`;
  const totals = await sql`select day::text, sum(paid)::float8 as paid, sum(spent)::float8 as spent, sum(paid_items)::float8 as "paidItems", sum(back)::float8 as "addedBack", sum(refunded)::float8 as refunded from (
      select (credited_at at time zone 'utc')::date as day, usd as paid, 0 as spent, 0 as paid_items, 0 as back, 0 as refunded from studio.wallet_payments
      union all select (at at time zone 'utc')::date, 0, usd, case when item is not null then usd else 0 end, 0, 0 from studio.wallet_debits
      union all select (at at time zone 'utc')::date, 0, 0, 0, usd, 0 from studio.wallet_credits
      union all select (at at time zone 'utc')::date, 0, 0, 0, 0, usd from studio.wallet_refunds) x
    where day >= ${sql.unsafe(since)} group by day order by day desc`;
  return { payments, charges, totals };
}

/**
 * A Farcaster person pays from a wallet verified on their account without signing in with it (owner, 2026-11-25:
 * "the signed-in wallet or a wallet verified on their Farcaster account"). The payment is read on Base as from that
 * address (USDC to payTo, 3 confirmations, never added before) and is credited to that wallet's own account, which is
 * linked to the person: an active link to this FID, or else the automatic link (Neynar: this FID, and only this FID,
 * has the address). A wallet linked to anyone else, or unlinked by its person, is refused. OFF with EPHELION_PAID.
 */
export type VerifiedDeps = {
  read: (hash: `0x${string}`, from: string) => Promise<{ ok: true; token: 'USDC' | 'ETH'; amount: bigint; usd: number; blockNumber: bigint } | { ok: false; why: string }>;
  autoLink: (sql: Sql, account: number, address: string) => Promise<{ linked: number | null; why: string }>;
};
export async function claimVerified(sql: Sql | null, fid: number | null, body: { txHash?: unknown; address?: unknown }, deps: VerifiedDeps): Promise<RefundAnswer> {
  if (fid === null) return { status: 401, body: { error: 'Sign in' } };
  if (!paidOpen()) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'No database' } };
  if (!isFarcasterPerson(fid)) return { status: 403, body: { error: 'Connect a wallet first.' } };
  const tx = typeof body.txHash === 'string' ? body.txHash.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim().toLowerCase() : '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx) || !/^0x[0-9a-f]{40}$/.test(address)) return { status: 400, body: { error: 'Bad request' } };
  const { accountFor, credit } = await import('./credits');
  const account = await accountFor(sql, address);
  const linked = (await walletLinksOf(sql, fid)).some((l) => l.account === account) || (await deps.autoLink(sql, account, address)).linked === fid;
  if (!linked) return { status: 403, body: { error: 'That wallet isn’t verified on your Farcaster account.', reason: 'not-verified' } };
  const p = await deps.read(tx as `0x${string}`, address);
  if (!p.ok) return { status: p.why === 'pending' || p.why === 'not-found' ? 409 : 422, body: { error: p.why, reason: p.why, retry: p.why === 'pending' || p.why === 'not-found' } };
  const added = await credit(sql, account, { txHash: tx, token: p.token, amount: p.amount, usd: p.usd, blockNumber: p.blockNumber });
  if (!added) return { status: 409, body: { error: 'already', reason: 'already' } };
  return { status: 200, body: { added: p.usd, token: p.token, balanceUsd: await balanceUsd(sql, account) } };
}
