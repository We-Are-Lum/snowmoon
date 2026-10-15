import 'server-only';
import { createPublicClient, decodeEventLog, http, isAddressEqual, parseAbi, recoverMessageAddress, type Hash, type PublicClient } from 'viem';
import { base } from './base-chain';
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { IMAGES } from '../config';
import { nonceOk } from './session';

/**
 * Base, read through IMAGES.prepaid.rpcUrl (Base's public endpoint) or BASE_RPC_URL. Only two
 * things are asked of it: whether a sign-in signature is the wallet's (smart wallets included,
 * EIP-1271 and EIP-6492), and what a payment's transaction did. No key, no wallet of ours.
 */
const P = IMAGES.prepaid;
let client: PublicClient | null = null;
export function chain(): PublicClient {
  return (client ??= createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || P.rpcUrl, { timeout: 10_000 }) }) as PublicClient);
}
/** Tests only (scripts/test-wallet.ts): read Base through a stub. */
export function useChainForTests(c: PublicClient) {
  client = c;
}

/** The address that signed this Sign-In with Ethereum message, if it is for us, current, and really signed. */
export async function verifySignIn(message: string, signature: `0x${string}`, domain: string, client: PublicClient = chain()): Promise<`0x${string}` | null> {
  let m;
  try {
    m = parseSiweMessage(message);
  } catch {
    return null;
  }
  if (!m.address || !m.nonce || m.chainId !== P.chainId || !nonceOk(m.nonce)) return null;
  if (!validateSiweMessage({ message: m, domain })) return null;
  // An ordinary wallet's signature is checked here; a smart wallet's (EIP-1271, EIP-6492) needs Base.
  const signer = await recoverMessageAddress({ message, signature }).catch(() => null);
  if (signer && isAddressEqual(signer, m.address)) return m.address.toLowerCase() as `0x${string}`;
  const ok = await client.verifySiweMessage({ message, signature, domain, nonce: m.nonce }).catch(() => false);
  return ok ? (m.address.toLowerCase() as `0x${string}`) : null;
}

const TRANSFER = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const FEED = parseAbi(['function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)']);

export type Payment =
  | { ok: true; token: 'USDC' | 'ETH'; amount: bigint; usd: number; blockNumber: bigint }
  | { ok: false; why: 'not-found' | 'pending' | 'failed' | 'old' | 'not-to-us' | 'not-from-you' | 'too-small' };

/**
 * What a transaction paid us, from `from` (the signed-in wallet). USDC: a Transfer log on the USDC
 * contract from `from` to payTo (works for smart wallets too). ETH: a plain transaction from `from`
 * to payTo with a value, priced at Chainlink's ETH/USD at that block.
 */
export async function readPayment(hash: Hash, from: string, client: PublicClient = chain()): Promise<Payment> {
  const payTo = P.payTo?.toLowerCase();
  if (!payTo) return { ok: false, why: 'not-to-us' };
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt) return { ok: false, why: 'not-found' };
  if (receipt.status !== 'success') return { ok: false, why: 'failed' };
  const head = await client.getBlockNumber();
  if (head - receipt.blockNumber + 1n < BigInt(P.confirmations)) return { ok: false, why: 'pending' };
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (Date.now() - Number(block.timestamp) * 1000 > P.maxAgeDays * 86400_000) return { ok: false, why: 'old' };

  const who = from.toLowerCase();
  let usdc = 0n, sawUs = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== P.usdc.toLowerCase()) continue;
    try {
      const e = decodeEventLog({ abi: TRANSFER, data: log.data, topics: log.topics });
      if (e.args.to.toLowerCase() !== payTo) continue;
      sawUs = true;
      if (e.args.from.toLowerCase() === who) usdc += e.args.value;
    } catch {
      /* not a Transfer */
    }
  }
  if (usdc > 0n) return paid('USDC', usdc, Number(usdc) / 1e6, receipt.blockNumber);
  if (sawUs) return { ok: false, why: 'not-from-you' };

  const tx = await client.getTransaction({ hash });
  if (tx.to?.toLowerCase() !== payTo || tx.value === 0n) return { ok: false, why: 'not-to-us' };
  if (tx.from.toLowerCase() !== who) return { ok: false, why: 'not-from-you' };
  const [, answer] = await client.readContract({ address: P.ethUsdFeed, abi: FEED, functionName: 'latestRoundData', blockNumber: receipt.blockNumber });
  // value (wei, 18 decimals) x price (8 decimals), to USD.
  const usd = Number((tx.value * answer) / 10n ** 20n) / 1e6;
  return paid('ETH', tx.value, usd, receipt.blockNumber);
}

function paid(token: 'USDC' | 'ETH', amount: bigint, usd: number, blockNumber: bigint): Payment {
  const rounded = Math.floor(usd * 1e6) / 1e6;
  if (rounded < P.minUsd) return { ok: false, why: 'too-small' };
  return { ok: true, token, amount, usd: rounded, blockNumber };
}
