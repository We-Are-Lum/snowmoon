/**
 * Sample solo matches for the onchain tests (onchain v1 spike): a seeded stand-in for the person
 * that places random legal pieces, played through replaySolo, and a digest of everything a match
 * produces. Used in Node (scripts/test-minpentai-onchain.ts) and, bundled, in Chromium, so both
 * must give the same digest.
 */
import { COST, D4, D8, empty, lit, rng, type Placement, type RuleId, type World } from '../play-game/game';
import { keccak256, toBytes } from 'viem';
import { replaySolo, ruleFor, type SoloMatch } from './replay';

/** A stand-in person: random legal placements for Cyan, from its own seeded numbers. */
export function randomTurn(w: World, R: number, rule: RuleId, cost: number, mine: number[], r: () => number): Placement[] {
  const zone = [...lit(w, 'C', R, mine)].filter((k) => empty(w, k));
  const dirs = rule === 'diag' ? D8 : D4;
  const out: Placement[] = [];
  let pts = 8;
  for (let tries = 0; tries < 6 && zone.length; tries++) {
    const t = (['g', 'g', 's', 't'] as const)[Math.floor(r() * 4)];
    const c = t === 'g' ? cost : COST[t];
    if (c > pts) continue;
    const k = zone.splice(Math.floor(r() * zone.length), 1)[0];
    const [dx, dy] = t === 'g' ? dirs[Math.floor(r() * dirs.length)] : [0, 0];
    out.push({ t, o: 'C', x: k % 15, y: (k / 15) | 0, dx, dy });
    pts -= c;
  }
  return out;
}

/**
 * Play a match with the stand-in, turn by turn, through replaySolo's own rules: replaySolo is
 * called with the turns so far until it asks for none more. `resignAfter` (a turn count) resigns
 * at that turn's step instead of placing.
 */
export function sampleMatch(seed: number, level: number, resignAfter?: number): SoloMatch {
  const person = rng((seed * 7919 + level) >>> 0);
  const turns: Placement[][] = [];
  const rule = ruleFor(seed);
  const R = rule === 'sight2' ? 2 : 3, cost = rule === 'cost3' ? 3 : 4;
  for (;;) {
    try {
      replaySolo({ seed, level, turns, end: { kind: 'end' } });
      return { seed, level, turns, end: { kind: 'end' } };
    } catch (e) {
      const at = /no placements for the turn to act at step (\d+)/.exec((e as Error).message);
      if (!at) throw e;
      if (resignAfter !== undefined && turns.length >= resignAfter) return { seed, level, turns, end: { kind: 'resign', step: +at[1] } };
      // The board at this turn: replay with a resign here to get it.
      const b = replaySolo({ seed, level, turns, end: { kind: 'resign', step: +at[1] } }).board;
      const mine = Object.keys(b.tw).filter((k) => b.tw[+k] === 'C').map(Number);
      turns.push(randomTurn(b, R, rule, cost, mine, person));
    }
  }
}

/** Everything a replay produces, as one hash: the result, the computer's moves, the final board. */
export function digest(ms: SoloMatch[]): string {
  const parts = ms.map((m) => {
    const r = replaySolo(m);
    const b = r.board;
    return JSON.stringify([m.seed, m.level, r.rule, r.win, r.step, r.towers, r.amber, Object.entries(b.tw), Object.entries(b.sq), b.gl.map((g) => [g.x, g.y, g.dx || 0, g.dy || 0, g.o])]);
  });
  return keccak256(toBytes(parts.join('\n')));
}

/** The fixed set both Node and the browser hash: every level, 20 seeds, some resigned. */
export function fixedSet(): SoloMatch[] {
  const out: SoloMatch[] = [];
  for (let level = 0; level <= 5; level++) for (let i = 0; i < 20; i++) {
    const seed = (i * 49999 + level * 1009) % 1_000_000;
    out.push(sampleMatch(seed, level, i % 7 === 3 ? 2 + (i % 3) : undefined));
  }
  return out;
}

/** Engine seeds at the edges of the 32-bit range (owner, 2026-10-21), then random ones across all of it. */
export const EDGE_SEEDS = [0, 1, 999_999, 1_000_000, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1];
export function fullRangeSeeds(randomCount = 40): number[] {
  const r = rng(0xfeedbeef);
  const out = [...EDGE_SEEDS];
  for (let i = 0; i < randomCount; i++) out.push(Math.floor(r() * 2 ** 32));
  return out;
}
/** Every full-range seed at every level (played out), plus some resigned. */
export function fullRangeSet(): SoloMatch[] {
  const out: SoloMatch[] = [];
  fullRangeSeeds().forEach((seed, i) => {
    for (let level = 0; level <= 5; level++) out.push(sampleMatch(seed, level, (i + level) % 11 === 5 ? 1 + (i % 3) : undefined));
  });
  return out;
}
