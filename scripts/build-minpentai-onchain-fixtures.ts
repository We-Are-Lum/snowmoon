/**
 * Shared fixtures for the Solidity tests (onchain v1 spike): contracts/minpentai/fixtures/onchain.json.
 * Everything here is computed by the TypeScript (seed.ts, replay.ts, encoding.ts); the Forge tests
 * check that Solidity agrees, and scripts/test-minpentai-onchain-fixtures.ts that the file is current.
 *
 *   seeds:   wallet-bound seeds for several chains, logs, players and n, with their engine seeds
 *   engine:  bytes32 seeds whose last 4 bytes are the edge engine seeds (which 4 bytes, which order)
 *   matches: real matches, encoded, for three players (short, median and long), n = 0 and 1,
 *            recorded on chain 31337 at the fixed MatchLog address below
 *
 *   npx tsx scripts/build-minpentai-onchain-fixtures.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Address, Hex } from 'viem';
import { encode, fromReplay, matchHash, toHex } from '../src/lib/minpentai/onchain/encoding';
import { engineSeed, replaySolo } from '../src/lib/minpentai/onchain/replay';
import { rulesetId } from '../src/lib/minpentai/onchain/ruleset';
import { EDGE_SEEDS, sampleMatch } from '../src/lib/minpentai/onchain/sample';
import { deriveSeed } from '../src/lib/minpentai/onchain/seed';

export const CHAIN_ID = 31337n;
export const MATCH_LOG: Address = '0x00000000000000000000000000000000000b10c5';
const ID = rulesetId(JSON.parse(readFileSync('docs/minpentai/rulesets/solo-v1.json', 'utf8')));
const addr = (i: number) => `0x${(0x1000 + i).toString(16).padStart(40, '0')}` as Address;

export function buildFixtures() {
  const seeds: { chainId: string; matchLog: Address; player: Address; n: string; seed: Hex; engineSeed: number }[] = [];
  for (const chainId of [31337n, 8453n, 84532n]) for (const log of [MATCH_LOG, '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f' as Address])
    for (const [p, n] of [[1, 0n], [1, 1n], [2, 0n], [3, 7n], [4, 2n ** 32n - 1n], [5, 2n ** 255n]] as [number, bigint][]) {
      const seed = deriveSeed(chainId, log, addr(p), n);
      seeds.push({ chainId: chainId.toString(), matchLog: log, player: addr(p), n: n.toString(), seed, engineSeed: engineSeed(seed) });
    }
  const engine = EDGE_SEEDS.map((e, i) => ({ seed: `0x${(i * 37 + 0x11).toString(16).padStart(2, '0').repeat(28)}${e.toString(16).padStart(8, '0')}` as Hex, engineSeed: e }));

  // For each player and n, try every level and resign point; keep the shortest, median or longest encoding.
  const pick = (player: Address, n: number, which: 'short' | 'median' | 'long') => {
    const seed = deriveSeed(CHAIN_ID, MATCH_LOG, player, BigInt(n));
    const cands: { hex: Hex; len: number; level: number; claim: string }[] = [];
    for (let level = 0; level <= 5; level++) for (const resign of [undefined, 0, 1, 2, 3, 4, 6]) {
      const solo = sampleMatch(engineSeed(seed), level, resign);
      const m = fromReplay(ID, n, seed, solo, replaySolo(solo));
      const b = encode(m);
      cands.push({ hex: toHex(b) as Hex, len: b.length, level, claim: m.claim });
    }
    cands.sort((a, b) => a.len - b.len || a.hex.localeCompare(b.hex));
    const c = which === 'short' ? cands[0] : which === 'long' ? cands[cands.length - 1] : cands[cands.length >> 1];
    return { label: `${which} n=${n}`, player, n, data: c.hex, hash: matchHash(Uint8Array.from(Buffer.from(c.hex.slice(2), 'hex'))), length: c.len, level: c.level, claim: c.claim };
  };
  const matches = (['short', 'median', 'long'] as const).flatMap((w, i) => [pick(addr(100 + i), 0, w), pick(addr(100 + i), 1, w)]);
  return {
    about: 'Shared TS/Solidity fixtures for Minpentai onchain v1 (spike). Built by scripts/build-minpentai-onchain-fixtures.ts; do not edit.',
    seedRule: 'seed = keccak256(abi.encode(uint256 chainId, address matchLog, address player, uint256 n)); engineSeed = uint32(uint256(seed)) = the last 4 bytes (bytes 28..31) read big-endian',
    rulesetId: ID, chainId: CHAIN_ID.toString(), matchLog: MATCH_LOG,
    seeds, engine, matches,
  };
}

if (process.argv[1]?.endsWith('build-minpentai-onchain-fixtures.ts')) {
  const f = buildFixtures();
  writeFileSync('contracts/minpentai/fixtures/onchain.json', JSON.stringify(f, null, 2) + '\n');
  console.log(`fixtures: ${f.seeds.length} seeds, ${f.engine.length} engine seeds, matches ${f.matches.map((m) => `${m.label} ${m.length}B`).join(', ')}`);
}
