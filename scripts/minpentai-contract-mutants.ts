/**
 * Planted bugs in MatchLog.sol (onchain v1 spike, commit before play): each mutant removes or weakens
 * one check; the Forge suites must fail against every one. The original file is always restored.
 *
 *   npx tsx scripts/minpentai-contract-mutants.ts
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'contracts/minpentai/src/MatchLog.sol';
export const MUTANTS: [string, string, string][] = [
  ['no seed check', 'if (bytes32(data[37:69]) != want) revert WrongSeed(want, bytes32(data[37:69]));', ''],
  ['no deadline check', 'if (block.number > deadlineOf(seedBlock)) revert DeadlinePassed(deadlineOf(seedBlock));', ''],
  ['deadline one block early', 'if (block.number > deadlineOf(seedBlock)) revert DeadlinePassed', 'if (block.number >= deadlineOf(seedBlock)) revert DeadlinePassed'],
  ['record allowed in the seed block', 'if (block.number <= seedBlock) revert SeedNotYetAvailable(seedBlock);', 'if (block.number < seedBlock) revert SeedNotYetAvailable(seedBlock);'],
  ['no ruleset check', 'if (bytes32(data[1:33]) != rulesetId) revert WrongRuleset(rulesetId, bytes32(data[1:33]));', ''],
  ['no n check', 'if (uint32(bytes4(data[33:37])) != n) revert WrongN(n, uint32(bytes4(data[33:37])));', ''],
  ['no seed block check', 'if (uint64(bytes8(data[69:77])) != seedBlock) revert WrongSeedBlock(seedBlock, uint64(bytes8(data[69:77])));', ''],
  ['no level check', 'if (uint8(data[78]) != level) revert WrongLevel(level, uint8(data[78]));', ''],
  ['record leaves the match open', '        o.open = false;\n        matchHash[msg.sender][n] = keccak256(data);', '        matchHash[msg.sender][n] = keccak256(data);'],
  ['start does not forfeit an open match', 'if (o.open) _forfeit(msg.sender, o);', ''],
  ['start does not rewrite the level', '        o.level = level;\n        o.open = true;', '        o.open = true;'],
  ['start does not rewrite the ruleset', '        o.rulesetId = rulesetId;\n', ''],
  ['seed block one too early', 'seedBlock = uint64(block.number + SEED_DELAY);', 'seedBlock = uint64(block.number + 1);'],
  ['close before the deadline', 'if (block.number <= deadlineOf(o.seedBlock)) revert NotExpired(deadlineOf(o.seedBlock));', ''],
  ['close with no open match', 'if (!o.open) revert NoOpenMatch();\n        if (block.number <= deadlineOf(o.seedBlock))', 'if (block.number <= deadlineOf(o.seedBlock))'],
  ['a forfeit is not marked', 'matchHash[player][n] = FORFEIT;', ''],
  ['a forfeit does not move n on', 'count[player] = n + 1;\n        emit MatchForfeited', 'emit MatchForfeited'],
  ['no event on forfeit', 'emit MatchForfeited(player, o.rulesetId, n);', ''],
  ['seed ignores the level', 'player, n, rulesetId, level, seedBlockHash));', 'player, n, rulesetId, uint8(0), seedBlockHash));'],
  ['seed ignores the chain', 'abi.encode(block.chainid, address(this),', 'abi.encode(uint256(0), address(this),'],
  ['zero hash accepted from history', 'if (h == bytes32(0)) revert NoHistory();', ''],
  ['no history code check (also covered by the return-length check: equivalent)', 'if (HISTORY.code.length == 0) revert NoHistory();', ''],
  ['wrong version accepted', 'if (uint8(data[0]) != FORMAT_VERSION) revert BadVersion(uint8(data[0]));', ''],
  ['short data accepted', 'if (data.length < MIN_LENGTH) revert TooShort(data.length);', ''],
];

if (process.argv[1]?.endsWith('minpentai-contract-mutants.ts')) {
  const original = readFileSync(FILE, 'utf8');
  const survivors: string[] = [];
  try {
    for (const [name, from, to] of MUTANTS) {
      if (!original.includes(from)) { survivors.push(`${name}: text not found`); continue; }
      writeFileSync(FILE, original.replace(from, to));
      const r = spawnSync('forge', ['test', '--match-contract', 'MatchLogTest|MatchLogLimitsTest', '--fuzz-runs', '256'], { cwd: 'contracts/minpentai', encoding: 'utf8' });
      const failedTests = (r.stdout.match(/\[FAIL/g) ?? []).length;
      const caught = r.status !== 0;
      console.log(`${caught ? 'caught  ' : 'SURVIVED'} ${name}${caught ? ` (${failedTests || 'build'} failing)` : ''}`);
      if (!caught) survivors.push(name);
    }
  } finally {
    writeFileSync(FILE, original);
  }
  const unexpected = survivors.filter((s) => !s.includes('equivalent'));
  console.log(unexpected.length ? `contract mutants: ${unexpected.length} survived: ${unexpected.join('; ')}` : `contract mutants: all ${MUTANTS.length - survivors.length} caught${survivors.length ? `; ${survivors.length} equivalent (documented)` : ''}`);
  process.exit(unexpected.length ? 1 : 0);
}
