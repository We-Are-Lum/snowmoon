/**
 * Onchain Minpentai v1 (spike): a finished solo match as bytes, the form MatchLog.record() takes
 * and MatchRecorded carries. One canonical encoding: decode() re-encodes what it read and refuses
 * anything that is not byte for byte the same (so a match has exactly one byte form and one hash).
 *
 * Layout (big-endian), format 2:
 *    0  u8       format version (2)
 *    1  bytes32  ruleset ID (keccak256 of the manifest's canonical JSON)
 *   33  u32      n: this is the recorder's nth match (0 for their first)
 *   37  bytes32  seed: keccak256(abi.encode(chainId, matchLog, recorder, n)) (seed.ts); MatchLog
 *                checks it. The engine plays from its last 4 bytes, big-endian (engineSeed).
 *   69  u8       opponent kind (0 = a computer player of the ruleset)
 *   70  u8       opponent (computer player level, 0-5)
 *   71  u8       claimed result for the recorder (0 loss, 1 win, 2 draw)
 *   72  u8       how it ended (0 played out, 1 resigned)
 *   73  u8       the step it ended at (0-96)
 *   74  u8       turns to act (T), then for each turn:
 *         u8 placements (n, 0-8), then n x 2 bytes, in the order placed (order sets glider ids):
 *           u8 square (y * 15 + x, 0-149)
 *           u8 piece << 4 | direction (piece 0 glider, 1 square, 2 tower; direction 0-7 into D8
 *              for a glider, 0 otherwise)
 *   ..   u8       pieces in the final position (P, at most 255), then P x 13 bits, packed
 *                  most significant bit first, last byte padded with zero bits:
 *           8 bits square (0-149), 5 bits kind:
 *             0 Cyan tower, 1 Amber tower,
 *             2 Cyan square 1 hit left, 3 Cyan square 2 hits left, 4 Amber square 1, 5 Amber square 2,
 *             6-13 Cyan glider in direction 0-7, 14-21 Amber glider in direction 0-7
 *         sorted by square, then kind. Rocks never change and are not in it.
 * The person always plays Cyan; the recorder (msg.sender) is the person.
 */
import { D8, H, MAXS, W, type Placement, type Side, type World } from '../play-game/game';
import { keccak256, type Hex } from 'viem';

export const FORMAT_VERSION = 2;
/** Header (74 bytes) + the turn count + the piece count: the shortest a match can be. */
export const MIN_LENGTH = 76;
export type Claim = 'loss' | 'win' | 'draw';
export interface EncodedMatch {
  rulesetId: Hex;
  /** The recorder's match number (their record count before this one). */
  n: number;
  /** The wallet-bound seed (bytes32). */
  seed: Hex;
  opponent: { kind: 'computer'; level: number };
  claim: Claim;
  end: { kind: 'end' | 'resign'; step: number };
  /** The person's placements, one list per turn to act (o is always 'C'). */
  turns: Placement[][];
  /** The final position: [square, kind] sorted by square then kind. */
  position: [number, number][];
}

export class EncodingError extends Error {}
const fail = (why: string): never => { throw new EncodingError(why); };
const CLAIMS: Claim[] = ['loss', 'win', 'draw'];
const PIECES = ['g', 's', 't'] as const;
const dirIndex = (dx: number, dy: number) => D8.findIndex(([a, b]) => a === (dx || 0) && b === (dy || 0));

/** The final position of a board, in canonical order (sorted by square, then kind). */
export function positionOf(w: World): [number, number][] {
  const out: [number, number][] = [];
  for (const k in w.tw) out.push([+k, w.tw[k] === 'C' ? 0 : 1]);
  for (const k in w.sq) { const s = w.sq[k]; out.push([+k, (s.o === 'C' ? 2 : 4) + (s.hp >= 2 ? 1 : 0)]); }
  for (const g of w.gl) { const d = dirIndex(g.dx, g.dy); if (d < 0) fail(`glider at ${g.x},${g.y} has no direction`); out.push([g.y * W + g.x, (g.o === 'C' ? 6 : 14) + d]); }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** A match's bytes. Throws on anything out of range: more than 255 pieces, turns or placements never wrap. */
export function encode(m: EncodedMatch): Uint8Array {
  const out: number[] = [];
  const u8 = (v: number, what: string) => { if (!Number.isInteger(v) || v < 0 || v > 255) fail(`${what} ${v} does not fit in a byte`); out.push(v); };
  u8(FORMAT_VERSION, 'version');
  if (!/^0x[0-9a-f]{64}$/.test(m.rulesetId)) fail(`ruleset ID ${m.rulesetId} is not a lowercase bytes32`);
  for (let i = 0; i < 32; i++) out.push(parseInt(m.rulesetId.slice(2 + 2 * i, 4 + 2 * i), 16));
  if (!Number.isInteger(m.n) || m.n < 0 || m.n > 0xffff_ffff) fail(`n ${m.n} does not fit in 4 bytes`);
  out.push((m.n >>> 24) & 255, (m.n >>> 16) & 255, (m.n >>> 8) & 255, m.n & 255);
  if (!/^0x[0-9a-f]{64}$/.test(m.seed)) fail(`seed ${m.seed} is not a lowercase bytes32`);
  for (let i = 0; i < 32; i++) out.push(parseInt(m.seed.slice(2 + 2 * i, 4 + 2 * i), 16));
  if (m.opponent.kind !== 'computer') fail('only computer opponents in format 1');
  u8(0, 'opponent kind');
  if (m.opponent.level > 5) fail(`level ${m.opponent.level}`);
  u8(m.opponent.level, 'level');
  const c = CLAIMS.indexOf(m.claim);
  if (c < 0) fail(`claim ${m.claim}`);
  u8(c, 'claim');
  if (m.end.kind !== 'end' && m.end.kind !== 'resign') fail(`end ${m.end.kind}`);
  u8(m.end.kind === 'end' ? 0 : 1, 'end');
  if (m.end.step > MAXS) fail(`end step ${m.end.step}`);
  u8(m.end.step, 'end step');
  u8(m.turns.length, 'turn count');
  for (const t of m.turns) {
    u8(t.length, 'placement count');
    for (const p of t) {
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) fail(`placement off the board at ${p.x},${p.y}`);
      const piece = PIECES.indexOf(p.t);
      if (piece < 0) fail(`piece ${p.t}`);
      const d = p.t === 'g' ? dirIndex(p.dx, p.dy) : (p.dx || p.dy ? -1 : 0);
      if (d < 0) fail(`placement at ${p.x},${p.y}: direction ${p.dx},${p.dy}`);
      out.push(p.y * W + p.x, (piece << 4) | d);
    }
  }
  const pos = m.position;
  u8(pos.length, 'piece count');
  for (let p = 1; p < pos.length; p++) {
    const [x, y] = [pos[p - 1], pos[p]];
    if (x[0] > y[0] || (x[0] === y[0] && x[1] > y[1])) fail('the position is not sorted by square, then kind');
  }
  let acc = 0, bits = 0;
  for (const [sq, kind] of pos) {
    if (!Number.isInteger(sq) || sq < 0 || sq >= W * H) fail(`position square ${sq}`);
    if (!Number.isInteger(kind) || kind < 0 || kind > 21) fail(`position kind ${kind}`);
    acc = (acc << 13) | (sq << 5) | kind;
    bits += 13;
    while (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; acc &= (1 << bits) - 1; }
  }
  if (bits) out.push((acc << (8 - bits)) & 255);
  return Uint8Array.from(out);
}

