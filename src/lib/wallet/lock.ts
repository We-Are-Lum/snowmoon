import 'server-only';
import type postgres from 'postgres';

/**
 * The account lock (owner, 2026-11-25, for PR A): every path that checks a prepaid balance and charges it takes this
 * lock first, inside the same transaction, so two charges, or a charge and a refund, can't both spend the same money.
 * It is exactly the lock studio.record_wallet_refund takes (NEXT_paid_generations.sql):
 * pg_advisory_xact_lock(hashtext('snowmoon.wallet.account'), account_id::int). Released when the transaction ends.
 * Several accounts are locked in ascending order, so two transactions never wait on each other in a circle.
 */
export const ACCOUNT_LOCK = 'snowmoon.wallet.account';

export async function lockAccount(tx: postgres.Sql | postgres.TransactionSql, account: number): Promise<void> {
  if (!Number.isInteger(account) || account <= 0) throw new Error('bad account');
  await (tx as postgres.Sql)`select pg_advisory_xact_lock(hashtext(${ACCOUNT_LOCK}), ${account}::int)`;
}

export async function lockAccounts(tx: postgres.Sql | postgres.TransactionSql, accounts: number[]): Promise<void> {
  for (const a of [...new Set(accounts)].sort((x, y) => x - y)) await lockAccount(tx, a);
}
