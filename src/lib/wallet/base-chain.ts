import { defineChain } from 'viem';

/** Base mainnet, defined here so neither the server nor the browser bundles every chain viem knows. */
export const base = defineChain({
  id: 8453,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
  blockExplorers: { default: { name: 'Basescan', url: 'https://basescan.org' } },
  contracts: { multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11', blockCreated: 5022 } },
});

/**
 * Ethereum mainnet, for "Support this site" (owner, 2026-10-30), defined the same way. Every call goes through the
 * wallet in this browser (custom transport); the RPC address is never used by us.
 */
export const ethereum = defineChain({
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://cloudflare-eth.com'] } },
  blockExplorers: { default: { name: 'Etherscan', url: 'https://etherscan.io' } },
});
