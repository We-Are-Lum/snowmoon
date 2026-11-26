import 'server-only';
import type postgres from 'postgres';
import { decodeEventLog, parseAbi, type Hash, type PublicClient } from 'viem';
import { EPHELION_PAID, IMAGES, WALLET_LINKS, type PaidItem } from '../config';
import { isAdmin } from '../admins';
import { isFarcasterPerson, isWalletPerson } from '../people';
import { accountFor, balanceUsd, credit, creditBack, prepaidOpen, type CreditReason } from './credits';
import { chain } from './chain';
import { NEYNAR_BY_ADDRESS, fidsIn, isPayTo, link as linkWallet, readLink, soleFid, walletLinksOf } from './links';
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
/** Only the items with a price (Object.hasOwn: not 'constructor', 'toString' or anything else an object inherits). */
export const isPaidItem = (x: unknown): x is PaidItem => typeof x === 'string' && Object.hasOwn(EPHELION_PAID.prices, x);
/** Up to the next whole USDC unit ($0.000001), so a payment of exactly that covers it. */
export const usdcUp = (usd: number) => Math.max(0, Math.ceil(Math.round(usd * 1e9) / 1e3) / 1e6);

/**
 * PR C, not now (owner, 2026-11-25): once paid voice calls are wired to an entry, limit the whole conversions one paid
 * entry may use. As written, the paid voice pool is only capped per day (EPHELION_PAID.dailyCapUsd), so one $1.00
 * entry's calls could use the whole $25 paid voice day.
 */

/** The FIDs whose custody or verified address this is, asked of Neynar directly (no wallet account is made to cache it). Null when it can't be asked. */
export type FidsFor = (address: string) => Promise<number[] | null>;
export const neynarFids: FidsFor = async (address) => {
  const key = process.env.NEYNAR_API_KEY;
  if (!WALLET_LINKS.lookUp || !key) return null;
  try {
    const res = await fetch(`${NEYNAR_BY_ADDRESS.url}?addresses=${address}&address_types=${NEYNAR_BY_ADDRESS.types}`, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(NEYNAR_BY_ADDRESS.timeoutMs), redirect: 'error' });
    if (res.status === 404) return [];
    if (!res.ok) return null;
    return fidsIn(await res.json(), address);
  } catch {
    return null;
  }
};

/**
 * May this person pay from this wallet address, so that the payment lands where they can spend it? Answered before
 * anything is sent (owner, 2026-11-25: the top-up checks the wallet first). A wallet account: only its own address. A
 * Farcaster person: a wallet already linked to them, or one Neynar says is theirs alone (verified or custody) that
 * nobody else is linked to and that its person never unlinked. Lens and Bluesky: no (connect a wallet first). Makes no
 * row: the wallet's account (if any) is only looked up.
 */
export type Payer = { yours: true; account: number | null } | { yours: false; why: 'no-address' | 'not-yours' | 'lookup' };
export async function payerCheck(sql: Sql, person: number, address: unknown, fidsFor: FidsFor): Promise<Payer> {
  const a = typeof address === 'string' ? address.trim().toLowerCase() : '';
  if (!/^0x[0-9a-f]{40}$/.test(a) || isPayTo(a)) return { yours: false, why: 'no-address' };
  const [row] = await sql`select id::int as id from studio.wallet_accounts where address = ${a}`;
  const account: number | null = row ? row.id : null;
  if (isWalletPerson(person)) return account === -person ? { yours: true, account } : { yours: false, why: 'not-yours' };
  if (!isFarcasterPerson(person)) return { yours: false, why: 'not-yours' };
  if (account !== null) {
    if ((await walletLinksOf(sql, person)).some((l) => l.account === account)) return { yours: true, account };
    const r = await readLink(sql, account);
    if (r.active || r.personUnlinked) return { yours: false, why: 'not-yours' };
  }
  const fids = await fidsFor(a);
  if (fids === null) return { yours: false, why: 'lookup' };
  return soleFid(fids) === person ? { yours: true, account } : { yours: false, why: 'not-yours' };
}

