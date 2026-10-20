/**
 * Computer players for Play, outside the page: the shape a player has, what it may see, and a
 * whole match between any two players with game.ts's own rules (world, apply, step, updLS) and the
 * one-on-one server's placement check (checkPlacements). Pure: no DOM, no clock, no network.
 *
 * A player is a function from what it sees to its placements for one turn to act. It always plays
 * as Amber ('A') and sees the board from Amber's side; when it sits in Cyan's seat, the board is
 * turned 180° and the colours swapped before it looks (the board, the rocks and the starts are
 * symmetric under that turn), and its placements are turned back.
 *
 * What a player sees (fogView): every rock; its own towers and squares; and every piece (towers,
 * squares, gliders, either side's) on a square within R of one of its towers (lit, counting
 * diagonals). Nothing else: not the opponent's placements this turn, not the seed. The five ladder
 * rungs (botPlan) are run through the same view; scripts/test-minpentai-players.ts checks that they
 * plan exactly as they do on the site.
 *
 * Used by scripts/minpentai-vs-rungs.ts (npm run minpentai:vs-rungs) and its test.
 */
import { H, K, MAXS, W, XY, apply, botPlan, clone, lit, rng, step, towers, updLS, world, type Placement, type RuleId, type Side, type World } from './game';
import { POINTS, checkPlacements, drawRule, type LiveMatch } from '../play-server/match';

/** What a player is given at each turn to act. It plays Amber ('A'); the opponent is Cyan ('C'). */
export interface PlayerView {
  /** The board as Amber sees it (fogView): a copy; changing it changes nothing. */
  w: World;
  /** Sight and placing distance: 3, or 2 under the 'sight2' rule. */
  R: number;
  /** A glider's cost: 4, or 3 under the 'cost3' rule. A square costs 1 and a tower 4 (COST). */
  cost: number;
  /** Steps between turns to act: 12, or 8 under the 'every8' rule. */
  every: number;
  /** This match's drawn rule (RULES in game.ts). */
  rule: RuleId;
  /** Points to spend this turn (8). Unspent points are lost. */
  points: number;
  /** Amber's towers when this turn began: place only on empty squares within R of these. */
  mine: number[];
  /** Where Amber last saw each of Cyan's towers: square (K(x, y)) → step. It may be gone. */
  lastSeen: Record<number, number>;
  /** This player's own seeded random numbers. */
  rng: () => number;
}

/** A player: one turn's placements. Gliders take dx, dy (straight; diagonal too under 'diag'); squares and towers 0, 0. */
export type Player = (view: PlayerView) => Placement[];

/** Ladder rung n (1–5, or 0 for practice's level) as a Player: botPlan, given only the view. */
export const rung = (n: number): Player => (v) =>
  botPlan({ w: v.w, lvl: n, R: v.R, rng: v.rng, cost: v.cost, every: v.every, rule: v.rule, snap: { A: v.mine, C: [] }, lsA: v.lastSeen });

/** What side `me` sees: every rock, its own towers and squares, and every piece within R of its towers. */
export function fogView(w: World, me: Side, R: number): World {
  const see = lit(w, me, R);
  const v = world(true);
  v.step = w.step;
  v.nid = w.nid;
  for (const k in w.rock) v.rock[k] = 1;
  for (const k in w.tw) if (w.tw[k] === me || see.has(+k)) v.tw[k] = w.tw[k];
  for (const k in w.sq) if (w.sq[k].o === me || see.has(+k)) v.sq[k] = { ...w.sq[k] };
  v.gl = w.gl.filter((g) => see.has(K(g.x, g.y))).map((g) => ({ ...g, tx: undefined, ty: undefined, stay: undefined, dead: undefined }));
  return v;
}

const rx = (x: number) => W - 1 - x, ry = (y: number) => H - 1 - y;
const swap = (o: Side): Side => (o === 'C' ? 'A' : 'C');
/** A square turned 180°. */
export const turnKey = (k: number) => { const [x, y] = XY(k); return K(rx(x), ry(y)); };
/** The board turned 180° with the colours swapped: Cyan's side seen as Amber's. */
export function turned(w: World): World {
  const m = clone(w);
  m.tw = {}; m.sq = {}; m.rock = {};
  for (const k in w.tw) m.tw[turnKey(+k)] = swap(w.tw[k]);
  for (const k in w.sq) m.sq[turnKey(+k)] = { ...w.sq[k], o: swap(w.sq[k].o) };
  for (const k in w.rock) m.rock[turnKey(+k)] = 1;
  m.gl = w.gl.map((g) => ({ ...g, o: swap(g.o), x: rx(g.x), y: ry(g.y), dx: -g.dx || 0, dy: -g.dy || 0 }));
  m.flash = w.flash.map(turnKey);
  return m;
}
const turnedKeys = (o: Record<number, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [turnKey(+k), v]));

