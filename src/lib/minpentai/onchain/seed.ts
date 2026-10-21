/**
 * Commit-before-play seeds (onchain v1 spike, owner 2026-10-21). MatchLog.start(rulesetId, level)
 * opens a player's match number n and names its seed block (start's block + 2). Once that block
 * exists, its hash gives the seed; MatchLog.record() recomputes it through EIP-2935 and refuses
 * anything else:
 *
 *   seed = keccak256(abi.encode(uint256 chainId, address matchLog, address player, uint256 n,
 *                               bytes32 rulesetId, uint8 level, bytes32 blockhash(seedBlock)))
 *
 * The engine plays from the seed's last 4 bytes, big-endian (engineSeed in replay.ts).
 */
import { encodeAbiParameters, getAddress, keccak256, type Address, type Hex } from 'viem';
import { engineSeed } from './replay';

export const SEED_DELAY = 2n;
export const DEADLINE_BLOCKS = 8000n;
export const HISTORY: Address = '0x0000F90827F1C53a10cb7A02335B175320002935';

export interface SeedInput { chainId: bigint; matchLog: Address; player: Address; n: bigint; rulesetId: Hex; level: number; seedBlockHash: Hex }

export function deriveSeed(s: SeedInput): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint8' }, { type: 'bytes32' }],
    [s.chainId, getAddress(s.matchLog), getAddress(s.player), s.n, s.rulesetId, s.level, s.seedBlockHash],
  ));
}

/** What the page shows once the seed block exists: the seed and the engine seed. */
export function seedForPlay(s: SeedInput) {
  const seed = deriveSeed(s);
  return { seed, engineSeed: engineSeed(seed) };
}
