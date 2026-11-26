/**
 * The paid generations' words on screen (owner, 2026-11-25; plan v2, "New wording on screen"). DRAFT, for the owner's
 * reread before PR B turns buying on. "to Lum" stays until the Terms name Lum LLC in the same release.
 */
const d = (n: number) => `$${n.toFixed(2)}`;
export const PAID_WORDING = {
  buyPicture: (usd: number) => `Make another picture · ${d(usd)}`,
  buyEntry: (usd: number) => `Enter another take · ${d(usd)}`,
  costs: (price: number, balance: number) => `This costs ${d(price)}. Your balance: ${d(balance)}.`,
  payMissing: (usd: number) => `Pay ${d(usd)}, what's missing`,
  payMore: (extra: number, total: number) => `Add ${d(extra)} for later (pay ${d(total)})`,
  smallest: (usd: number) => `The smallest payment is ${d(usd)}; what's left stays in your balance.`,
  how: 'Paid in USDC on Base from your wallet, to Lum. Then it’s made straight away.',
  waiting: 'Waiting for your wallet…',
  checking: 'Checking your payment on Base…',
  paid: 'Paid. Making it now.',
  failed: 'That didn’t work. It’s back in your balance: try again for free.',
  tryAgain: 'Try again',
  whichWallet: 'Pay from your signed-in wallet or one verified on your Farcaster account.',
  noWallet: 'Connect a wallet to your account first.',
  personCap: (n: number, what: string) => `You've made ${n} paid ${what} today. More tomorrow (UTC).`,
  siteCap: 'Paid making has reached today’s limit for everyone. It comes back at 00:00 UTC.',
} as const;
