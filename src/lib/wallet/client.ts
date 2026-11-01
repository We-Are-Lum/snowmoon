'use client';

import { createPublicClient, createWalletClient, custom, parseAbi, parseUnits, type EIP1193Provider } from 'viem';
import { base, ethereum } from './base-chain';
import { createSiweMessage } from 'viem/siwe';
import { authFetch, saveWalletSession } from '../client-auth';
import { IMAGES, SUPPORT, type SupportNetwork } from '../config';
import { IMAGE_WORDING } from '../images/wording';
import { forgetsPending } from './pending';

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
  /** final: this payment can never be added (already added, failed onchain, too old; forgetsPending), so stop offering to retry. */
  constructor(public why: 'no-wallet' | 'declined' | 'server' | 'pay-failed' | 'wrong-network', message?: string, public final = false) {
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

const USDC = parseAbi(['function transfer(address to, uint256 value) returns (bool)', 'function balanceOf(address owner) view returns (uint256)']);
const FEED = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)']);

/**
 * Send `usd` in USDC or ETH on Base to `to`, from this browser's wallet, and wait for it to land (3 confirmations).
 * Used by prepaid images (pay). Returns the transaction's hash.
 */
async function sendOnBase(opts: { usd: number; token: 'USDC' | 'ETH'; to: `0x${string}`; usdc?: `0x${string}`; onSent?: (hash: `0x${string}`) => void; onWaiting?: () => void }): Promise<`0x${string}`> {
  const { p, wallet, account } = await connect();
  await wallet.switchChain({ id: base.id }).catch(() => wallet.addChain({ chain: base }));
  const reader = createPublicClient({ chain: base, transport: custom(p) });
  let hash: `0x${string}`;
  try {
    if (opts.token === 'USDC') {
      hash = await wallet.writeContract({ account, address: opts.usdc ?? IMAGES.prepaid.usdc, abi: USDC, functionName: 'transfer', args: [opts.to, parseUnits(opts.usd.toFixed(6), 6)] });
    } else {
      const [, answer] = await reader.readContract({ address: IMAGES.prepaid.ethUsdFeed, abi: FEED, functionName: 'latestRoundData' });
      // usd / (price / 1e8) ETH, in wei.
      const value = (BigInt(Math.round(opts.usd * 1e6)) * 10n ** 20n) / answer;
      hash = await wallet.sendTransaction({ account, to: opts.to, value });
    }
  } catch {
    throw new WalletError('declined');
  }
  opts.onSent?.(hash);
  opts.onWaiting?.();
  const receipt = await reader.waitForTransactionReceipt({ hash, confirmations: 3 }).catch(() => null);
  if (receipt && receipt.status !== 'success') throw new WalletError('pay-failed');
  return hash;
}

/**
 * Pay `usd` in USDC or ETH on Base to the project's address, wait for it to land, then ask our
 * server to add it (it reads the payment on Base and credits it once). Retries while it confirms.
 */
export async function pay(opts: { usd: number; token: 'USDC' | 'ETH'; payTo: `0x${string}`; usdc: `0x${string}`; onSent?: (hash: `0x${string}`) => void; onWaiting?: () => void }): Promise<{ added: number; balanceUsd: number }> {
  return claim(await sendOnBase({ usd: opts.usd, token: opts.token, to: opts.payTo, usdc: opts.usdc, onSent: opts.onSent, onWaiting: opts.onWaiting }));
}

/**
 * "Support this site" (owner, 2026-10-30, simplified page): a gift of `amount` ETH or USDC on Base or Ethereum to the
 * support address (SUPPORT.address, the only place it lives). Every read and the send go through the wallet in this
 * browser; nothing is sent to our server and nothing about the sender is recorded.
 */
