/**
 * Whether a refused claim means the payment can never be added, so this device may forget its hash.
 * Four answers are final: it was already added, it failed onchain, it is too old, or it was paid in ETH (only USDC
 * is added since 2026-11-25, so an ETH payment will never be added here). Every other
 * refusal (not to us, not from you, too small) can come from our own reading of Base being
 * wrong, so the hash is kept and tried again (2026-10-19: the owner's first ETH payment, from a smart
 * wallet, was refused as "not to us" by the reader then; the device forgot it, so the fixed reader never
 * saw it again).
 */
export function forgetsPending(reason: string | undefined): boolean {
  return reason === 'already' || reason === 'failed' || reason === 'old' || reason === 'eth';
}
