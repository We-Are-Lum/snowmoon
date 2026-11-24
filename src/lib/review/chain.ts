import 'server-only';
import { parseAbi, type PublicClient } from 'viem';
import { BOUNTY_REVIEW as B } from '../config';
import { chain } from '../wallet/chain';

/**
 * The poidh bounty and its claims, read on Base (owner, 2026-11-23; branch bounty-review). Read-only: view functions
 * only, through Multicall3, on the site's Base reader (src/lib/wallet/chain.ts: BASE_RPC_URL, else Base's public
 * endpoint https://mainnet.base.org). No key, no wallet, no transaction, nothing sent to poidh. The ABI is the part of
 * PoidhV3's verified source the warplore comic bounty copied (Basescan exact match, 2026-10-21).
 *
 * PoidhV3 keeps a bounty's claim ids in bountyClaims(bounty, i), oldest first, and reverts past the last one. A claim's
 * picture is not in the Claim struct: it is the claim NFT's tokenURI(claim id).
 */
export const POIDH_READ_ABI = parseAbi([
  'function bounties(uint256 bountyId) view returns (uint256 id, address issuer, string name, string description, uint256 amount, address claimer, uint256 createdAt, uint256 claimId)',
  'function bountyClaims(uint256 bountyId, uint256 index) view returns (uint256)',
  'function claims(uint256 claimId) view returns (uint256 id, address issuer, uint256 bountyId, address bountyIssuer, string name, string description, uint256 createdAt, bool accepted)',
]);
export const NFT_READ_ABI = parseAbi(['function tokenURI(uint256 tokenId) view returns (string)']);

export type Reader = Pick<PublicClient, 'readContract' | 'multicall'>;

export interface OnChainBounty {
  id: number;
  issuer: string;
  name: string;
  description: string;
  amountWei: string;
  /** The winner's address once the bounty is settled on poidh, else null. */
  claimer: string | null;
  createdAt: number;
}
export interface OnChainClaim {
  id: number;
  /** The claimer's address, lowercase. */
  issuer: string;
  name: string;
  description: string;
  /** Unix seconds. */
  createdAt: number;
  accepted: boolean;
  /** The claim NFT's tokenURI: the picture, or JSON naming it. Null if it couldn't be read. */
  uri: string | null;
}
export interface OnChain { bounty: OnChainBounty; claims: OnChainClaim[]; readAt: string }

const ZERO = '0x0000000000000000000000000000000000000000';
const PAGE = 50;

/** The bounty and every claim on it, oldest first. Throws if the bounty itself can't be read. */
export async function readOnChain(reader: Reader = chain() as Reader, bountyId: number = B.bountyId): Promise<OnChain> {
  const b = (await reader.readContract({ address: B.core, abi: POIDH_READ_ABI, functionName: 'bounties', args: [BigInt(bountyId)] })) as readonly [bigint, string, string, string, bigint, string, bigint, bigint];
  if (Number(b[0]) !== bountyId || b[1].toLowerCase() === ZERO) throw new Error('bounty not found');
  const bounty: OnChainBounty = {
    id: Number(b[0]), issuer: b[1].toLowerCase(), name: b[2], description: b[3], amountWei: b[4].toString(),
    claimer: b[5].toLowerCase() === ZERO ? null : b[5].toLowerCase(), createdAt: Number(b[6]),
  };
  // Claim ids, a page at a time, until an index reverts.
  const ids: bigint[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await reader.multicall({
      allowFailure: true,
      contracts: Array.from({ length: PAGE }, (_, i) => ({ address: B.core, abi: POIDH_READ_ABI, functionName: 'bountyClaims' as const, args: [BigInt(bountyId), BigInt(from + i)] as const })),
    });
    let ended = false;
    for (const r of page) {
      if (r.status !== 'success') { ended = true; break; }
      ids.push(r.result as bigint);
    }
    if (ended) break;
    if (from > 100_000) throw new Error('too many claims');
  }
  const claims: OnChainClaim[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    const chunk = ids.slice(i, i + PAGE);
    const [rows, uris] = await Promise.all([
      reader.multicall({ allowFailure: true, contracts: chunk.map((id) => ({ address: B.core, abi: POIDH_READ_ABI, functionName: 'claims' as const, args: [id] as const })) }),
      reader.multicall({ allowFailure: true, contracts: chunk.map((id) => ({ address: B.nft, abi: NFT_READ_ABI, functionName: 'tokenURI' as const, args: [id] as const })) }),
    ]);
    chunk.forEach((id, k) => {
      const r = rows[k];
      if (r.status !== 'success') return;
      const c = r.result as readonly [bigint, string, bigint, string, string, string, bigint, boolean];
      // Only this bounty's claims (bountyClaims is this bounty's list; checked again).
      if (Number(c[2]) !== bountyId || c[1].toLowerCase() === ZERO) return;
      const u = uris[k];
      claims.push({ id: Number(id), issuer: c[1].toLowerCase(), name: c[4], description: c[5], createdAt: Number(c[6]), accepted: c[7], uri: u.status === 'success' ? String(u.result) : null });
    });
  }
  return { bounty, claims, readAt: new Date().toISOString() };
}

let cached: { at: number; value: OnChain } | null = null;
/** readOnChain, kept for BOUNTY_REVIEW.cacheMs (one admin tapping Next shouldn't read Base each time). */
export async function onChain(opts: { fresh?: boolean; reader?: Reader } = {}): Promise<OnChain> {
  if (!opts.fresh && !opts.reader && cached && Date.now() - cached.at < B.cacheMs) return cached.value;
  const value = await readOnChain(opts.reader);
  if (!opts.reader) cached = { at: Date.now(), value };
  return value;
}
