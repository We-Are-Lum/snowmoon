'use client';

import { sdk } from '@farcaster/miniapp-sdk';

/**
 * The maker's own wallet, for createClaim on Base (branch challenge-backstory-bounty; ported from warplore's
 * components/comic/wallet.ts). Two kinds only: the Farcaster app's wallet (sdk.wallet.getEthereumProvider) and, for a
 * wallet sign-in, the wallet in this browser (window.ethereum). Every request is the person's own: their wallet shows
 * its own confirmation, and pays the network fee. Nothing is signed or paid for them.
 */
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
export type WalletKind = 'miniapp' | 'injected';
export type Wallet = { provider: Eip1193; address: string };

const BASE_HEX = '0x2105';
/** createClaim measured ~508k–949k gas on warplore's bounties (2026-10-21/22); doubled below. */
const CLAIM_GAS = 1_000_000n;

async function providerOf(kind: WalletKind): Promise<Eip1193 | null> {
  try {
    if (kind === 'miniapp') return ((await sdk.wallet.getEthereumProvider()) as Eip1193 | undefined) ?? null;
    return typeof window !== 'undefined' ? ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null) : null;
  } catch {
    return null;
  }
}

export const rejected = (e: unknown) => (e as { code?: number })?.code === 4001 || /reject|denied|cancel/i.test(String((e as { message?: string })?.message ?? ''));

export async function connect(kind: WalletKind): Promise<Wallet | { error: 'no-wallet' | 'cancelled' }> {
  const provider = await providerOf(kind);
  if (!provider) return { error: 'no-wallet' };
  try {
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    const address = accounts?.[0]?.toLowerCase();
    if (!address) return { error: 'no-wallet' };
    const chain = String(await provider.request({ method: 'eth_chainId' }).catch(() => '')).toLowerCase();
    if (chain !== BASE_HEX) {
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_HEX }] });
      } catch (e) {
        if ((e as { code?: number })?.code !== 4902) throw e;
        await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: BASE_HEX, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] });
      }
    }
    return { provider, address };
  } catch (e) {
    return { error: rejected(e) ? 'cancelled' : 'no-wallet' };
  }
}

/** Enough Base ETH for createClaim? Fails open (true) when the wallet can't say: the wallet itself will then. */
export async function hasGasForClaim(w: Wallet): Promise<boolean> {
  try {
    const [bal, price] = await Promise.all([
      w.provider.request({ method: 'eth_getBalance', params: [w.address, 'latest'] }),
      w.provider.request({ method: 'eth_gasPrice' }).catch(() => '0x2540be400'),
    ]);
    const need = CLAIM_GAS * BigInt(String(price)) * 2n + 2_000_000_000_000n;
    return BigInt(String(bal)) >= need;
  } catch {
    return true;
  }
}

export async function sendClaim(w: Wallet, to: string, data: string): Promise<{ ok: true; hash: string } | { ok: false; cancelled: boolean; error: string }> {
  try {
    const hash = String(await w.provider.request({ method: 'eth_sendTransaction', params: [{ from: w.address, to, data, chainId: BASE_HEX }] }));
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return { ok: false, cancelled: false, error: 'The wallet didn’t return a transaction.' };
    return { ok: true, hash };
  } catch (e) {
    return { ok: false, cancelled: rejected(e), error: String((e as { message?: string })?.message ?? e).slice(0, 120) };
  }
}
