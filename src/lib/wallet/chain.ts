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
const USER_OP = parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)']);
/** ERC-4337 EntryPoints v0.6 and v0.7 (the same address on every chain). */
const ENTRY_POINTS = ['0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', '0x0000000071727de22e5e9d8baf0edac6f37da032'];

export type Payment =
  | { ok: true; token: 'USDC'; amount: bigint; usd: number; blockNumber: bigint }
  | { ok: false; why: 'not-found' | 'pending' | 'failed' | 'old' | 'not-to-us' | 'not-from-you' | 'too-small' | 'eth' };

/**
 * What a transaction paid us, from `from` (the signed-in wallet): a Transfer log on the USDC contract from `from` to
 * payTo (works for smart wallets too). Only USDC on Base is added to a balance (owner, 2026-11-25, option A): payTo is
 * Lum's Splits deposit address, whose sweeps move ETH out of it through the EntryPoint, so a smart wallet's ETH, read
 * from payTo's balance rising across its block, could no longer be read reliably. ETH already in a balance stays
 * spendable; it is never read again.
 *
 * An ETH payment is recognised only to say so ('eth'), never credited: a plain transaction from `from` to payTo with a
 * value, or the wallet's own operation (ERC-4337 UserOperationEvent with that sender and success, or the wallet itself
 * sending it, EIP-7702) in a block where payTo's ETH balance rose. The second is a hint for the message only.
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
  if (usdc > 0n) return paid(usdc, receipt.blockNumber);
  if (sawUs) return { ok: false, why: 'not-from-you' };

  // Not USDC. Say so if it was ETH to us; it is not added.
  const tx = await client.getTransaction({ hash });
  if (tx.to?.toLowerCase() === payTo && tx.value > 0n) return { ok: false, why: tx.from.toLowerCase() === who ? 'eth' : 'not-from-you' };
  const ownOp = receipt.logs.some((log) => {
    if (!ENTRY_POINTS.includes(log.address.toLowerCase())) return false;
    try {
      const e = decodeEventLog({ abi: USER_OP, data: log.data, topics: log.topics });
      return e.args.sender.toLowerCase() === who && e.args.success;
    } catch {
      return false;
    }
  });
  if (!ownOp && tx.from.toLowerCase() !== who) return { ok: false, why: 'not-to-us' };
  const [after, before] = await Promise.all([
    client.getBalance({ address: payTo as `0x${string}`, blockNumber: receipt.blockNumber }),
    client.getBalance({ address: payTo as `0x${string}`, blockNumber: receipt.blockNumber - 1n }),
  ]);
  return { ok: false, why: after > before ? 'eth' : 'not-to-us' };
}

function paid(amount: bigint, blockNumber: bigint): Payment {
  const usd = Math.floor((Number(amount) / 1e6) * 1e6) / 1e6;
  if (usd < P.minUsd) return { ok: false, why: 'too-small' };
  return { ok: true, token: 'USDC', amount, usd, blockNumber };
}
