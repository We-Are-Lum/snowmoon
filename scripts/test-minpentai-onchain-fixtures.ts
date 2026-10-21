/**
 * Onchain v1 spike: the shared fixtures are what the TypeScript computes today; every fixture match
 * decodes, carries its own seed, and replays to its claim and position; and MatchLog has no way to
 * change or remove a record (its only state-changing functions are start(), record() and close(); it has
 * no fallback or receive, and its runtime code has no SELFDESTRUCT, DELEGATECALL or CALLCODE).
 * Needs `forge build` in contracts/minpentai first.
 */
import { readFileSync } from 'node:fs';
import { buildFixtures } from './build-minpentai-onchain-fixtures';
import { decode, positionOf } from '../src/lib/minpentai/onchain/encoding';
import { engineSeed, replaySolo } from '../src/lib/minpentai/onchain/replay';
import { deriveSeed } from '../src/lib/minpentai/onchain/seed';
import type { Address } from 'viem';

let failed = 0, passed = 0;
const check = (name: string, f: () => string | void) => { let bad: string | void; try { bad = f(); } catch (e) { bad = (e as Error).stack; } if (bad) { failed++; console.log(`FAIL ${name}: ${bad}`); } else passed++; };
const file = JSON.parse(readFileSync('contracts/minpentai/fixtures/onchain.json', 'utf8'));

check('fixtures/onchain.json is what the TypeScript computes (rebuild with npx tsx scripts/build-minpentai-onchain-fixtures.ts)', () => {
  if (JSON.stringify(buildFixtures()) !== JSON.stringify(file)) return 'stale';
});
check('every fixture match decodes, has its own seed (player, n, ruleset, level, seed block), and replays to its claim and final position', () => {
  for (const m of file.matches) {
    const d = decode(Uint8Array.from(Buffer.from(m.data.slice(2), 'hex')));
    if (d.n !== m.n || d.rulesetId !== file.rulesetId) return `${m.label}: header`;
    if (d.seedBlock !== BigInt(m.seedBlock) || m.seedBlock !== m.startBlock + 2 || d.opponent.level !== m.level) return `${m.label}: seed block or level`;
    if (d.seed !== deriveSeed({ chainId: BigInt(file.chainId), matchLog: file.matchLog as Address, player: m.player as Address, n: BigInt(m.n), rulesetId: d.rulesetId, level: d.opponent.level, seedBlockHash: m.seedBlockHash })) return `${m.label}: not this match's seed`;
    const r = replaySolo({ seed: engineSeed(d.seed), level: d.opponent.level, turns: d.turns, end: d.end.kind === 'end' ? { kind: 'end' } : { kind: 'resign', step: d.end.step } });
    if ((r.win === 'C' ? 'win' : r.win === 'A' ? 'loss' : 'draw') !== d.claim || r.step !== d.end.step) return `${m.label}: claim`;
    if (JSON.stringify(positionOf(r.board)) !== JSON.stringify(d.position)) return `${m.label}: position`;
  }
});

const art = (name: string) => JSON.parse(readFileSync(`contracts/minpentai/out/${name}.sol/${name}.json`, 'utf8')) as { abi: { type: string; name?: string; stateMutability?: string }[]; deployedBytecode: { object: string } };
/** Opcodes actually executed-able in runtime code (skipping PUSH data). */
const opcodes = (hex: string) => { const b = Buffer.from(hex.replace(/^0x/, ''), 'hex'), ops = new Set<number>(); for (let i = 0; i < b.length; i++) { const op = b[i]; ops.add(op); if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; } return ops; };
check('MatchLog: the only state-changing functions are start(), record() and close(); no fallback, no receive, nothing payable', () => {
  const a = art('MatchLog').abi;
  const writers = a.filter((x) => x.type === 'function' && x.stateMutability !== 'view' && x.stateMutability !== 'pure').map((x) => x.name);
  if (writers.sort().join() !== 'close,record,start') return `state-changing: ${writers.join(', ')}`;
  if (a.some((x) => x.type === 'fallback' || x.type === 'receive' || x.stateMutability === 'payable')) return 'fallback, receive or payable';
});
check('RulesetRegistry: the only state-changing function is add(); no fallback, no receive, nothing payable', () => {
  const a = art('RulesetRegistry').abi;
  const writers = a.filter((x) => x.type === 'function' && x.stateMutability !== 'view' && x.stateMutability !== 'pure').map((x) => x.name);
  if (writers.join() !== 'add') return `state-changing: ${writers.join(', ')}`;
  if (a.some((x) => x.type === 'fallback' || x.type === 'receive' || x.stateMutability === 'payable')) return 'fallback, receive or payable';
});
check('neither contract\'s runtime code can SELFDESTRUCT, DELEGATECALL or CALLCODE (so no proxy, no self-removal)', () => {
  for (const n of ['MatchLog', 'RulesetRegistry']) {
    const ops = opcodes(art(n).deployedBytecode.object);
    for (const [op, name] of [[0xff, 'SELFDESTRUCT'], [0xf4, 'DELEGATECALL'], [0xf2, 'CALLCODE']] as const) if (ops.has(op)) return `${n} has ${name}`;
  }
});
console.log(failed ? `fixtures: ${failed} failed, ${passed} passed` : `fixtures and contracts: ${passed} checks passed`);
process.exit(failed ? 1 : 0);
