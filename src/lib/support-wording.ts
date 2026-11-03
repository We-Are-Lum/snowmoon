/**
 * "Support this site" (owner, 2026-10-30): the simplified page in the owner's own words (title, line, the warning, and
 * the four controls). The rest (the states of sending) is the coding agent's, kept as short as the owner asked.
 */
export const SUPPORT_WORDING = {
  // The owner's words of 2026-10-31: the support goes to the team that makes the site.
  title: 'Support the We Are Lum team',
  link: 'Support the We Are Lum team',
  line: 'We make snowmoon.party. Send ETH or USDC on Ethereum mainnet or Base to this address, or send below.',
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
