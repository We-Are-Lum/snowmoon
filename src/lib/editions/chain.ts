import 'server-only';
import { createPublicClient, decodeEventLog, defineChain, http, isAddressEqual, type Hash, type PublicClient } from 'viem';
import { EDITIONS_ABI, SELLER_ABI } from './abi';
import { EDITIONS_TEST as T, editionsDeployed } from './config';

/**
 * Sepolia, read by our server only (EDITIONS_TEST.rpcUrl, or EDITIONS_RPC_URL for a local fork). Nothing about the
 * reader is sent: the pages ask our own API, never the RPC. No key, no wallet of ours, no transactions.
 */
export const sepolia = defineChain({
  id: T.chainId,
  name: T.chainName,
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [T.walletRpcUrl] } },
  blockExplorers: { default: { name: 'Etherscan', url: T.explorer } },
  contracts: { multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11' } },
});

let client: PublicClient | null = null;
function reader(): PublicClient {
  return (client ??= createPublicClient({ chain: sepolia, transport: http(T.rpcUrl, { timeout: 10_000 }) }) as PublicClient);
}

const E = () => ({ address: T.editions!, abi: EDITIONS_ABI });
const S = () => ({ address: T.seller!, abi: SELLER_ABI });

/** One edition as the pages need it. Wei amounts as decimal strings, so they cross to the browser unchanged. */
export type EditionView = {
  id: number;
  size: number;
  sold: number;
  startTime: number;
  createdAt: number;
  payout: `0x${string}`;
  uri: string;
  /** Pieces 1..size, wei as strings. */
  prices: string[];
  /** Sold by this seller (an edition sold by another seller isn't shown by these test pages). */
  ours: boolean;
};

export type EditionLive = { id: number; sold: number; size: number; lastMintAt: number | null; now: number };

/** Prices never change after creation, so each ladder is read once per server process (one pricesOf call). */
const LADDERS = new Map<number, string[]>();

type Summary = { id: bigint; maxSupply: bigint; sold: bigint; remaining: bigint; startPrice: bigint; topPrice: bigint; nextPrice: bigint; startTime: bigint; lastMintAt: bigint; open: boolean; payout: `0x${string}`; held: bigint; uri: string };

async function summaryOf(id: number): Promise<Summary | null> {
  return (await reader()
    .readContract({ ...S(), functionName: 'summary', args: [BigInt(id)] })
    .catch(() => null)) as Summary | null;
}

async function ladderPrices(id: number, size: number): Promise<string[]> {
  const known = LADDERS.get(id);
  if (known) return known;
  const p = (await reader().readContract({ ...S(), functionName: 'pricesOf', args: [BigInt(id), 1n, BigInt(size)] })) as readonly bigint[];
  const prices = p.map((x) => x.toString());
  LADDERS.set(id, prices);
  return prices;
}

/** Every edition, oldest first, with its ladder. Empty when the contracts aren't deployed or can't be read. */
export async function readEditions(): Promise<EditionView[]> {
  if (!editionsDeployed()) return [];
  const count = Number(await reader().readContract({ ...E(), functionName: 'editionCount' }));
  const out: EditionView[] = [];
  for (let id = 1; id <= count; id++) {
    const v = await readEdition(id);
    if (v) out.push(v);
  }
  return out;
}

/** One edition: the seller's summary (one call) and its ladder (one call, then cached). An edition this seller
 *  doesn't sell has no summary and isn't shown. */
export async function readEdition(id: number): Promise<EditionView | null> {
  if (!editionsDeployed() || !Number.isInteger(id) || id < 1) return null;
  const s = await summaryOf(id);
  if (!s) return null;
  const size = Number(s.maxSupply);
  const createdAt = Number(await reader().readContract({ ...E(), functionName: 'createdAt', args: [BigInt(id)] }));
  return { id, size, sold: Number(s.sold), startTime: Number(s.startTime), createdAt, payout: s.payout, uri: s.uri, prices: await ladderPrices(id, size), ours: true };
}

/** How many are sold and when this edition was last minted (the busy rule), from the seller's summary. `now` is the
 *  latest block's time, so a fork's clock and the busy window agree. */
export async function readLive(id: number): Promise<EditionLive | null> {
  if (!editionsDeployed()) return null;
  const [s, latest] = await Promise.all([summaryOf(id), reader().getBlock()]);
  if (!s) return null;
  const last = Number(s.lastMintAt);
  return { id, sold: Number(s.sold), size: Number(s.maxSupply), lastMintAt: last > 0 ? last : null, now: Math.max(Number(latest.timestamp), Math.floor(Date.now() / 1000)) };
}

export type MintView =
  | { status: 'pending' }
  | { status: 'not-found' }
  | { status: 'failed'; id: number | null }
  | { status: 'ok'; id: number; buyer: `0x${string}`; to: `0x${string}`; firstPiece: number; quantity: number; cost: string; sent: string };

/** What a mint transaction did: the Minted event from our seller, and the value the buyer sent. */
export async function readMint(hash: Hash): Promise<MintView> {
  if (!editionsDeployed()) return { status: 'not-found' };
  const r = reader();
  const tx = await r.getTransaction({ hash }).catch(() => null);
  if (!tx) return { status: 'not-found' };
  if (!tx.to || !isAddressEqual(tx.to, T.seller!)) return { status: 'not-found' };
  const receipt = await r.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt) return { status: 'pending' };
  if (receipt.status !== 'success') return { status: 'failed', id: null };
  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, T.seller!)) continue;
    try {
      const ev = decodeEventLog({ abi: SELLER_ABI, data: log.data, topics: log.topics });
      if (ev.eventName !== 'Minted') continue;
      const a = ev.args;
      return { status: 'ok', id: Number(a.id), buyer: a.buyer, to: a.to, firstPiece: Number(a.firstPiece), quantity: Number(a.quantity), cost: a.cost.toString(), sent: tx.value.toString() };
    } catch {
      // another event of the seller's
    }
  }
  return { status: 'not-found' };
}
