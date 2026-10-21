/**
 * Wallet-bound seeds (onchain v1 spike, owner 2026-10-21). A player's nth match (n = how many they
 * have recorded so far) must use this seed; MatchLog.record() computes the same and refuses
 * anything else, so nobody can put another wallet's match, or one from another chain or log, into
 * their own history:
 *
 *   seed = keccak256(abi.encode(uint256 chainId, address matchLog, address player, uint256 n))
 *
 * The engine plays from the seed's low 32 bits (engineSeed in replay.ts: the last 4 bytes,
 * big-endian, Solidity's uint32(uint256(seed))).
 */
import { encodeAbiParameters, getAddress, keccak256, type Address, type Hex } from 'viem';
import { engineSeed } from './replay';

export function deriveSeed(chainId: bigint, matchLog: Address, player: Address, n: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }], [chainId, getAddress(matchLog), getAddress(player), n]));
}

/** What the page would show before a match: the player's next n, its seed, and the engine seed. */
export function nextSeed(chainId: bigint, matchLog: Address, player: Address, count: bigint) {
  const seed = deriveSeed(chainId, matchLog, player, count);
  return { n: count, seed, engineSeed: engineSeed(seed) };
}