const hex = (b: Uint8Array) => '0x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Bytes to a match. Refuses truncated or trailing bytes, values out of range, and any non-canonical form. */
export function decode(bytes: Uint8Array): EncodedMatch {
  let i = 0;
  const take = (n: number) => { if (i + n > bytes.length) fail(`truncated at byte ${i}`); const v = bytes.subarray(i, i + n); i += n; return v; };
  const u8 = () => take(1)[0];
  if (u8() !== FORMAT_VERSION) fail(`format version ${bytes[0]}`);
  const rulesetId = hex(take(32)) as Hex;
  const s = take(4);
  const n = ((s[0] << 24) | (s[1] << 16) | (s[2] << 8) | s[3]) >>> 0;
  const seed = hex(take(32)) as Hex;
  if (u8() !== 0) fail('opponent kind');
  const level = u8();
  const claim = CLAIMS[u8()] ?? fail('claim');
  const ek = u8();
  if (ek > 1) fail('end kind');
  const end = { kind: ek === 0 ? 'end' as const : 'resign' as const, step: u8() };
  const turns: Placement[][] = [];
  for (let t = u8(); t > 0; t--) {
    const n = u8(), list: Placement[] = [];
    for (let j = 0; j < n; j++) {
      const [sq, b] = take(2);
      if (sq >= W * H) fail(`placement square ${sq}`);
      const piece = PIECES[b >> 4] ?? fail(`piece ${b >> 4}`);
      const d = b & 15;
      const [dx, dy] = piece === 'g' ? (D8[d] ?? fail(`direction ${d}`)) : [0, 0];
      list.push({ t: piece, o: 'C' as Side, x: sq % W, y: (sq / W) | 0, dx, dy });
    }
    turns.push(list);
  }
  const P = u8();
  const packed = take(Math.ceil((13 * P) / 8));
  const position: [number, number][] = [];
  let acc = 0, bits = 0, at = 0;
  for (let p = 0; p < P; p++) {
    while (bits < 13) { acc = (acc << 8) | packed[at++]; bits += 8; }
    const v = (acc >>> (bits - 13)) & 0x1fff;
    bits -= 13;
    acc &= (1 << bits) - 1;
    position.push([v >> 5, v & 31]);
  }
  if (i !== bytes.length) fail(`${bytes.length - i} trailing byte(s)`);
  const m: EncodedMatch = { rulesetId, n, seed, opponent: { kind: 'computer', level }, claim, end, turns, position };
  // One form only: what was read must re-encode to the same bytes (sorted position, zero padding, every field in range).
  let again: Uint8Array;
  try { again = encode(m); } catch (e) { return fail(`not canonical: ${(e as Error).message}`); }
  if (hex(again) !== hex(bytes)) fail('not canonical: re-encoding gives different bytes');
  return m;
}

export const matchHash = (bytes: Uint8Array) => keccak256(bytes);
export { hex as toHex };

/** A replayed solo match as an EncodedMatch: the claim and the final position as the replay found them. */
export function fromReplay(rulesetId: Hex, n: number, seed: Hex, solo: { level: number; turns: Placement[][]; end: { kind: 'end' } | { kind: 'resign'; step: number } }, r: { win: Side | 'D'; step: number; board: World }): EncodedMatch {
  return {
    rulesetId, n, seed, opponent: { kind: 'computer', level: solo.level },
    claim: r.win === 'C' ? 'win' : r.win === 'A' ? 'loss' : 'draw',
    end: { kind: solo.end.kind, step: r.step },
    turns: solo.turns.map((t) => t.map((p) => ({ t: p.t, o: 'C' as Side, x: p.x, y: p.y, dx: p.t === 'g' ? p.dx || 0 : 0, dy: p.t === 'g' ? p.dy || 0 : 0 }))),
    position: positionOf(r.board),
  };
}
