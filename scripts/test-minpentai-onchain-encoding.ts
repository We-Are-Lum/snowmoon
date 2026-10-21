/**
 * The match encoding (onchain v1 spike): round trips, one canonical form (shuffled or padded input
 * refused), no wrapping past 255, every field range-checked.
 */
import { readFileSync } from 'node:fs';
import { replaySolo } from '../src/lib/minpentai/onchain/replay';
import { EDGE_SEEDS, sampleMatch } from '../src/lib/minpentai/onchain/sample';
import { deriveSeed } from '../src/lib/minpentai/onchain/seed';
import { engineSeed } from '../src/lib/minpentai/onchain/replay';
import { keccak256, toBytes, type Address, type Hex } from 'viem';
import { decode, encode, EncodingError, fromReplay, positionOf, toHex, type EncodedMatch } from '../src/lib/minpentai/onchain/encoding';
import { rulesetId } from '../src/lib/minpentai/onchain/ruleset';

let failed = 0, passed = 0;
const check = (name: string, f: () => string | void) => { let bad: string | void; try { bad = f(); } catch (e) { bad = (e as Error).stack; } if (bad) { failed++; console.log(`FAIL ${name}: ${bad}`); } else passed++; };
const js = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x));
const refuses = (f: () => unknown) => { try { f(); return false; } catch (e) { return e instanceof EncodingError; } };
const ID = rulesetId(JSON.parse(readFileSync('docs/minpentai/rulesets/solo-v1.json', 'utf8')));
// 300 matches across the whole seed range: the edge engine seeds at every level (in a bytes32 whose
// first 28 bytes are arbitrary), then commit-before-play seeds for 40 players' first 6 matches
// (synthetic seed-block hashes; seed blocks from 2 to 2^64 - 1).
const LOG: Address = '0x00000000000000000000000000000000000b10c5';
const seeds: { n: number; seed: Hex; seedBlock: bigint; level: number; resign?: number }[] = [];
EDGE_SEEDS.forEach((e, i) => { for (let level = 0; level <= 5; level++) seeds.push({ n: i, seed: `0x${'5a'.repeat(28)}${e.toString(16).padStart(8, '0')}`, seedBlock: BigInt(i * 6 + level + 2), level }); });
for (let p = 0; seeds.length < 300; p++) for (let n = 0; n < 6 && seeds.length < 300; n++) {
  const player = `0x${(p + 1).toString(16).padStart(40, '0')}` as Address;
  const level = (p + n) % 6, seedBlock = p === 0 && n === 0 ? 2n ** 64n - 1n : BigInt(52_000_000 + p * 1000 + n * 37);
  const seed = deriveSeed({ chainId: 31337n, matchLog: LOG, player, n: BigInt(n), rulesetId: ID, level, seedBlockHash: keccak256(toBytes(`block ${seedBlock}`)) });
  seeds.push({ n, seed, seedBlock, level, resign: (p + n) % 9 === 4 ? 1 + (n % 3) : undefined });
}
const ms: EncodedMatch[] = seeds.map((x) => {
  const solo = sampleMatch(engineSeed(x.seed), x.level, x.resign);
  return fromReplay(ID, x.n, x.seed, x.seedBlock, solo, replaySolo(solo));
});
const bytesOf = ms.map(encode);

check('the edge seeds are all there, and n of 2^32 - 1 round-trips', () => {
  for (const e of EDGE_SEEDS) if (!ms.some((m) => engineSeed(m.seed) === e)) return `no engine seed ${e}`;
  const top = decode(encode({ ...ms[0], n: 2 ** 32 - 1 }));
  if (top.n !== 2 ** 32 - 1) return `n came back ${top.n}`;
  if (!ms.some((m) => m.seedBlock === 2n ** 64n - 1n) || decode(encode(ms.find((m) => m.seedBlock === 2n ** 64n - 1n)!)).seedBlock !== 2n ** 64n - 1n) return 'seed block 2^64 - 1 did not round-trip';
});
check(`${ms.length} matches round-trip: decode(encode(m)) is m, and encode(decode(b)) is b`, () => {
  for (let i = 0; i < ms.length; i++) {
    const d = decode(bytesOf[i]);
    if (js(d) !== js(ms[i])) return `match ${i}: ${js(d).slice(0, 200)}`;
    if (toHex(encode(d)) !== toHex(bytesOf[i])) return `match ${i}: bytes differ`;
  }
});
check('a decoded match replays to its claimed result and position', () => {
  for (let i = 0; i < ms.length; i++) {
    const d = decode(bytesOf[i]);
    const r = replaySolo({ seed: engineSeed(d.seed), level: d.opponent.level, turns: d.turns, end: d.end.kind === 'end' ? { kind: 'end' } : { kind: 'resign', step: d.end.step } });
    if (JSON.stringify(positionOf(r.board)) !== JSON.stringify(d.position)) return `match ${i}: position`;
    if ((r.win === 'C' ? 'win' : r.win === 'A' ? 'loss' : 'draw') !== d.claim || r.step !== d.end.step) return `match ${i}: result`;
  }
});

