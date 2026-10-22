/**
 * A prepaid price as charged, in three decimals (owner, 2026-10-22: "round each price up to the nearest $0.001 and show
 * three decimals"; prices are rounded up to that, src/lib/wallet/credits.ts priceUsd), never rounded down for show:
 * Terms 6a says a generation is charged "at the price shown when you start it". $0.009, $0.054.
 */
export function exactDollars(usd: number): string {
  return (Math.ceil(Math.round(usd * 1e6) / 1000) / 1000).toFixed(3);
}
