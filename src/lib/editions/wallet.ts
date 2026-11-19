'use client';

import sdk from '@farcaster/miniapp-sdk';
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, encodeFunctionData, parseAbi, type EIP1193Provider, type Hash, type PublicClient } from 'viem';
import { SELLER_ABI } from './abi';
import { EDITIONS_TEST as T } from './config';
import { problemOf, type MintProblem } from './ladder';

/**
 * The buyer's wallet for the Snowmoon Editions test pages. Inside the Farcaster miniapp: the Farcaster wallet
 * (sdk.wallet.getEthereumProvider). Anywhere else: the wallet this browser injects (an extension, or a phone wallet's
 * own browser). Every read here goes through that wallet (so the page itself asks no outside service, P6a), and the
 * mint is signed in the wallet. No key is ever seen here.
 */
let cached: Promise<EIP1193Provider | null> | null = null;
export function walletProvider(): Promise<EIP1193Provider | null> {
  return (cached ??= (async () => {
    if (typeof window === 'undefined') return null;
    const inApp = await sdk.isInMiniApp().catch(() => false);
    if (inApp) {
      const p = await sdk.wallet.getEthereumProvider().catch(() => undefined);
      if (p) return p as unknown as EIP1193Provider;
    }
    return ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null);
  })());
}

/** Tests only (the fork run's stand-in wallet sets window.ethereum before the page loads; this forgets a cached one). */
export const forgetWallet = () => (cached = null);

const chain = {
  id: T.chainId,
  name: T.chainName,
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [T.walletRpcUrl] } },
  blockExplorers: { default: { name: 'Etherscan', url: T.explorer } },
} as const;

export type WalletNow = { found: boolean; account: `0x${string}` | null; chainId: number | null; balance: bigint | null };

/** The wallet's account, network and (on Sepolia) balance, without prompting. */
export async function walletNow(): Promise<WalletNow> {
  const p = await walletProvider();
  if (!p) return { found: false, account: null, chainId: null, balance: null };
  const [accounts, id] = await Promise.all([p.request({ method: 'eth_accounts' }).catch(() => []), p.request({ method: 'eth_chainId' }).catch(() => null)]);
  const account = ((accounts as `0x${string}`[])[0] ?? null) as `0x${string}` | null;
  const chainId = id ? Number(id) : null;
  let balance: bigint | null = null;
  if (account && chainId === T.chainId) {
    balance = await createPublicClient({ chain, transport: custom(p) }).getBalance({ address: account }).catch(() => null);
  }
  return { found: true, account, chainId, balance };
}

export async function onWalletChange(fn: () => void): Promise<() => void> {
  const p = (await walletProvider()) as (EIP1193Provider & { removeListener?: EIP1193Provider['removeListener'] }) | null;
  if (!p?.on) return () => {};
  p.on('accountsChanged', fn);
  p.on('chainChanged', fn);
  return () => {
    p.removeListener?.('accountsChanged', fn);
    p.removeListener?.('chainChanged', fn);
  };
}

export async function connect(): Promise<void> {
  const p = await walletProvider();
  if (!p) return;
  await createWalletClient({ chain, transport: custom(p) }).requestAddresses();
}

/** One tap to Sepolia: switch, or add it first if the wallet doesn't know it. */
export async function switchToSepolia(): Promise<void> {
  const p = await walletProvider();
  if (!p) return;
  const w = createWalletClient({ chain, transport: custom(p) });
  await w.switchChain({ id: chain.id }).catch(() => w.addChain({ chain }));
}

/** The fresh price, read through the wallet right before sending. */
export async function freshQuote(id: number, quantity: number): Promise<bigint> {
  const p = await walletProvider();
  if (!p) throw new Error('no wallet');
  return createPublicClient({ chain, transport: custom(p) }).readContract({ address: T.seller!, abi: SELLER_ABI, functionName: 'quote', args: [BigInt(id), BigInt(quantity)] });
}

