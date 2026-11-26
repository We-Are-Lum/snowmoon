import { PAID_WORDING as W } from './paid-wording';

/**
 * What the top-up does with the server's quote for the connected wallet (owner, 2026-11-25): send nothing unless this
 * person may pay from that wallet; otherwise send exactly what's missing, plus `extraUsd` for later. Plain, so the
 * tests can check it without a wallet.
 */
export type TopUpQuote = { priceUsd: number; balanceUsd: number; shortUsd: number; payUsd: number; payable: boolean; why?: 'no-address' | 'not-yours' | 'lookup'; extraUsd: number };
export type Plan = { send: false; note: string } | { send: true; usd: number };

export function topUpPlan(q: TopUpQuote | null, extraUsd: number): Plan {
  if (!q) return { send: false, note: W.noQuote };
  if (!q.payable) return { send: false, note: q.why === 'lookup' ? W.cantCheck : W.notYours };
  const usd = Math.round((q.payUsd + Math.max(0, extraUsd)) * 1e6) / 1e6;
  if (usd <= 0) return { send: false, note: W.enough };
  return { send: true, usd };
}