/** The wallet accounts whose balance this person may spend, in a fixed order (the oldest link first). */
export async function spendableAccounts(sql: Sql, person: number): Promise<number[]> {
  if (isWalletPerson(person)) return [-person];
  if (isFarcasterPerson(person)) return (await walletLinksOf(sql, person)).map((l) => l.account);
  return [];
}

export type PaidRefusal = 'off' | 'no-wallet' | 'balance' | 'person-cap' | 'site-cap';
export type Charge = { ok: true; debitId: number; account: number; usd: number } | { ok: false; refusal: PaidRefusal; shortUsd?: number };

/**
 * What the top-up panel shows before anyone pays, for the wallet that will pay (the connected address): whether this
 * person may pay from it, its balance, and exactly what's missing for one charge from it (a payment is credited to the
 * wallet that pays, and a charge is taken from one wallet that holds the whole price). Rounded up to one USDC unit.
 */
export type Quote = { priceUsd: number; balanceUsd: number; shortUsd: number; payUsd: number; payable: boolean; why?: 'no-address' | 'not-yours' | 'lookup' };
export async function quote(sql: Sql, person: number, item: PaidItem, address: unknown, fidsFor: FidsFor = neynarFids): Promise<Quote> {
  const price = priceOf(item);
  const payer = await payerCheck(sql, person, address, fidsFor);
  if (!payer.yours) return { priceUsd: price, balanceUsd: 0, shortUsd: price, payUsd: 0, payable: false, why: payer.why };
  const balance = payer.account === null ? 0 : await balanceUsd(sql, payer.account);
  const short = usdcUp(price - balance);
  return { priceUsd: price, balanceUsd: balance, shortUsd: short, payUsd: short, payable: true };
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
/**
 * The refund's own transaction, read on Base (owner, 2026-11-25: "a confirmed USDC transfer to the balance's wallet
 * for at least the charge"): successful, with IMAGES.prepaid.confirmations, and USDC (IMAGES.prepaid.usdc) Transfer logs
 * to that wallet adding up to at least the charge. Who sent it isn't checked.
 */
const TRANSFER = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
export type RefundRead = 'ok' | 'not-found' | 'failed' | 'pending' | 'not-to-wallet' | 'not-usdc' | 'too-little';
export async function readRefund(hash: Hash, to: string, units: bigint, client: PublicClient = chain()): Promise<RefundRead> {
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt) return 'not-found';
  if (receipt.status !== 'success') return 'failed';
  const head = await client.getBlockNumber();
  if (head - receipt.blockNumber + 1n < BigInt(IMAGES.prepaid.confirmations)) return 'pending';
  const w = to.toLowerCase();
  let usdc = 0n, other = false;
  for (const log of receipt.logs) {
    try {
      const e = decodeEventLog({ abi: TRANSFER, data: log.data, topics: log.topics });
      if (e.args.to.toLowerCase() !== w) continue;
      if (log.address.toLowerCase() === IMAGES.prepaid.usdc.toLowerCase()) usdc += e.args.value;
      else other = true;
    } catch {
      /* not a Transfer */
    }
  }
  if (usdc === 0n) return other ? 'not-usdc' : 'not-to-wallet';
  return usdc >= units ? 'ok' : 'too-little';
}
/** Admin-facing reasons a refund's transaction isn't recorded. */
export const REFUND_READ_WORDING: Record<Exclude<RefundRead, 'ok'>, string> = {
  'not-found': 'That transaction isn’t on Base (yet). Check the hash, or try again in a moment.',
  failed: 'That transaction failed on Base, so nothing was sent.',
  pending: `That transaction has fewer than ${IMAGES.prepaid.confirmations} confirmations. Try again in a moment.`,
  'not-to-wallet': 'That transaction sent no USDC to this balance’s wallet.',
  'not-usdc': 'That transaction sent a token to this balance’s wallet, but not USDC on Base.',
  'too-little': 'That transaction sent less USDC to this balance’s wallet than the charge.',
};