export class MintError extends Error {
  constructor(public problem: MintProblem, public hash?: Hash) {
    super(problem);
  }
}

/** A thrown wallet or contract error as one of the page's states. */
export function problemFrom(e: unknown): MintProblem {
  if (e instanceof MintError) return e.problem;
  const base = e instanceof BaseError ? e : null;
  const reverted = base?.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | undefined;
  const name = reverted?.data?.errorName ?? null;
  const text = `${(e as { shortMessage?: string })?.shortMessage ?? ''} ${(e as Error)?.message ?? ''}`;
  const code = (e as { code?: number })?.code ?? (base?.walk((x) => typeof (x as { code?: number }).code === 'number') as { code?: number } | undefined)?.code;
  return problemOf(name ?? (/Underpaid/.test(text) ? 'Underpaid' : /ERC1155InvalidReceiver/.test(text) ? 'ERC1155InvalidReceiver' : null), {
    userRejected: code === 4001 || /user (rejected|denied)|rejected the request/i.test(text),
    insufficientFunds: /insufficient funds/i.test(text),
  });
}

const RECEIVER = parseAbi(['function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes data) returns (bytes4)']);
const ACCEPTED = '0xf23a6e61';

/**
 * Whether `account` can hold an ERC-1155 piece: an ordinary address can; an address with code (a smart wallet, or an
 * EIP-7702 delegated account) must answer onERC1155Received with its selector, asked here exactly as the collection
 * asks it. A contract whose fallback answers nothing makes the mint revert with no reason, so the page asks this to name
 * the problem.
 */
async function canReceive(reader: PublicClient, account: `0x${string}`, id: number): Promise<boolean> {
  const code = await reader.getCode({ address: account }).catch(() => undefined);
  if (!code || code === '0x') return true;
  const data = encodeFunctionData({ abi: RECEIVER, functionName: 'onERC1155Received', args: [T.seller!, '0x0000000000000000000000000000000000000000', BigInt(id), 1n, '0x'] });
  const out = await reader.call({ account: T.editions!, to: account, data }).catch(() => null);
  return !!out?.data && out.data.slice(0, 10).toLowerCase() === ACCEPTED;
}

/**
 * Mint: simulate first (a wallet that can't hold the piece, a price that moved, or a sold-out edition is named before
 * anything is signed), then send exactly `value`, then wait for the receipt. Returns the transaction's hash.
 */
export async function mint(opts: { id: number; quantity: number; value: bigint; onSent?: (h: Hash) => void }): Promise<Hash> {
  const p = await walletProvider();
  if (!p) throw new MintError('failed');
  const wallet = createWalletClient({ chain, transport: custom(p) });
  const reader = createPublicClient({ chain, transport: custom(p) });
  const [account] = await wallet.getAddresses();
  if (!account) throw new MintError('failed');
  const args = [BigInt(opts.id), BigInt(opts.quantity), account] as const;
  const { request } = await reader.simulateContract({ account, address: T.seller!, abi: SELLER_ABI, functionName: 'mint', args, value: opts.value }).catch(async (e: unknown) => {
    // No reason given: check whether this wallet can hold the piece before calling it a failure.
    if (problemFrom(e) === 'failed' && !(await canReceive(reader as PublicClient, account, opts.id))) throw new MintError('cannot-receive');
    throw e;
  });
  const hash = await wallet.writeContract(request);
  opts.onSent?.(hash);
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    // Mined but reverted: most likely the price moved between the quote and the block (an exact-price mint lost a race).
    const replay = await reader
      .simulateContract({ account, address: T.seller!, abi: SELLER_ABI, functionName: 'mint', args, value: opts.value })
      .then(() => null, (e: unknown) => problemFrom(e));
    throw new MintError(replay && replay !== 'failed' ? replay : 'failed', hash);
  }
  return hash;
}
