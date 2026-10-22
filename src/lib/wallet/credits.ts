import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';

/**
 * Prepaid balances for wallet accounts (owner, 2026-10-13; migration 0011). Balance = payments
 * credited - debits + debits credited back for a failed Generate (migration 0022, once
 * IMAGES.prepaid.creditBack is on). A Generate's price is its estimated cost (the worst case reserved for it,
 * src/lib/images/limits.ts) plus IMAGES.prepaid.markup, rounded up to the nearest $0.001 (owner, 2026-10-22: "round each
 * price up to the nearest $0.001 and show three decimals"), so the price shown (three decimals) is the price charged.
 */
type Sql = postgres.Sql;

export const priceUsd = (reserveUsd: number) => Math.ceil(Math.ceil(reserveUsd * (1 + IMAGES.prepaid.markup) * 1e6 - 1e-6) / 1000) / 1000;

/** Payment can be taken only once there is an address to pay. */
export const prepaidOpen = () => Boolean(IMAGES.prepaid.enabled && IMAGES.prepaid.payTo);

/** The account for this address, made on first sign-in. */
export async function accountFor(sql: Sql, address: string): Promise<number> {
  const a = address.toLowerCase();
  await sql`insert into studio.wallet_accounts (address) values (${a}) on conflict (address) do nothing`;
  const [r] = await sql`select id::int as id from studio.wallet_accounts where address = ${a}`;
  return r.id;
}

export async function balanceUsd(sql: Sql, account: number): Promise<number> {
  const [r] = await sql`select
    coalesce((select sum(usd) from studio.wallet_payments where account_id = ${account}), 0)::float8
    - coalesce((select sum(usd) from studio.wallet_debits where account_id = ${account}), 0)::float8 as usd`;
  const back = IMAGES.prepaid.creditBack ? await creditedUsd(sql, account) : 0;
  return Math.round(((r?.usd ?? 0) + back) * 1e6) / 1e6;
}

/** What failed Generates gave back to this account (migration 0022; read only while IMAGES.prepaid.creditBack is on). */
async function creditedUsd(sql: Sql, account: number): Promise<number> {
  const [r] = await sql`select coalesce(sum(usd), 0)::float8 as usd from studio.wallet_credits where account_id = ${account}`;
  return r?.usd ?? 0;
}

/** Credits a payment once (its hash is the key). False when it was already credited. */
export async function credit(sql: Sql, account: number, p: { txHash: string; token: 'USDC' | 'ETH'; amount: bigint; usd: number; blockNumber: bigint }): Promise<boolean> {
  const rows = await sql`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number)
    values (${p.txHash.toLowerCase()}, ${account}, ${IMAGES.prepaid.chainId}, ${p.token}, ${p.amount.toString()}, ${p.usd}, ${p.blockNumber.toString()})
    on conflict (tx_hash) do nothing returning 1`;
  return rows.length > 0;
}

/**
 * What a Generate cost the account, taken when it is pressed. Its id, so a Generate that fails can be credited
 * back (creditBack). Never paid out as money (owner, 2026-10-13 and 2026-10-21).
 */
export async function debit(sql: Sql, account: number, usd: number): Promise<number> {
  const [r] = await sql`insert into studio.wallet_debits (account_id, usd) values (${account}, ${usd}) returning id::int as id`;
  return r.id;
}

/**
 * Why a Generate gave no picture (owner, 2026-10-22, reading B: every Generate that gives no picture is credited back):
 * 'failed' (the prompt check or the image model didn't answer), 'refused' (the blocked-names list or the rules check
 * refused the prompt), 'dropped' (the safety checker dropped the picture). 'refused' and 'dropped' came with migration
 * 0027_wallet_credit_reasons.sql (applied 2026-10-22).
 */
export type CreditReason = 'failed' | 'refused' | 'dropped';

/**
 * Credits a failed Generate's debit back to the same account's balance, once, for exactly what was taken (the row
 * is copied from the debit itself). False when credit-back is off (IMAGES.prepaid.creditBack, waiting for migration
 * 0022 and the Terms) or the debit was already credited. Never throws: a Generate's answer doesn't wait on it.
 */
export async function creditBack(sql: Sql, debitId: number | undefined, reason: CreditReason): Promise<boolean> {
  if (!IMAGES.prepaid.creditBack || !debitId) return false;
  try {
    const rows = await sql`insert into studio.wallet_credits (debit_id, account_id, usd, reason)
      select id, account_id, usd, ${reason} from studio.wallet_debits where id = ${debitId}
      on conflict (debit_id) do nothing returning 1`;
    return rows.length > 0;
  } catch (e) {
    console.error('credit back failed', (e as Error).name);
    return false;
  }
}
