/**
 * A snap match as it was played before 2026-11-03, when the computer still planned on the whole board: the frozen
 * game.ts (scripts/fixtures/minpentai/game-2026-10-21.ts, ruleset 1) for Amber, at the snap's level, on the real board;
 * the person (Cyan) played by the same frozen computer at `personLvl` on the board turned for its seat. It follows
 * snap/match.ts play() step for step (one rng: its first number draws the rule, the computer takes the rest), so its
 * `turns` are exactly what a snap link or a kept match of that time held.
 *
 * Used by scripts/test-minpentai-snap.ts for old links that no longer replay (owner, 2026-11-03: option 3).
 */
import * as G from '../fixtures/minpentai/game-2026-10-21';
import { settings } from '../../src/lib/minpentai/snap/versions';

type P = { t: G.Piece; x: number; y: number; dx: number; dy: number };
const rk = (k: number) => G.W * G.H - 1 - k;
const swap = (o: G.Side): G.Side => (o === 'C' ? 'A' : 'C');
function turned(w: G.World): G.World {
  const m = G.clone(w);
  m.tw = {}; m.sq = {}; m.rock = {};
  for (const k in w.tw) m.tw[rk(+k)] = swap(w.tw[k]);
  for (const k in w.sq) m.sq[rk(+k)] = { ...w.sq[k], o: swap(w.sq[k].o) };
  for (const k in w.rock) m.rock[rk(+k)] = 1;
  m.gl = w.gl.map((g) => ({ ...g, o: swap(g.o), x: G.W - 1 - g.x, y: G.H - 1 - g.y, dx: -g.dx, dy: -g.dy }));
  return m;
}

export function oldSnapMatch(seed: number, lvl: number, personLvl = 3): { turns: P[][]; win: G.Side | 'D'; step: number } {
  const r = G.rng(seed), set = settings(G.RULE_IDS[Math.floor(r() * G.RULE_IDS.length)], null, '');
  const m = { w: G.world(), R: set.R, lsC: { [G.K(13, 2)]: 0, [G.K(13, 7)]: 0 } as Record<number, number>, lsA: { [G.K(1, 2)]: 0, [G.K(1, 7)]: 0 } as Record<number, number>, pend: { C: [] as G.Placement[], A: [] as G.Placement[] } };
  const person = G.rng(seed ^ 0x77), turns: P[][] = [];
  for (;;) {
    const snap = { C: G.towers(m.w, 'C'), A: G.towers(m.w, 'A') };
    const a = G.botPlan({ w: m.w, lvl, R: set.R, rng: r, cost: set.cost, every: set.every, rule: set.rule, snap, lsA: m.lsA });
    const c = G.botPlan({ w: turned(m.w), lvl: personLvl, R: set.R, rng: person, cost: set.cost, every: set.every, rule: set.rule, snap: { C: snap.A.map(rk), A: snap.C.map(rk) }, lsA: Object.fromEntries(Object.entries(m.lsC).map(([k, v]) => [rk(+k), v])) })
      .map((p) => ({ ...p, o: 'C' as G.Side, x: G.W - 1 - p.x, y: G.H - 1 - p.y, dx: -p.dx || 0, dy: -p.dy || 0 }));
    m.pend = { C: c, A: a };
    turns.push(c.map((p) => ({ t: p.t, x: p.x, y: p.y, dx: p.dx, dy: p.dy })));
    G.apply(m); G.updLS(m);
    for (;;) {
      G.step(m.w); G.updLS(m);
      const nc = G.towers(m.w, 'C').length, na = G.towers(m.w, 'A').length;
      if (!nc || !na || m.w.step >= G.MAXS) return { turns, win: !nc && !na ? 'D' : !nc ? 'A' : !na ? 'C' : nc > na ? 'C' : na > nc ? 'A' : 'D', step: m.w.step };
      if (m.w.step % set.every === 0) break;
    }
  }
}
