import { fundNetworks } from './config';

/** The ready chains in words: "Ethereum mainnet or Base", or the one that is ready (FUND.chains). */
const chainWords = () => {
  const names = fundNetworks().map((n) => (n.key === 'ethereum' ? 'Ethereum mainnet' : n.name));
  // Ethereum first, as the owner's line of 2026-10-31 had it.
  names.sort((a, b) => (a.startsWith('Ethereum') ? -1 : b.startsWith('Ethereum') ? 1 : 0));
  return names.join(' or ');
};

/**
 * "Fund this project" (owner, 2026-11-04; "Support this site", 2026-10-30): the simplified page in the owner's own
 * words (title, line, the warning, and the four controls). The rest (the states of sending) is the coding agent's,
 * kept as short as the owner asked. The line names only the chains where the account is set up (FUND.chains).
 */
export const SUPPORT_WORDING = {
  // The owner's words of 2026-11-04: menu label "Fund", page title "Fund this project".
  title: 'Fund this project',
  /** The footer and About link: the page's title (owner, 2026-11-04, reread pack 8.3: "Fund this project"). */
  link: 'Fund this project',
  /** The menu item, in the menu's first section under "Remix the cast" (owner, 2026-11-04). */
  menu: 'Fund',
  line: `We make snowmoon.party. Send ETH or USDC on ${chainWords()} to this address, or send below.`,
  warning: 'Other networks: funds may be lost.',
  qrAlt: (address: string) => `QR code of the address ${address}`,
  copy: 'Copy',
  copied: 'Copied',
  network: 'Network',
  token: 'Token',
  amount: 'Amount',
  /** Shown greyed in the empty amount box while ETH is chosen (owner, 2026-10-31); not a value, so no estimate. */
  ethPlaceholder: '0.01',
  send: 'Send',
  connect: 'Connect wallet',
  switchTo: (network: string) => `Switch to ${network}`,
  notEnough: (token: string, network: string) => `Not enough ${token} on ${network}`,
  noGas: 'Not enough ETH for gas',
  checking: 'Checking your balance…',
  confirm: 'Confirm in your wallet…',
  waiting: 'Sent. Waiting for it to land…',
  thanks: 'Thank you.',
  tx: 'Transaction',
  declined: 'Nothing was sent.',
  failed: 'The transaction failed.',
  noWallet: 'No wallet in this browser.',
  terms: 'Terms',
  /** Under the amount when ETH is chosen (owner, 2026-10-31): an estimate, from Chainlink's ETH/USD read on Base. */
  estimate: (usd: string) => `≈ $${usd} (estimate, from Chainlink's ETH/USD)`,
} as const;
