/**
 * "Support this site" (owner, 2026-10-30). DRAFT wording by the coding agent, for the owner's reread; one file, so the
 * reread is one file. Not "donate" (owner). The heading is one of the owner's three options; TITLE picks it.
 */
export const SUPPORT_TITLES = ['Fund the next scene', 'Back Snowmoon Party', 'Keep the lights on'] as const;
export const SUPPORT_WORDING = {
  /** The owner's choice of the three, until the reread: the first. */
  title: SUPPORT_TITLES[0] as (typeof SUPPORT_TITLES)[number],
  link: 'Support this site',
  paysFor: 'It pays for the AI models that make the pictures, the videos and the assistant’s answers, and for the site’s hosting and storage.',
  address: 'The address',
  copy: 'Copy',
  copied: 'Copied',
  networksHead: 'Send only on these networks',
  networksLine: (names: string[]) => `${names.join(' or ')}: ETH, USDC or any other asset on these networks.`,
  warning: 'Sending on any other network (Optimism, Arbitrum, Polygon or another) may lose the funds: this address only exists on the networks above.',
  whereHead: 'Where it goes',
  where: 'The address is a Split: what it receives is shared out as the Split says. Anyone can see it on Splits:',
  splitOn: (network: string) => `the Split on ${network}`,
  gift: 'It’s a gift: it buys nothing here, changes nothing on the site (no place, score or default), and isn’t refunded.',
  qrAlt: (address: string) => `QR code of the address ${address}`,
  sendHead: 'Send with your wallet',
  sendLine: 'On Base, in ETH or USDC, from the wallet in this browser.',
  other: 'Your own amount',
  send: (usd: number, token: string) => `Send $${usd} in ${token}`,
  sending: 'Confirm in your wallet…',
  waiting: 'Sent. Waiting for Base to confirm it…',
  thanks: 'Thank you. It has landed.',
  tx: 'See the transaction',
  declined: 'Nothing was sent.',
  failed: 'The transaction failed on Base. Nothing was taken except the network fee, if any.',
  noWallet: 'No wallet found in this browser. Open this page in your wallet’s browser, or send to the address above from any wallet.',
  badAmount: (min: number, max: number) => `An amount from $${min} to $${max}.`,
  recorded: 'Nothing about you or what you send is recorded here.',
} as const;
