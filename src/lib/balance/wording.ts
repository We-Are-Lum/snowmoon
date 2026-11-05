import { IMAGE_WORDING } from '../images/wording';

/**
 * Words for paying per person (a Farcaster, Lens or Bluesky sign-in's own prepaid balance; PERSON_BALANCE). The signed
 * statement (`statement`) is the owner's, approved 2026-11-05 ("reviewed by the coordinator, approved by the owner").
 * The panel's other words are DRAFT, drafted by a coding agent (Claude, a closed model by Anthropic), for the owner's reread. No server-only imports: the
 * panel uses them too. Where a wallet account's words already say it, they are reused.
 */
const W = IMAGE_WORDING.prepaid;

export const PERSON_WORDING = {
  title: 'Prepaid balance',
  /**
   * What the wallet signs (owner, 2026-11-05, approved, word for word): "Credit my payments to the Farcaster account
   * @name (FID 6786) on snowmoon.party. Payments are final." and the same for Lens and Bluesky (src/lib/balance/person.ts,
   * accountWords, fills in the account).
   */
  statement: (account: string) => `Credit my payments to ${account} on snowmoon.party. Payments are final.`,
  balance: W.balance,
  price: W.price,
  addFunds: W.addFunds,
  /** Before the first payment: what happens, in the order it happens. */
  how: 'Pay from a wallet in this browser. First your wallet signs a message naming your account here (a signature, not a payment); then it sends the payment on Base, and it’s added to your balance once it confirms.',
  freeFirst: 'Your free images are used first; then each image is paid from this balance.',
  /** The person failed the free check but can still pay (owner, 2026-11-04). */
  paidOnly: 'You can still make images paid from your balance.',
  payWith: W.payWith,
  pay: W.pay,
  signing: 'Sign the message in your wallet…',
  waiting: W.waiting,
  added: W.added,
  terms: W.termsCreditBack,
  noWallet: W.noWallet,
  wrongSign: W.wrongSign,
  notOpen: W.notOpen,
  notAddedYet:
    'A payment you sent hasn’t been added to your balance yet. It’s safe: it’s on Base, and you can add it with its transaction hash below, within 7 days of paying.',
  claimLater: W.claimLater,
  tryAgain: W.tryAgain,
  recover: W.recover,
  recoverNote: 'Paste the transaction hash (0x…) or its link on a block explorer. Only a payment to this project from a wallet that signed for your account is added, and only once.',
  recoverLabel: W.recoverLabel,
  recoverButton: W.recoverButton,
  recoverBad: W.recoverBad,
  claim: {
    ...W.claim,
    'not-from-you': 'That payment came from a wallet that hasn’t signed for your account. Add funds from that wallet first, or ask the maintainer.',
    'no-intent': 'No wallet has signed for your account yet. Use Add funds: your wallet signs first, then pays.',
    'too-early': 'That payment was made before your wallet signed for your account, so it can’t be added here. Ask the maintainer.',
    'too-late': 'That payment was made more than a day after your wallet signed for your account. Use Add funds again from that wallet, or ask the maintainer.',
    used: 'That signature was already used for another payment. Use Add funds again.',
    'not-yours': 'That payment can’t be added to this account.',
    off: 'Paying for images isn’t open yet.',
    other: 'That payment couldn’t be added. Try again in a moment.',
  },
} as const;
