/**
 * Computer players for Play, outside the page: the shape a player has, what it may see, and a
 * whole match between any two players with Play's own engine (versions/engine.ts, under Play today
 * or any version) and the one-on-one server's placement check (checkPlacements). Pure: no DOM, no
 * clock, no network.
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
import { rng, type Placement, type Side, type World } from './game';
import { checkPlacements, type LiveMatch } from '../play-server/match';
import { drawRules, verdict, type Engine, type Kills } from '../versions/engine';
import type { Settings } from '../versions/schema';
import { BASE } from '../versions/schema';
import { PLAY, RULESETS, SOLO_V1_ENGINE, engineFor, engineForSize, rulesetOfRules, settingsFor, type RulesetId, type VersionRules } from '../versions/solo-v1';

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
  /** This match's drawn rule's id (RULES in game.ts under Play; a version's own ids otherwise). */
  rule: string;
  /** Points to spend this turn (8). Unspent points are lost. */
  points: number;
  /** Amber's towers when this turn began: place only on empty squares within R of these. */
  mine: number[];
  /** Where Amber last saw each of Cyan's towers: square (K(x, y)) → step. It may be gone. */
  lastSeen: Record<number, number>;
  /** This player's own seeded random numbers. */
  rng: () => number;
}

/** Under a player-made version, the view also carries every setting in force and the board's size.
 * Only the site's own computer players read these for now; the documented view (agents.md) is PlayerView. */
type VersionView = PlayerView & { settings?: Settings; W?: number; H?: number; /** Play's ruleset, when the match runs under one (solo-v1.ts RULESETS). */ ruleset?: RulesetId };

/** A player: one turn's placements. Gliders take dx, dy (straight; diagonal too under 'diag'); squares and towers 0, 0. */
export type Player = (view: PlayerView) => Placement[];

/** Ladder rung n (1–5, or 0 for practice's level) as a Player: botPlan, given only the view. */
export const rung = (n: number): Player => (view) => {
  const v = view as VersionView, s = v.settings ?? settingsOfView(v), e = v.W && v.H ? engineForSize(v.W, v.H) : SOLO_V1_ENGINE;
  return e.botPlan({ w: v.w, s, lvl: n, rng: v.rng, budget: v.points, snap: { A: v.mine, C: [] }, lsA: v.lastSeen, diag: s.directions === 8 });
};
/** Play's settings for a view that names only R, cost, every and the rule (players written before versions):
 * the match's ruleset when the view carries one, else Play today's. */
function settingsOfView(v: PlayerView): Settings {
  const s = settingsFor((v as VersionView).ruleset ? RULESETS[(v as VersionView).ruleset!] : PLAY, v.rule);
  return { ...s, sight: v.R, reach: v.R, every: v.every, costGlider: v.cost };
}

/** What side `me` sees: every rock, its own towers and squares, and every piece within R of its towers. */
export function fogView(w: World, me: Side, R: number, e: Engine = SOLO_V1_ENGINE): World {
  const see = e.lit(w, me, R);
  const v = e.world(BASE, true);
  v.step = w.step;
  v.nid = w.nid;
  for (const k in w.rock) v.rock[k] = w.rock[k];
  for (const k in w.tw) if (w.tw[k] === me || see.has(+k)) v.tw[k] = w.tw[k];
  for (const k in w.sq) if (w.sq[k].o === me || see.has(+k)) v.sq[k] = { ...w.sq[k] };
  v.gl = w.gl.filter((g) => see.has(e.K(g.x, g.y))).map((g) => ({ ...g, tx: undefined, ty: undefined, stay: undefined, dead: undefined }));
  return v;
}

const swap = (o: Side): Side => (o === 'C' ? 'A' : 'C');
/** A square turned 180° on the board of engine e. */
const turnOn = (e: Engine) => (k: number) => e.W * e.H - 1 - k;
/** A square turned 180° (on Play's board). */
export const turnKey = (k: number) => turnOn(SOLO_V1_ENGINE)(k);
/** The board turned 180° with the colours swapped: Cyan's side seen as Amber's (on Play's board unless an engine is given). */
export function turned(w: World, e: Engine = SOLO_V1_ENGINE): World {
  const m = e.clone(w), tk = turnOn(e);
  m.tw = {}; m.sq = {}; m.rock = {};
  for (const k in w.tw) m.tw[tk(+k)] = swap(w.tw[k]);
  for (const k in w.sq) m.sq[tk(+k)] = { ...w.sq[k], o: swap(w.sq[k].o) };
  for (const k in w.rock) m.rock[tk(+k)] = w.rock[k];
  m.gl = w.gl.map((g) => ({ ...g, o: swap(g.o), x: e.W - 1 - g.x, y: e.H - 1 - g.y, dx: -g.dx || 0, dy: -g.dy || 0 }));
  m.flash = w.flash.map(tk);
  return m;
}

/** A player's turn that was refused (an illegal placement, or the player threw). */
export class PlayerError extends Error {
  constructor(public side: Side, public step: number, why: string) { super(`${side === 'C' ? 'Cyan' : 'Amber'} at step ${step}: ${why}`); }
}

export interface MatchResult {
  win: Side | 'D';
  /** The step the match ended at. */
  step: number;
  rule: string;
  /** Towers standing at the end. */
  towers: Record<Side, number>;
  /** Every turn's placements, as placed on the real board. */
  moves: { step: number; C: Placement[]; A: Placement[] }[];
}

