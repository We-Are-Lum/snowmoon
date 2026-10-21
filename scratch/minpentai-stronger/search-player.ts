/**
 * SCRATCH (design spike, not wired into the game): a Minpentai computer player that picks its
 * placements by simulating the real engine (game.ts world/apply/step/lit, match.ts checkPlacements)
 * instead of hand-written habits. See docs/proposals/minpentai-stronger-computer.md.
 *
 * It sees only the fog view players.ts gives every player. Its belief board is that view plus the
 * enemy towers it last saw. Candidates are every single placement the engine's own placement check
 * accepts; a turn is built greedily, one placement at a time, keeping the addition whose simulated
 * future scores best. Deterministic: no clock, budgets counted in simulations, ties broken by order
 * and by the view's seeded rng only.
 */
import { COST, D8, K, MAXS, XY, apply, clone, lit, step, towers, type Placement, type World } from '../../src/lib/minpentai/play-game/game';
import { checkPlacements, type LiveMatch } from '../../src/lib/minpentai/play-server/match';
import { rung, turnKey, turned, type Player, type PlayerView } from '../../src/lib/minpentai/play-game/players';

export interface SearchLevel {
  /** Extra steps simulated past the next turn to act (0 = just this interval). */
  horizon: number;
  /** Simulate the opponent's next turn with a simple model (rung 1 on the turned belief board). */
  opponentModel: boolean;
  /** Chance per decision to pick the 2nd or 3rd best addition instead of the best (deliberate mistakes). */
  mistake: number;
  /** Keep only every k-th candidate (1 = all): a smaller, noisier search. */
  sampleEvery: number;
  /** Most simulations per turn (a hard budget, counted, never timed). */
  budget: number;
}
export const LEVELS: Record<number, SearchLevel> = {
  1: { horizon: 0, opponentModel: false, mistake: 0.35, sampleEvery: 4, budget: 300 },
  2: { horizon: 0, opponentModel: false, mistake: 0.15, sampleEvery: 2, budget: 600 },
  3: { horizon: 12, opponentModel: false, mistake: 0.05, sampleEvery: 1, budget: 1500 },
  4: { horizon: 24, opponentModel: true, mistake: 0, sampleEvery: 1, budget: 2500 },
  5: { horizon: 36, opponentModel: true, mistake: 0, sampleEvery: 1, budget: 4000 },
};

/** The board as this player believes it: what it sees, plus enemy towers where it last saw them. */
function belief(v: PlayerView): World {
  const b = clone(v.w);
  for (const k in v.lastSeen) if (!b.tw[+k]) b.tw[+k] = 'C';
  return b;
}

/** Score a simulated board for Amber: towers are the score and the sight; lit area and live gliders count a little. */
function score(w: World, R: number): number {
  const a = towers(w, 'A').length, c = towers(w, 'C').length;
  if (!a && !c) return 0;
  if (!c) return 10_000 - w.step; // a win, sooner is better
  if (!a) return -10_000 + w.step;
  const sight = lit(w, 'A', R).size;
  const myGliders = w.gl.filter((g) => g.o === 'A').length;
  return 100 * (a - c) + 0.5 * sight + 2 * myGliders;
}

export function searchPlayer(levelN: number): Player {
  const L = LEVELS[levelN];
  return (v: PlayerView): Placement[] => {
    const base = belief(v);
    const m = { w: base, R: v.R, rule: v.rule, cost: v.cost, every: v.every, snap: { A: v.mine, C: [] as number[] }, pend: { C: [] as Placement[], A: [] as Placement[] } };
    // Every single placement the engine's own check accepts (pieces from COST and the glider; all 8 directions, the check filters).
    const zone = [...lit(base, 'A', v.R, v.mine)].sort((x, y) => x - y);
    const singles: Placement[] = [];
    for (const k of zone) {
      const [x, y] = XY(k);
      for (const p of [...D8.map(([dx, dy]) => ({ t: 'g' as const, dx, dy })), { t: 's' as const, dx: 0, dy: 0 }, { t: 't' as const, dx: 0, dy: 0 }]) {
        const pl: Placement = { t: p.t, o: 'A', x, y, dx: p.dx, dy: p.dy };
        try { checkPlacements(m as unknown as LiveMatch, 'A', [pl]); singles.push(pl); } catch { /* not legal */ }
      }
    }
    const cands = singles.filter((_, i) => i % L.sampleEvery === 0);
    let sims = 0, steps = 0;
    // Simulate: apply our placements (and, at higher levels, a modelled opponent turn), run to the next turn + horizon.
    const simulate = (ours: Placement[]): number => {
      sims++;
      const sw = clone(base);
      const mm = { w: sw, pend: { C: [] as Placement[], A: ours } };
      apply(mm);
      const until = Math.min(MAXS, sw.step + v.every + L.horizon);
      let nextTurn = sw.step + v.every;
      while (sw.step < until) {
        step(sw);
        steps++;
        if (!towers(sw, 'A').length || !towers(sw, 'C').length) break;
        if (L.opponentModel && sw.step === nextTurn && sw.step < until) {
          // The opponent replies as a simple player would, from its side of our belief board.
          const tv = turned(sw);
          const reply = rung(1)({ w: tv, R: v.R, cost: v.cost, every: v.every, rule: v.rule, points: 8, mine: towers(tv, 'A'), lastSeen: {}, rng: () => 0.5 });
          const back = reply.map((p) => ({ ...p, o: 'C' as const, x: 14 - p.x, y: 9 - p.y, dx: -p.dx || 0, dy: -p.dy || 0 }));
          apply({ w: sw, pend: { C: back, A: [] } });
          nextTurn += v.every;
        }
      }
      return score(sw, v.R);
    };
    const chosen: Placement[] = [];
    let points = v.points, current = simulate([]);
    for (;;) {
      if (sims >= L.budget) break;
      const used = new Set(chosen.map((p) => K(p.x, p.y)));
      const options: { p: Placement; s: number }[] = [];
      for (const p of cands) {
        if (sims >= L.budget) break;
        const c = p.t === 'g' ? v.cost : COST[p.t];
        if (c > points || used.has(K(p.x, p.y))) continue;
        try { checkPlacements(m as unknown as LiveMatch, 'A', [...chosen, p]); } catch { continue; }
        options.push({ p, s: simulate([...chosen, p]) });
      }
      if (!options.length) break;
      options.sort((a, b) => b.s - a.s); // stable: ties keep candidate order
      let pick = options[0];
      if (L.mistake > 0 && v.rng() < L.mistake) pick = options[Math.min(options.length - 1, 1 + Math.floor(v.rng() * 2))];
      if (pick.s <= current && pick === options[0]) break; // nothing helps
      chosen.push(pick.p);
      current = pick.s;
      points -= pick.p.t === 'g' ? v.cost : COST[pick.p.t];
    }
    lastSims = sims;
    lastSteps = steps;
    return chosen;
  };
}
export let lastSims = 0;
export let lastSteps = 0;
void turnKey;
