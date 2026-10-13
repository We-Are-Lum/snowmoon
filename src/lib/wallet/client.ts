'use client';

import { createPublicClient, createWalletClient, custom, parseAbi, parseUnits, type EIP1193Provider } from 'viem';
import { base } from './base-chain';
import { createSiweMessage } from 'viem/siwe';
import { authFetch, saveWalletSession } from '../client-auth';
import { IMAGES } from '../config';

/**
 * The wallet in this browser (owner, 2026-10-13): an injected EIP-1193 provider (a wallet extension,
 * or a wallet app's own browser). Used to sign in (Sign-In with Ethereum) and to pay on Base. Our
 * server never sees a key; it checks the signature and reads the payment on Base itself.
 */
function provider(): EIP1193Provider | null {
  return typeof window !== 'undefined' ? ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null) : null;
}
export const hasWallet = () => provider() !== null;

async function connect() {
  const p = provider();
  if (!p) throw new WalletError('no-wallet');
  const wallet = createWalletClient({ chain: base, transport: custom(p) });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new WalletError('no-wallet');
  return { p, wallet, account };
}

export class WalletError extends Error {
  /** final: this payment can't be added (already added, not to us, not from this wallet…), so stop offering to retry. */
  constructor(public why: 'no-wallet' | 'declined' | 'server' | 'pay-failed', message?: string, public final = false) {
    super(message ?? why);
  }
}

/** Sign in: our nonce, a message for this domain on Base, the wallet's signature, our session token. */
export async function signInWithWallet(): Promise<string> {
  const { wallet, account } = await connect();
  const n = await fetch('/api/wallet/nonce').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { nonce: string; domain: string; uri: string; chainId: number; statement: string } | null;
  if (!n) throw new WalletError('server');
  const message = createSiweMessage({ address: account, chainId: n.chainId, domain: n.domain, nonce: n.nonce, uri: n.uri, version: '1', statement: n.statement, issuedAt: new Date() });
  let signature: `0x${string}`;
  try {
    signature = await wallet.signMessage({ account, message });
  } catch {
    throw new WalletError('declined');
  }
  const res = await fetch('/api/wallet/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }) }).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { token?: string; address?: string; error?: string };
  if (!res?.ok || !out.token || !out.address) throw new WalletError('server', out.error);
  saveWalletSession(out.token, out.address);
  return out.address;
}

const USDC = parseAbi(['function transfer(address to, uint256 value) returns (bool)']);
const FEED = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)']);

/**
 * Pay `usd` in USDC or ETH on Base to the project's address, wait for it to land, then ask our
 * server to add it (it reads the payment on Base and credits it once). Retries while it confirms.
 */
export async function pay(opts: { usd: number; token: 'USDC' | 'ETH'; payTo: `0x${string}`; usdc: `0x${string}`; onSent?: (hash: `0x${string}`) => void; onWaiting?: () => void }): Promise<{ added: number; balanceUsd: number }> {
  const { p, wallet, account } = await connect();
  await wallet.switchChain({ id: base.id }).catch(() => wallet.addChain({ chain: base }));
  const reader = createPublicClient({ chain: base, transport: custom(p) });
  let hash: `0x${string}`;
  try {
    if (opts.token === 'USDC') {
      hash = await wallet.writeContract({ account, address: opts.usdc, abi: USDC, functionName: 'transfer', args: [opts.payTo, parseUnits(opts.usd.toFixed(6), 6)] });
    } else {
      const [, answer] = await reader.readContract({ address: IMAGES.prepaid.ethUsdFeed, abi: FEED, functionName: 'latestRoundData' });
      // usd / (price / 1e8) ETH, in wei.
      const value = (BigInt(Math.round(opts.usd * 1e6)) * 10n ** 20n) / answer;
      hash = await wallet.sendTransaction({ account, to: opts.payTo, value });
    }
  } catch {
    throw new WalletError('declined');
  }
  opts.onSent?.(hash);
  opts.onWaiting?.();
  const receipt = await reader.waitForTransactionReceipt({ hash, confirmations: 3 }).catch(() => null);
  if (receipt && receipt.status !== 'success') throw new WalletError('pay-failed');
  return claim(hash);
}

/** Ask our server to add a payment already made from this wallet (retries while it confirms). */
export async function claim(hash: `0x${string}`): Promise<{ added: number; balanceUsd: number }> {
  for (let i = 0; i < 20; i++) {
    const res = await authFetch('/api/wallet/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: hash }) }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { added?: number; balanceUsd?: number; error?: string; retry?: boolean };
    if (res?.ok && out.added !== undefined) return { added: out.added, balanceUsd: out.balanceUsd ?? 0 };
    if (!out.retry) throw new WalletError('server', out.error, res !== null && res.status !== 503 && res.status !== 401);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new WalletError('server', 'The payment was sent but isn’t added yet. Try again in a minute.');
}