/**
 * One match, seeded, under Play today or the version given. The rule is drawn from the seed as the
 * one-on-one server draws it, and Amber's random numbers continue from that draw, as a practice or
 * ladder match on the page does with the same seed (controller.ts, mk). Cyan's are their own
 * (rng(seed ^ 0x5eed)). Ends as the page's checkEnd does: a side with no towers loses (both at
 * once: a draw); at the version's last step (120 in Play) most towers wins, equal is a draw.
 */
export function playMatch(cyan: Player, amber: Player, seed: number, version: VersionRules = PLAY): MatchResult {
  const rA = rng(seed);
  const { first, second, s1, s2 } = drawRules(version, rA);
  const rC = rng((seed ^ 0x5eed) >>> 0);
  const e = engineFor(version, s1), rs = rulesetOfRules(version), solo = rs !== null;
  let s = s1, rule = first?.id ?? '';
  const m = {
    w: e.world(s1), R: s.sight, rule, cost: s.costGlider, every: s.every,
    ...((solo ? { ruleset: rs! } : { version, saved: { C: 0, A: 0 } }) as { ruleset?: RulesetId; version?: VersionRules; saved?: Record<Side, number> }),
    lsC: Object.fromEntries(e.L.towers.A.map((k) => [k, 0])) as Record<number, number>,
    lsA: Object.fromEntries(e.L.towers.C.map((k) => [k, 0])) as Record<number, number>,
    pend: { C: [] as Placement[], A: [] as Placement[] },
    snap: { C: [] as number[], A: [] as number[] },
  };
  const kills: Kills = { C: 0, A: 0 };
  const moves: MatchResult['moves'] = [];
  const ask = (side: Side, p: Player, v: PlayerView): Placement[] => {
    try {
      const out = p(v);
      if (!Array.isArray(out)) throw new Error('a player returns an array of placements');
      return out;
    } catch (err) {
      throw new PlayerError(side, m.w.step, (err as Error).message);
    }
  };
  const legal = (side: Side, list: Placement[]) => {
    try { return checkPlacements(m as unknown as LiveMatch, side, list); } catch (err) { throw new PlayerError(side, m.w.step, (err as Error).message); }
  };
  const tk = turnOn(e);
  for (;;) {
    if (s2 && second && s === s1 && m.w.step >= s1.switchAt) { s = s2; rule = second.id; Object.assign(m, { rule, R: s.sight, cost: s.costGlider, every: s.every }); }
    const w = m.w;
    m.snap = { C: e.towers(w, 'C'), A: e.towers(w, 'A') };
    const pts = (o: Side) => (w.step === 0 ? s.setupPoints : s.points) + (m.saved?.[o] ?? 0);
    const view = (o: Side, board: World, mine: number[], lastSeen: Record<number, number>, r: () => number): VersionView =>
      ({ w: fogView(board, 'A', s.sight, e), R: s.sight, cost: s.costGlider, every: s.every, rule, points: pts(o), mine, lastSeen, rng: r, ...(solo ? { ruleset: rs! } : { settings: s, W: e.W, H: e.H }) });
    const a = ask('A', amber, view('A', w, m.snap.A.slice(), { ...m.lsA }, rA));
    const c = ask('C', cyan, view('C', turned(w, e), m.snap.C.map(tk), Object.fromEntries(Object.entries(m.lsC).map(([k, v]) => [tk(+k), v])), rC));
    const back = c.map((p) => ({ ...p, o: 'C' as Side, x: e.W - 1 - p.x, y: e.H - 1 - p.y, dx: -p.dx || 0, dy: -p.dy || 0 }));
    m.pend = { C: legal('C', back), A: legal('A', a.map((p) => ({ ...p, o: 'A' as Side }))) };
    moves.push({ step: w.step, C: m.pend.C, A: m.pend.A });
    if (m.saved) for (const o of ['C', 'A'] as const) m.saved[o] = Math.min(s.carryOver, pts(o) - m.pend[o].reduce((n, p) => n + e.cost(s, p.t), 0));
    e.apply(m.w, s, m.pend);
    e.updLS(m.w, s.sight, { C: m.lsC, A: m.lsA });
    const from = m.w.step;
    do {
      e.step(m.w, s, kills);
      e.updLS(m.w, s.sight, { C: m.lsC, A: m.lsA });
      const win = verdict(e, m.w, s, kills);
      if (win) return { win, step: m.w.step, rule, towers: { C: e.towers(m.w, 'C').length, A: e.towers(m.w, 'A').length }, moves };
    } while (m.w.step - from < s.every);
  }
}

export interface Tally { win: number; draw: number; loss: number; refused: string[] }
/**
 * `player` against `opponent` over n seeds in each seat: as Amber on seeds from, from+1, …; as
 * Cyan on seeds from+10000, …. A refused turn ends that match as a loss and is listed.
 */
export function tally(player: Player, opponent: Player, n: number, from = 1, version: VersionRules = PLAY): Tally {
  const t: Tally = { win: 0, draw: 0, loss: 0, refused: [] };
  const add = (r: Side | 'D', me: Side) => { if (r === 'D') t.draw++; else if (r === me) t.win++; else t.loss++; };
  for (let i = 0; i < n; i++) {
    for (const me of ['A', 'C'] as Side[]) {
      const seed = from + i + (me === 'C' ? 10000 : 0);
      try {
        const r = me === 'A' ? playMatch(opponent, player, seed, version) : playMatch(player, opponent, seed, version);
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
