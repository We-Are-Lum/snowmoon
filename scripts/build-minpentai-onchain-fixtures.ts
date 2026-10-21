/**
 * Shared fixtures for the Solidity tests (onchain v1 spike): contracts/minpentai/fixtures/onchain.json.
 * Everything here is computed by the TypeScript (seed.ts, replay.ts, encoding.ts); the Forge tests
 * check that Solidity agrees, and scripts/test-minpentai-onchain-fixtures.ts that the file is current.
 *
 *   seeds:   commit-before-play seeds for several chains, logs, players, n, levels and block hashes, with engine seeds
 *   engine:  bytes32 seeds whose last 4 bytes are the edge engine seeds (which 4 bytes, which order)
 *   matches: real matches, encoded, for three players (short, median and long), n = 0 and 1, each
 *            with its start block, seed block and (synthetic) seed-block hash, on chain 31337 at the
 *            fixed MatchLog address below
 *
 *   npx tsx scripts/build-minpentai-onchain-fixtures.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256, toBytes, type Address, type Hex } from 'viem';
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
  const blockHash = (b: bigint) => keccak256(toBytes(`fixture block ${b}`));
  const seeds: { chainId: string; matchLog: Address; player: Address; n: string; rulesetId: Hex; level: number; seedBlockHash: Hex; seed: Hex; engineSeed: number }[] = [];
  for (const chainId of [31337n, 8453n, 84532n]) for (const log of [MATCH_LOG, '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f' as Address])
    for (const [p, n, level] of [[1, 0n, 0], [1, 1n, 5], [2, 0n, 3], [3, 7n, 1], [4, 2n ** 32n - 1n, 2], [5, 2n ** 255n, 255]] as [number, bigint, number][]) {
      const input = { chainId, matchLog: log, player: addr(p), n, rulesetId: ID, level, seedBlockHash: blockHash(BigInt(p) * 1000n + n % 1000n) };
      const seed = deriveSeed(input);
      seeds.push({ chainId: chainId.toString(), matchLog: log, player: addr(p), n: n.toString(), rulesetId: ID, level, seedBlockHash: input.seedBlockHash, seed, engineSeed: engineSeed(seed) });
    }
  const engine = EDGE_SEEDS.map((e, i) => ({ seed: `0x${(i * 37 + 0x11).toString(16).padStart(2, '0').repeat(28)}${e.toString(16).padStart(8, '0')}` as Hex, engineSeed: e }));

  // Three players (short, median, long), n = 0 and 1. Each match: start() at startBlock, seed block
  // startBlock + 2 with a synthetic hash; every level and resign point tried, the shortest, median or
  // longest encoding kept.
  const pick = (player: Address, n: number, which: 'short' | 'median' | 'long', startBlock: bigint) => {
    const seedBlock = startBlock + 2n, seedBlockHash = blockHash(seedBlock);
    const cands: { hex: Hex; len: number; level: number; claim: string; seed: Hex }[] = [];
    for (let level = 0; level <= 5; level++) for (const resign of [undefined, 0, 1, 2, 3, 4, 6]) {
      const seed = deriveSeed({ chainId: CHAIN_ID, matchLog: MATCH_LOG, player, n: BigInt(n), rulesetId: ID, level, seedBlockHash });
      const solo = sampleMatch(engineSeed(seed), level, resign);
      const b = encode(fromReplay(ID, n, seed, seedBlock, solo, replaySolo(solo)));
      cands.push({ hex: toHex(b) as Hex, len: b.length, level, claim: fromReplay(ID, n, seed, seedBlock, solo, replaySolo(solo)).claim, seed });
    }
    cands.sort((a, b) => a.len - b.len || a.hex.localeCompare(b.hex));
    const c = which === 'short' ? cands[0] : which === 'long' ? cands[cands.length - 1] : cands[cands.length >> 1];
    return { label: `${which} n=${n}`, player, n, level: c.level, startBlock: Number(startBlock), seedBlock: Number(seedBlock), seedBlockHash, seed: c.seed, data: c.hex, hash: matchHash(Uint8Array.from(Buffer.from(c.hex.slice(2), 'hex'))), length: c.len, claim: c.claim };
  };
  const matches = (['short', 'median', 'long'] as const).flatMap((w, i) => [pick(addr(100 + i), 0, w, BigInt(1000 + i * 100)), pick(addr(100 + i), 1, w, BigInt(1050 + i * 100))]);
  return {
    about: 'Shared TS/Solidity fixtures for Minpentai onchain v1, commit before play (spike). Built by scripts/build-minpentai-onchain-fixtures.ts; do not edit.',
    seedRule: 'seed = keccak256(abi.encode(uint256 chainId, address matchLog, address player, uint256 n, bytes32 rulesetId, uint8 level, bytes32 blockhash(seedBlock))); seedBlock = start block + 2; engineSeed = uint32(uint256(seed)) = the last 4 bytes (bytes 28..31) read big-endian',
    rulesetId: ID, chainId: CHAIN_ID.toString(), matchLog: MATCH_LOG,
    seeds, engine, matches,
  };
}

if (process.argv[1]?.endsWith('build-minpentai-onchain-fixtures.ts')) {
  const f = buildFixtures();
  writeFileSync('contracts/minpentai/fixtures/onchain.json', JSON.stringify(f, null, 2) + '\n');
  console.log(`fixtures: ${f.seeds.length} seeds, ${f.engine.length} engine seeds, matches ${f.matches.map((m) => `${m.label} ${m.length}B`).join(', ')}`);
}
