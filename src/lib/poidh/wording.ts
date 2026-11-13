/**
 * The words of submitting a backstory to the poidh bounty, on a challenge picture's page (branch
 * challenge-backstory-bounty, 2026-11-12). Client-safe. `warning` and `needsEth` are the owner's words from his spec
 * (2026-11-12), exactly; everything else is DRAFT wording (the coding agent's), for the owner to rewrite.
 */
export const BOUNTY_WORDING = {
  /** The owner's words (spec, 2026-11-12). */
  warning: 'This goes onchain and can’t be deleted, even if the picture is hidden here.',
  /** The owner's words (spec, 2026-11-12). */
  needsEth: 'You need a little ETH on Base to submit (under a cent).',
  // DRAFT from here on.
  head: 'Submit it to the poidh bounty',
  submit: 'Submit to the bounty',
  pinning: 'Preparing your claim…',
  confirm: 'Confirm in your wallet…',
  waiting: 'Sent. Waiting for Base to confirm it…',
  done: (claimId: string) => `Submitted: claim ${claimId} on poidh.`,
  pendingConfirm: 'Sent. Base hasn’t confirmed it yet; it will show on the bounty once it does.',
  cancelled: 'Cancelled in your wallet. Nothing was sent.',
  noWallet: 'Couldn’t reach your wallet. Try again.',
  left: (n: number, max: number) => `${n} of ${max} submissions left from here.`,
  none: (max: number) => `That’s your ${max} submissions from here. You can still enter on poidh itself.`,
  saveFirst: 'Save a backstory first, then submit it.',
  elsewhere: 'Submitting from here works in the Farcaster app and with a wallet sign-in. Otherwise, copy your backstory and submit it on poidh:',
  copy: 'Copy backstory',
  copied: 'Copied',
  openBounty: 'Open the bounty on poidh',
  voteThere: 'Voting, and everything else about the bounty, happens on poidh.',
  yours: 'Your submissions',
  claim: (id: string) => `Claim ${id}`,
  claimPending: 'Waiting for Base',
  claimFailed: 'Failed on Base',
  tx: 'Transaction',
  // Server answers.
  notSetUp: 'Submitting to the bounty isn’t set up yet. Your backstory is saved; copy it and submit it on poidh.',
  notOwners: 'The bounty couldn’t be checked on Base right now. Nothing was sent; try again later.',
  pictureGone: 'This picture can’t be submitted.',
  socialOnly: 'Submitting from here needs the Farcaster app or a wallet sign-in. Copy your backstory and submit it on poidh.',
  tooManyPins: 'That’s as many submissions as can be prepared from here. Submit on poidh itself.',
  imageUnread: 'Couldn’t read the picture. Try again.',
  pinFailed: 'Couldn’t prepare the claim (IPFS). Nothing was sent; try again.',
  failedOnChain: 'The transaction failed on Base. Nothing was entered; you can try again.',
  notInTx: 'Confirmed, but the claim wasn’t in that transaction. It may show on the bounty on its own.',
} as const;
