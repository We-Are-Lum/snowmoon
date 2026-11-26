/**
 * The paid generations' words on screen (owner, 2026-11-25; plan v2, "New wording on screen"). DRAFT, for the owner's
 * reread before PR B turns buying on. "to Lum" stays until the Terms name Lum LLC in the same release.
 */
/** Dollars: two decimals, or up to six when what is missing is less than a whole cent (one USDC unit is $0.000001). */
const d = (n: number) => (Math.abs(Math.round(n * 1e6) % 1e4) === 0 ? `$${n.toFixed(2)}` : `$${n.toFixed(6).replace(/0+$/, "")}`);
export const PAID_WORDING = {
  buyPicture: (usd: number) => `Make another picture · ${d(usd)}`,
  buyEntry: (usd: number) => `Enter another take · ${d(usd)}`,
  costs: (price: number, balance: number) => `This costs ${d(price)}. Your balance: ${d(balance)}.`,
  payMissing: (usd: number) => `Pay ${d(usd)}, what's missing`,
  payMore: (extra: number, total: number) => `Add ${d(extra)} for later (pay ${d(total)})`,
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
  // The wallet is checked before anything is sent (owner, 2026-11-25). DRAFT.
  notYours: 'This wallet isn’t one you can pay from here, so nothing was sent. Connect your signed-in wallet, or one verified on your Farcaster account.',
  cantCheck: 'We couldn’t check this wallet just now, so nothing was sent. Try again in a moment.',
  noQuote: 'We couldn’t get the price just now, so nothing was sent. Try again in a moment.',
  enough: 'Your balance already covers this.',
  forWallet: (short: string) => `For the wallet connected now (${short}).`,
} as const;