export type Gift = { network: SupportNetwork; token: 'ETH' | 'USDC'; amount: string };
const chainOf = (chainId: number) => (chainId === ethereum.id ? ethereum : base);
/** The amount in the token's smallest units (USDC has 6 decimals, ETH 18); null if it isn't a positive amount. */
export function giftUnits(g: Pick<Gift, 'token' | 'amount'>): bigint | null {
  if (!/^\d*\.?\d+$/.test(g.amount.trim())) return null;
  try {
    const v = parseUnits(g.amount.trim(), g.token === 'USDC' ? 6 : 18);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** The wallet's account and network right now, without asking it anything (no prompt). */
export async function walletState(): Promise<{ account: `0x${string}` | null; chainId: number | null }> {
  const p = provider();
  if (!p) return { account: null, chainId: null };
  const [accounts, chain] = await Promise.all([p.request({ method: 'eth_accounts' }).catch(() => []), p.request({ method: 'eth_chainId' }).catch(() => null)]);
  return { account: ((accounts as `0x${string}`[])[0] ?? null), chainId: chain ? Number(chain) : null };
}
/** Call `fn` when the wallet changes account or network. Returns the unsubscribe. */
export function onWalletChange(fn: () => void): () => void {
  const p = provider() as (EIP1193Provider & { removeListener?: EIP1193Provider['removeListener'] }) | null;
  if (!p?.on) return () => {};
  p.on('accountsChanged', fn);
  p.on('chainChanged', fn);
  return () => {
    p.removeListener?.('accountsChanged', fn);
    p.removeListener?.('chainChanged', fn);
  };
}
/** Ask the wallet for its account (its own prompt). */
export async function connectWallet(): Promise<void> {
  await connect();
}
/** Ask the wallet to switch to this network (adding it first if it doesn't know it). */
export async function switchWallet(chainId: number): Promise<void> {
  const { wallet } = await connect();
  const chain = chainOf(chainId);
  await wallet.switchChain({ id: chain.id }).catch(() => wallet.addChain({ chain }));
}

/**
 * Whether this wallet can send the gift, read from the wallet on the gift's network: for ETH, the amount plus the
 * estimated fee must fit its ETH balance; for USDC, its USDC balance must cover the amount and its ETH the fee. The fee
 * is the estimated gas (plus a fifth) at the network's current maximum fee per gas.
 */
export async function giftFits(g: Gift, account: `0x${string}`): Promise<'ok' | 'not-enough' | 'no-gas'> {
  const p = provider();
  const value = giftUnits(g);
  if (!p || value === null) throw new WalletError('no-wallet');
  const reader = createPublicClient({ chain: chainOf(g.network.chainId), transport: custom(p) });
  const [eth, perGas] = await Promise.all([
    reader.getBalance({ address: account }),
    reader.estimateFeesPerGas().then((f) => f.maxFeePerGas ?? reader.getGasPrice(), () => reader.getGasPrice()),
  ]);
  const fee = (gas: bigint) => ((gas * 12n) / 10n) * perGas;
  if (g.token === 'USDC') {
    const usdc = await reader.readContract({ address: g.network.usdc, abi: USDC, functionName: 'balanceOf', args: [account] });
    if (usdc < value) return 'not-enough';
    const gas = await reader.estimateContractGas({ account, address: g.network.usdc, abi: USDC, functionName: 'transfer', args: [SUPPORT.address, value] });
    return eth >= fee(gas) ? 'ok' : 'no-gas';
  }
  if (eth < value) return 'not-enough';
  const gas = await reader.estimateGas({ account, to: SUPPORT.address, value });
  return eth >= value + fee(gas) ? 'ok' : 'not-enough';
}

/** Send the gift from this browser's wallet, which must already be on the gift's network. Returns once it has landed. */
export async function give(g: Gift & { onSent?: (hash: `0x${string}`) => void }): Promise<`0x${string}`> {
  const { p, wallet, account } = await connect();
  const chain = chainOf(g.network.chainId);
  const value = giftUnits(g);
  if (value === null) throw new WalletError('declined');
  if (Number(await p.request({ method: 'eth_chainId' })) !== chain.id) throw new WalletError('wrong-network');
  const reader = createPublicClient({ chain, transport: custom(p) });
  let hash: `0x${string}`;
  try {
    hash =
      g.token === 'USDC'
        ? await wallet.writeContract({ account, chain, address: g.network.usdc, abi: USDC, functionName: 'transfer', args: [SUPPORT.address, value] })
        : await wallet.sendTransaction({ account, chain, to: SUPPORT.address, value });
  } catch {
    throw new WalletError('declined');
  }
  g.onSent?.(hash);
  const receipt = await reader.waitForTransactionReceipt({ hash }).catch(() => null);
  if (receipt && receipt.status !== 'success') throw new WalletError('pay-failed');
  return hash;
}

/** Ask our server to add a payment already made from this wallet (retries while it confirms). */
export async function claim(hash: `0x${string}`, tries = 20): Promise<{ added: number; balanceUsd: number }> {
  for (let i = 0; i < tries; i++) {
    const res = await authFetch('/api/wallet/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: hash }) }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { added?: number; balanceUsd?: number; error?: string; retry?: boolean; reason?: string };
    if (res?.ok && out.added !== undefined) return { added: out.added, balanceUsd: out.balanceUsd ?? 0 };
    if (!out.retry) throw new WalletError('server', out.error, forgetsPending(out.reason));
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new WalletError('server', IMAGE_WORDING.prepaid.claimLater);
}