// One canonical form.
const withPos = (b: Uint8Array) => { const m = decode(b); return m; };
const rich = ms.reduce((a, m, i) => (m.position.length > ms[a].position.length ? i : a), 0);
check('a position out of order is refused, by encode and (as bytes) by decode', () => {
  const m = withPos(bytesOf[rich]);
  const shuffled = { ...m, position: [...m.position].reverse() };
  if (!refuses(() => encode(shuffled))) return 'encode took a shuffled position';
  // Build the shuffled bytes by hand: the same pieces packed in the wrong order.
  const good = bytesOf[rich], head = good.length - Math.ceil((13 * m.position.length) / 8);
  let acc = 0n, bits = 0n; const packed: number[] = [];
  for (const [sq, k] of shuffled.position) { acc = (acc << 13n) | BigInt((sq << 5) | k); bits += 13n; while (bits >= 8n) { packed.push(Number((acc >> (bits - 8n)) & 255n)); bits -= 8n; acc &= (1n << bits) - 1n; } }
  if (bits) packed.push(Number((acc << (8n - bits)) & 255n));
  const bad = Uint8Array.from([...good.subarray(0, head), ...packed]);
  if (bad.length !== good.length || toHex(bad) === toHex(good)) return 'test setup';
  if (!refuses(() => decode(bad))) return 'decode took shuffled bytes';
});
check('non-zero padding bits, a trailing byte, and a truncated match are refused', () => {
  const i = ms.findIndex((m) => (13 * m.position.length) % 8 !== 0);
  const b = bytesOf[i];
  const pad = 8 - ((13 * ms[i].position.length) % 8);
  for (let bit = 0; bit < pad; bit++) {
    const c = b.slice(); c[c.length - 1] |= 1 << bit;
    if (!refuses(() => decode(c))) return `padding bit ${bit} accepted`;
  }
  if (!refuses(() => decode(Uint8Array.from([...b, 0])))) return 'a trailing zero byte accepted';
  if (!refuses(() => decode(b.subarray(0, b.length - 1)))) return 'truncated accepted';
});
check('more than 255 pieces, turns or placements throws instead of wrapping; 255 pieces is fine', () => {
  const base = ms[0];
  const pieces = (n: number) => Array.from({ length: n }, (_, j) => [Math.min(149, j >> 1), j & 1] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ok = decode(encode({ ...base, position: pieces(255) }));
  if (ok.position.length !== 255) return '255 pieces did not round-trip';
  if (!refuses(() => encode({ ...base, position: pieces(256) }))) return '256 pieces accepted';
  if (!refuses(() => encode({ ...base, turns: Array.from({ length: 256 }, () => []) }))) return '256 turns accepted';
  if (!refuses(() => encode({ ...base, turns: [Array.from({ length: 256 }, () => ({ t: 's' as const, o: 'C' as const, x: 1, y: 1, dx: 0, dy: 0 }))] }))) return '256 placements accepted';
});
check('every field is range-checked on the way in and out', () => {
  const b = bytesOf[0], m = ms[0];
  const set = (at: number, v: number) => { const c = b.slice(); c[at] = v; return c; };
  const bad: [string, () => unknown][] = [
    ['version 2', () => decode(set(0, 2))],
    ['opponent kind 1', () => decode(set(77, 1))],
    ['level 6', () => decode(set(78, 6))],
    ['claim 3', () => decode(set(79, 3))],
    ['end kind 2', () => decode(set(80, 2))],
    ['end step 97', () => decode(set(81, 97))],
    ['seed block 2^64', () => encode({ ...m, seedBlock: 2n ** 64n })],
    ['seed block negative', () => encode({ ...m, seedBlock: -1n })],
    ['seed block as a number', () => encode({ ...m, seedBlock: 5 as unknown as bigint })],
    ['n of 2^32', () => encode({ ...m, n: 2 ** 32 })],
    ['n negative', () => encode({ ...m, n: -1 })],
    ['uppercase seed', () => encode({ ...m, seed: m.seed.toUpperCase().replace('0X', '0x') as Hex })],
    ['short seed', () => encode({ ...m, seed: '0x1234' as Hex })],
    ['uppercase ruleset ID', () => encode({ ...m, rulesetId: m.rulesetId.toUpperCase().replace('0X', '0x') as typeof m.rulesetId })],
    ['position square 150', () => encode({ ...m, position: [[150, 0]] })],
    ['position kind 22', () => encode({ ...m, position: [[3, 22]] })],
    ['a square with a direction', () => encode({ ...m, turns: [[{ t: 's', o: 'C', x: 2, y: 2, dx: 1, dy: 0 }]] })],
    ['a glider with no direction', () => encode({ ...m, turns: [[{ t: 'g', o: 'C', x: 2, y: 2, dx: 0, dy: 0 }]] })],
    ['placement off the board', () => encode({ ...m, turns: [[{ t: 's', o: 'C', x: 15, y: 0, dx: 0, dy: 0 }]] })],
  ];
  const missed = bad.filter(([, f]) => !refuses(f)).map(([n]) => n);
  return missed.length ? `not refused: ${missed.join(', ')}` : undefined;
});

const lens = bytesOf.map((b) => b.length).sort((a, b) => a - b), pl = ms.map((m) => Math.ceil((13 * m.position.length) / 8) + 1).sort((a, b) => a - b);
const q = (a: number[]) => `min ${a[0]}, median ${a[a.length >> 1]}, max ${a[a.length - 1]}`;
console.log(failed ? `encoding: ${failed} failed, ${passed} passed` : `encoding: ${passed} checks passed; match ${q(lens)} bytes; final position ${q(pl)} bytes (${ms.length} matches)`);
process.exit(failed ? 1 : 0);
