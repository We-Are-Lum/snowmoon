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
  /** The ladder belongs to this seller (an edition sold by another seller isn't shown by these test pages). */
  ours: boolean;
};

export type EditionLive = { id: number; sold: number; size: number; lastMintAt: number | null; now: number };

/** Prices never change after creation, so each ladder is read once per server process. */
const LADDERS = new Map<number, string[]>();

async function ladderPrices(id: number, size: number): Promise<string[]> {
  const known = LADDERS.get(id);
  if (known) return known;
  const results = await reader().multicall({
    allowFailure: false,
    contracts: Array.from({ length: size }, (_, i) => ({ ...S(), functionName: 'priceOf' as const, args: [BigInt(id), BigInt(i + 1)] as const })),
  });
  const prices = (results as bigint[]).map((p) => p.toString());
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

export async function readEdition(id: number): Promise<EditionView | null> {
  if (!editionsDeployed() || !Number.isInteger(id) || id < 1) return null;
  const big = BigInt(id);
  const count = Number(await reader().readContract({ ...E(), functionName: 'editionCount' }));
  if (id > count) return null;
  const [uri, payout, size, minted, createdAt, l] = await reader().multicall({
    allowFailure: false,
    contracts: [
      { ...E(), functionName: 'uri', args: [big] },
      { ...E(), functionName: 'payoutOf', args: [big] },
      { ...E(), functionName: 'maxSupplyOf', args: [big] },
      { ...E(), functionName: 'totalMinted', args: [big] },
      { ...E(), functionName: 'createdAt', args: [big] },
      { ...S(), functionName: 'ladder', args: [big] },
    ],
  });
  const ladder = l as { startTime: bigint; configured: boolean };
  const ours = ladder.configured;
  return {
    id,
    size: Number(size),
    sold: Number(minted),
    startTime: Number(ladder.startTime),
    createdAt: Number(createdAt),
    payout: payout as `0x${string}`,
    uri: uri as string,
    prices: ours ? await ladderPrices(id, Number(size)) : [],
    ours,
  };
}

/**
 * How many are sold, and when this edition's last mint landed (for the busy rule), from its Minted events in the last
 * EDITIONS_TEST.recentBlocks blocks. `now` is the latest block's time, so a fork's clock and the busy window agree.
 */
export async function readLive(id: number): Promise<EditionLive | null> {
  if (!editionsDeployed()) return null;
  const r = reader();
  const latest = await r.getBlock();
  const [sold, size] = await r.multicall({
    allowFailure: false,
    contracts: [
      { ...E(), functionName: 'totalMinted', args: [BigInt(id)] },
      { ...E(), functionName: 'maxSupplyOf', args: [BigInt(id)] },
    ],
  });
  const from = latest.number > BigInt(T.recentBlocks) ? latest.number - BigInt(T.recentBlocks) : 0n;
  const logs = await r.getContractEvents({ ...S(), eventName: 'Minted', args: { id: BigInt(id) }, fromBlock: from, toBlock: latest.number }).catch(() => []);
  const last = logs.at(-1);
  const lastMintAt = last?.blockNumber != null ? Number((await r.getBlock({ blockNumber: last.blockNumber })).timestamp) : null;
  const now = Math.max(Number(latest.timestamp), Math.floor(Date.now() / 1000));
  return { id, sold: Number(sold), size: Number(size), lastMintAt, now };
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