export async function recordRefund(sql: Sql | null, fid: number | null, body: { debitId?: unknown; txHash?: unknown }, client?: PublicClient): Promise<RefundAnswer> {
  if (!isAdmin(fid)) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'No database' } };
  const debitId = Number(body.debitId);
  const tx = typeof body.txHash === 'string' ? body.txHash.trim().toLowerCase() : '';
  if (!Number.isInteger(debitId) || debitId <= 0 || !/^0x[0-9a-f]{64}$/.test(tx)) return { status: 400, body: { error: 'Give the charge and the refund’s transaction hash.' } };
  const [d] = await sql`select d.account_id::int as account, a.address, d.usd::float8 as usd from studio.wallet_debits d join studio.wallet_accounts a on a.id = d.account_id where d.id = ${debitId}`;
  if (!d) return { status: 404, body: { error: 'No such charge.' } };
  const read = await readRefund(tx as Hash, d.address, BigInt(Math.round(d.usd * 1e6)), client).catch(() => 'not-found' as const);
  if (read !== 'ok') return { status: read === 'pending' || read === 'not-found' ? 409 : 422, body: { error: REFUND_READ_WORDING[read], reason: read } };
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
 * "the signed-in wallet or a wallet verified on their Farcaster account"). The wallet is checked first (payerCheck), so
 * no account row is made for a wallet that isn't theirs; then the payment is read on Base as from that address (USDC
 * to payTo, confirmations, never added before) and credited to that wallet's own account, linked to the person
 * ('verified') if it wasn't yet. The panel asks the same question before sending anything (quote), so this refusal is
 * the server's own backstop. OFF with EPHELION_PAID.
 */
export type VerifiedDeps = {
  read: (hash: `0x${string}`, from: string) => Promise<{ ok: true; token: 'USDC' | 'ETH'; amount: bigint; usd: number; blockNumber: bigint } | { ok: false; why: string }>;
  fidsFor: FidsFor;
};
export async function claimVerified(sql: Sql | null, fid: number | null, body: { txHash?: unknown; address?: unknown }, deps: VerifiedDeps): Promise<RefundAnswer> {
  if (fid === null) return { status: 401, body: { error: 'Sign in' } };
  if (!paidOpen()) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'No database' } };
  if (!isFarcasterPerson(fid)) return { status: 403, body: { error: 'Connect a wallet first.' } };
  const tx = typeof body.txHash === 'string' ? body.txHash.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim().toLowerCase() : '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx) || !/^0x[0-9a-f]{40}$/.test(address)) return { status: 400, body: { error: 'Bad request' } };
  const payer = await payerCheck(sql, fid, address, deps.fidsFor);
  if (!payer.yours) return { status: 403, body: { error: 'That wallet isn’t verified on your Farcaster account.', reason: payer.why } };
  const account = payer.account ?? (await accountFor(sql, address));
  if (!(await walletLinksOf(sql, fid)).some((l) => l.account === account)) {
    const l = await linkWallet(sql, account, address, fid, 'verified');
    if (!l.ok) return { status: 403, body: { error: 'That wallet isn’t verified on your Farcaster account.', reason: l.why } };
  }
  const p = await deps.read(tx as `0x${string}`, address);
  if (!p.ok) return { status: p.why === 'pending' || p.why === 'not-found' ? 409 : 422, body: { error: p.why, reason: p.why, retry: p.why === 'pending' || p.why === 'not-found' } };
  const added = await credit(sql, account, { txHash: tx, token: p.token, amount: p.amount, usd: p.usd, blockNumber: p.blockNumber });
  if (!added) return { status: 409, body: { error: 'already', reason: 'already' } };
  return { status: 200, body: { added: p.usd, token: p.token, balanceUsd: await balanceUsd(sql, account) } };
}
