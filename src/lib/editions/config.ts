/**
 * Snowmoon Editions on Sepolia: the test mint pages (handoff "Snowmoon Editions: mint pages on Sepolia", 18 Nov 2026).
 * DRAFT, written by an AI agent (Claude, made by Anthropic). The one place for the chain and the contracts' addresses.
 *
 * Sepolia only. There is no mainnet configuration here, on purpose: the same pages serve mainnet later, from a
 * separate entry added in its own release. The addresses stay null until Nate deploys (contracts/snowmoon-editions/
 * DEPLOY.md), and the pages say so. For a run against a local fork of Sepolia, set the NEXT_PUBLIC_EDITIONS_* variables
 * (a fork keeps Sepolia's chain id, 11155111) and EDITIONS_RPC_URL for the server.
 */

export const SEPOLIA_CHAIN_ID = 11155111;

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const addr = (v: string | undefined) => {
  const a = env(v);
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : null;
};

export const EDITIONS_TEST = {
  /** Sepolia. A local fork of Sepolia has the same id. */
  chainId: SEPOLIA_CHAIN_ID,
  chainName: 'Sepolia',
  /** SnowmoonEditions and LadderSeller on Sepolia. Null until deployed (fill in from Deploy.s.sol's output). */
  editions: addr(process.env.NEXT_PUBLIC_EDITIONS_COLLECTION) ?? (null as `0x${string}` | null),
  seller: addr(process.env.NEXT_PUBLIC_EDITIONS_SELLER) ?? (null as `0x${string}` | null),
  /** Where the server reads Sepolia (no key). The browser never asks it anything: it reads through our API, or through
   *  the person's own wallet once connected (P6a: pages make no third-party requests). */
  rpcUrl: env(process.env.EDITIONS_RPC_URL) ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  /** Given to a wallet that doesn't know Sepolia yet, when it adds the network; this page never calls it. */
  walletRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  explorer: 'https://sepolia.etherscan.io',
  /** Where the split lives, for the "Where the money goes" link. */
  splitsUrl: (split: string) => `https://app.splits.org/accounts/${split}/?chainId=${SEPOLIA_CHAIN_ID}`,
  /** Test ETH (owner to confirm the faucet; this one needs no sign-in at the time of writing). */
  faucetUrl: 'https://sepolia-faucet.pk910.de',
  /** Busy: a mint on this edition within this many seconds (open question 4: 3 minutes). */
  busyWindowSeconds: 180,
  /** Busy: the page sends enough for the same number of pieces this many places further up the ladder. */
  cushionPieces: 3,
  /** How far back the server looks for recent mints, in blocks (Sepolia makes one every 12 s: 30 blocks = 6 minutes). */
  recentBlocks: 30,
  /** The next edition's opening when it isn't on the contract yet (ISO time). Null: no countdown. */
  nextOpening: env(process.env.NEXT_PUBLIC_EDITIONS_NEXT_OPENING),
  /** The feedback form (Nate supplies the link). Null: the after-mint screen says it's coming. */
  feedbackUrl: env(process.env.NEXT_PUBLIC_EDITIONS_FEEDBACK_URL),
  /** The collection, as the contract names it. */
  collectionName: 'Snowmoon Editions',
} as const;

export const editionsDeployed = () => EDITIONS_TEST.editions !== null && EDITIONS_TEST.seller !== null;
