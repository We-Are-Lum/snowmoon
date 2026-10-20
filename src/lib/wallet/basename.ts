import 'server-only';
import { namehash, parseAbi, isAddressEqual } from 'viem';
import { chain } from './chain';

/**
 * A wallet's Basename (alice.base.eth), for the name order the owner set (2026-10-18): Farcaster name,
 * then Basename, then the shortened address. Read on Base through the same public endpoint the payment
 * checks use (src/lib/wallet/chain.ts; BASE_RPC_URL in tests), sending only the address. No key.
 *
 * - The reverse record: Base's L2 resolver, name(namehash("<address>.80002105.reverse")) (80002105 is
 *   Base's ENSIP-11 coin type, 0x80000000 | 8453).
 * - Then the forward check: the name must resolve back to the same address, so nobody can show a
 *   Basename that isn't theirs by setting a reverse record alone.
 * - Cached a day (a miss, an hour). Base not answering in 2.5 seconds counts as no name, not cached,
 *   so a page never waits long on it and the shortened address is shown.
 *
 * Shown only on the You page (to the person themself) and on a wallet account's public profile
 * (/@<address>). DRAFT: the Privacy line naming this lookup is in docs/legal/privacy-you-page-draft.md.
 */
const L2_RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as const;
const ABI = parseAbi(['function name(bytes32 node) view returns (string)', 'function addr(bytes32 node) view returns (address)']);
const BASE_COIN_TYPE = (0x80000000 | 8453) >>> 0;
const DAY = 86400_000;
const HOUR = 3600_000;
const WAIT_MS = 2500;
const NAME = /^[a-z0-9-]{1,63}\.base\.eth$/;

const cache = new Map<string, { name: string | null; at: number }>();

const within = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

async function ask(address: `0x${string}`): Promise<string | null | undefined> {
  const reverse = namehash(`${address.slice(2).toLowerCase()}.${BASE_COIN_TYPE.toString(16)}.reverse`);
  const name = await chain().readContract({ address: L2_RESOLVER, abi: ABI, functionName: 'name', args: [reverse] });
  const n = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!NAME.test(n)) return null;
  const back = await chain().readContract({ address: L2_RESOLVER, abi: ABI, functionName: 'addr', args: [namehash(n)] });
  return back && isAddressEqual(back, address) ? n : null;
}

/** The address's Basename, checked both ways, or null (none, or Base didn't answer in time). */
export async function basenameOf(address: string): Promise<string | null> {
  const a = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
  const hit = cache.get(a);
  if (hit && Date.now() - hit.at < (hit.name ? DAY : HOUR)) return hit.name;
  const got = await within(
    ask(a as `0x${string}`).catch(() => undefined),
    WAIT_MS,
  );
  if (got === undefined) return hit?.name ?? null;
  cache.set(a, { name: got, at: Date.now() });
  return got;
}