/** A player's turn that was refused (an illegal placement, or the player threw). */
export class PlayerError extends Error {
  constructor(public side: Side, public step: number, why: string) { super(`${side === 'C' ? 'Cyan' : 'Amber'} at step ${step}: ${why}`); }
}

export interface MatchResult {
  win: Side | 'D';
  /** The step the match ended at. */
  step: number;
  rule: RuleId;
  /** Towers standing at the end. */
  towers: Record<Side, number>;
  /** Every turn's placements, as placed on the real board. */
  moves: { step: number; C: Placement[]; A: Placement[] }[];
}

/**
 * One match, seeded. The rule is drawn from the seed as the one-on-one server draws it (drawRule),
 * and Amber's random numbers continue from that draw, as a practice or ladder match on the page
 * does with the same seed (controller.ts, mk). Cyan's are their own (rng(seed ^ 0x5eed)).
 * Ends as the page's checkEnd does: a side with no towers loses (both at once: a draw); at step
 * 96 (MAXS) most towers wins, equal is a draw.
 */
export function playMatch(cyan: Player, amber: Player, seed: number): MatchResult {
  const rule = drawRule(seed);
  const rA = rng(seed);
  rA(); // the draw above
  const rC = rng((seed ^ 0x5eed) >>> 0);
  const R = rule === 'sight2' ? 2 : 3, every = rule === 'every8' ? 8 : 12, cost = rule === 'cost3' ? 3 : 4;
  const m = {
    w: world(), R, rule, cost,
    lsC: { [K(13, 2)]: 0, [K(13, 7)]: 0 } as Record<number, number>,
    lsA: { [K(1, 2)]: 0, [K(1, 7)]: 0 } as Record<number, number>,
    pend: { C: [] as Placement[], A: [] as Placement[] },
    snap: { C: [] as number[], A: [] as number[] },
  };
  const moves: MatchResult['moves'] = [];
  const ask = (side: Side, p: Player, v: PlayerView): Placement[] => {
    try {
      const out = p(v);
      if (!Array.isArray(out)) throw new Error('a player returns an array of placements');
      return out;
    } catch (e) {
      throw new PlayerError(side, m.w.step, (e as Error).message);
    }
  };
  const legal = (side: Side, list: Placement[]) => {
    try { return checkPlacements(m as unknown as LiveMatch, side, list); } catch (e) { throw new PlayerError(side, m.w.step, (e as Error).message); }
  };
  for (;;) {
    const w = m.w;
    m.snap = { C: towers(w, 'C'), A: towers(w, 'A') };
    const a = ask('A', amber, { w: fogView(w, 'A', R), R, cost, every, rule, points: POINTS, mine: m.snap.A.slice(), lastSeen: { ...m.lsA }, rng: rA });
    const tw = turned(w);
    const c = ask('C', cyan, { w: fogView(tw, 'A', R), R, cost, every, rule, points: POINTS, mine: m.snap.C.map(turnKey), lastSeen: turnedKeys(m.lsC), rng: rC });
    const back = c.map((p) => ({ ...p, o: 'C' as Side, x: rx(p.x), y: ry(p.y), dx: -p.dx || 0, dy: -p.dy || 0 }));
    m.pend = { C: legal('C', back), A: legal('A', a.map((p) => ({ ...p, o: 'A' as Side }))) };
    moves.push({ step: w.step, C: m.pend.C, A: m.pend.A });
    apply(m);
    updLS(m);
    do {
      step(m.w);
      updLS(m);
      const nc = towers(m.w, 'C').length, na = towers(m.w, 'A').length;
      const end = (win: Side | 'D'): MatchResult => ({ win, step: m.w.step, rule, towers: { C: nc, A: na }, moves });
      if (!nc && !na) return end('D');
      if (!nc) return end('A');
      if (!na) return end('C');
      if (m.w.step >= MAXS) return end(nc > na ? 'C' : na > nc ? 'A' : 'D');
    } while (m.w.step % every !== 0);
  }
}

export interface Tally { win: number; draw: number; loss: number; refused: string[] }
/**
 * `player` against `opponent` over n seeds in each seat: as Amber on seeds from, from+1, …; as
 * Cyan on seeds from+10000, …. A refused turn ends that match as a loss and is listed.
 */
export function tally(player: Player, opponent: Player, n: number, from = 1): Tally {
  const t: Tally = { win: 0, draw: 0, loss: 0, refused: [] };
  const add = (r: Side | 'D', me: Side) => { if (r === 'D') t.draw++; else if (r === me) t.win++; else t.loss++; };
  for (let i = 0; i < n; i++) {
    for (const me of ['A', 'C'] as Side[]) {
      const seed = from + i + (me === 'C' ? 10000 : 0);
      try {
        const r = me === 'A' ? playMatch(opponent, player, seed) : playMatch(player, opponent, seed);
        add(r.win, me);
      } catch (e) {
        if (!(e instanceof PlayerError)) throw e;
        if (e.side === me) { t.loss++; t.refused.push(`seed ${seed}: ${e.message}`); }
        else throw e;
      }
    }
  }
  return t;
}
