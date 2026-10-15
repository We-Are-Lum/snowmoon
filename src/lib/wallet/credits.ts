import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';

/**
 * Prepaid balances for wallet accounts (owner, 2026-10-13; migration 0011). Balance = payments
 * credited - debits + refunds (0013). A Generate's price is its estimated cost (the worst case reserved for it,
 * src/lib/images/limits.ts) plus IMAGES.prepaid.markup, rounded up to a millionth of a dollar.
 */
type Sql = postgres.Sql;

export const priceUsd = (reserveUsd: number) => Math.ceil(reserveUsd * (1 + IMAGES.prepaid.markup) * 1e6) / 1e6;

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
    - coalesce((select sum(usd) from studio.wallet_debits where account_id = ${account}), 0)::float8
    + coalesce((select sum(usd) from studio.wallet_refunds where account_id = ${account}), 0)::float8 as usd`;
  return Math.round((r?.usd ?? 0) * 1e6) / 1e6;
}

/** Credits a payment once (its hash is the key). False when it was already credited. */
export async function credit(sql: Sql, account: number, p: { txHash: string; token: 'USDC' | 'ETH'; amount: bigint; usd: number; blockNumber: bigint }): Promise<boolean> {
  const rows = await sql`insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number)
    values (${p.txHash.toLowerCase()}, ${account}, ${IMAGES.prepaid.chainId}, ${p.token}, ${p.amount.toString()}, ${p.usd}, ${p.blockNumber.toString()})
    on conflict (tx_hash) do nothing returning 1`;
  return rows.length > 0;
}

/** What a Generate cost the account. Final: there are no refunds (owner, 2026-10-13). */
export async function debit(sql: Sql, account: number, usd: number): Promise<number> {
  const [r] = await sql`insert into studio.wallet_debits (account_id, usd) values (${account}, ${usd}) returning id::int as id`;
  return r.id;
}

/** Why a debit is credited back: only when the failure is ours (owner, 2026-10-14; migration 0013). */
export type RefundReason = 'check-unavailable' | 'model-unavailable';

/**
 * Credits a Generate's whole debit back, once (the debit is the key). Only for our failures: the
 * prompt check or the image model not answering. Blocked prompts and dropped images stay charged.
 * False when that debit was already credited back.
 */
export async function refund(sql: Sql, debitId: number, reason: RefundReason): Promise<boolean> {
  const rows = await sql`insert into studio.wallet_refunds (debit_id, account_id, usd, reason)
    select id, account_id, usd, ${reason} from studio.wallet_debits where id = ${debitId}
    on conflict (debit_id) do nothing returning 1`;
  return rows.length > 0;
}
