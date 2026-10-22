/**
 * A prepaid price as charged, to the millionth of a dollar (prices are rounded up to that, src/lib/wallet/credits.ts
 * priceUsd), never rounded for show: Terms 6a says a generation is charged "at the price shown when you start it"
 * (owner, 2026-10-22). At least two decimals: $0.00845, $0.053951, $1.50.
 */
export function exactDollars(usd: number): string {
  const s = (Math.ceil(usd * 1e6 - 1e-6) / 1e6).toFixed(6).replace(/0+$/, '');
  const [whole, frac = ''] = s.split('.');
  return `${whole}.${frac.padEnd(2, '0')}`;
}
