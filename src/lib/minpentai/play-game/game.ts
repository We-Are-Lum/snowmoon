/**
 * The Play game's names, kept for the code that still imports them: since 2026-10-21 every rule
 * here runs on the one engine (versions/engine.ts) under Play today's settings (versions/solo-v1.ts).
 * New code should use the engine and a version directly; this file goes once nothing imports it
 * (the snap still does).
 *
 * The rules are invented for this edition, as Claude Design's rules page sets them
 * (docs/design/minpentai-rules.dc.html, draft 1), first ported line for line from Design's mockup
 * (docs/design/minpentai-play-prototype.dc.html). That port, frozen, is
 * scripts/fixtures/minpentai/game-2026-10-21.ts; scripts/test-minpentai-versions.ts proves the
 * engine plays exactly as it did, and scripts/test-minpentai-play.ts still runs Design's own
 * functions beside these. It is not the book's rule (engine.ts, from figure c4-b5 / c4-b7) and not
 * Learn's game (learn-game/).
 *
 * Names are Design's: W, H, MAXS, ROCKS, D4, D8, RULES, RUNGS, COST, K, XY, inb, rng, world,
 * clone, towers, lit, empty, step, botPlan, apply, updLS.
 */
import { BASE, BASE_DRAWN } from '../versions/schema';
import { RULESETS, SOLO_V1_ENGINE as E, SOLO_V1_LAYOUT, maxStepsOf, settingsFor, type RulesetId } from '../versions/solo-v1';
import type { Placement, Side, World } from '../versions/engine';

export { rng, fmt } from './rng';
export type { Glider, Placement, Piece, Side, Square, World } from '../versions/engine';

export const W = SOLO_V1_LAYOUT.W;
export const H = SOLO_V1_LAYOUT.H;
/** solo-v1's step limit (96), frozen; a match's own limit is maxStepsOf(its ruleset). */
export const MAXS = BASE.maxSteps;
export { maxStepsOf, type RulesetId };
export const ROCKS: [number, number][] = SOLO_V1_LAYOUT.rocks.map((k) => [k % W, (k / W) | 0]);
export const COL: Record<Side, string> = { C: '#46D7E8', A: '#FFB43A' };
export const AR: Record<string, string> = { '1,0': '→', '-1,0': '←', '0,-1': '↑', '0,1': '↓', '1,-1': '↗', '1,1': '↘', '-1,1': '↙', '-1,-1': '↖' };
/** An arrow turned a quarter left: the board drawn upright (full screen on a phone). */
export const ROT: Record<string, string> = { '→': '↑', '↑': '←', '←': '↓', '↓': '→', '↗': '↖', '↖': '↙', '↙': '↘', '↘': '↗' };
export const D4: [number, number][] = [[-1, 0], [0, -1], [0, 1], [1, 0]];
export const D8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export type RuleId = 'diag' | 'cost3' | 'sight2' | 'every8';
/** The four new rules; one is drawn at the start of every practice, ladder and one-on-one match. */
export const RULES = Object.fromEntries(BASE_DRAWN.map((d) => [d.id, d.text])) as Record<RuleId, string>;
export const RULE_IDS = Object.keys(RULES) as RuleId[];
/** The computer ladder's five rungs (index 1–5). Names, behaviours and order are Design's. */
export const RUNGS: ({ n: string; d: string } | null)[] = [
  null,
  { n: 'Rival', d: 'Fires one glider a turn at a tower it can see. Never defends.' },
  { n: 'Blocker', d: 'Also puts squares in front of gliders it sees coming.' },
  { n: 'Builder', d: 'Also builds towers to see and reach further, and aims off rocks.' },
  { n: 'Opportunist', d: "Also uses the match's new rule against you." },
  { n: 'Planner', d: 'Tests its moves ahead on what it can see, and fires twice when it can.' },
];
/**
 * The search computer's ladder (ruleset 3, owner 2026-10-31): seven rungs, index 1–7 (versions/search.ts ladderLevel):
 * the beginner, Easy, Fair, then levels 1–4. Model-drafted wording.
 */
export const SEARCH_RUNGS: ({ n: string; d: string } | null)[] = [
  null,
  { n: 'Beginner', d: 'Places one piece a turn, often without a plan. Most first players beat it.' },
  { n: 'Easy', d: 'Places two pieces a turn, sometimes without a plan. About as strong as the old Builder.' },
  { n: 'Fair', d: 'Places up to three pieces a turn and seldom slips. About as strong as the old Planner.' },
  { n: 'Level 1', d: 'Tries its moves on the board as it sees it, up to three pieces a turn. Slips now and then.' },
  { n: 'Level 2', d: 'Looks a few steps past the next turn, and covers its towers.' },
  { n: 'Level 3', d: 'Looks twelve steps past the next turn. Rarely slips.' },
  { n: 'Level 4', d: 'Looks furthest and never slips.' },
];
/** A ladder's rungs by ruleset: the search computer's six under 3, the old five otherwise. */
export const rungsOf = (rs: number) => (rs === 3 ? SEARCH_RUNGS : RUNGS);
/** Square 1, tower 4; a glider's cost is the match's (4, or 3 under the cost rule). */
export const COST = { s: BASE.costSquare, t: BASE.costTower } as const;

export const K = E.K;
export const XY = E.XY;
export const inb = E.inb;

/** The practice board (rocks, two towers each, mirrored), or an empty one. */
export const world = (empty?: boolean): World => E.world(BASE, empty);
export const clone = E.clone;
export const towers = E.towers;
/** Squares within R (counting diagonals) of player o's towers, or of the towers given. */
export const lit = E.lit;
export const empty = E.empty;
/** One step, rules page §3: all gliders at once. Mutates and returns w. */
export const step = (w: World): World => E.step(w, BASE);

/** What botPlan needs of a match. */
export interface PlanInput {
  w: World;
  /** 0 practice, 1–5 the ladder's rungs, 3 Design's stand-in opponent. */
  lvl: number;
  R: number;
  rng: () => number;
  cost: number;
  every: number;
  /** The drawn rule's id (one of RULE_IDS in Play; any other id draws nothing). */
  rule: string;
  /** Each side's towers when the turn to act began (where it may place). */
  snap: Record<Side, number[]>;
  /** Where Amber last saw each of Cyan's towers (square → step). */
  lsA: Record<number, number>;
  /** The match's ruleset (solo-v1.ts RULESETS); absent means 1, the frozen original. */
  ruleset?: RulesetId;
}

/** The computer player (Amber): sees only what its towers light (rules page §8). */
export function botPlan(m: PlanInput): Placement[] {
  const s = { ...settingsFor(RULESETS[m.ruleset ?? 1], m.rule), sight: m.R, reach: m.R, every: m.every, costGlider: m.cost };
  return E.botPlan({ w: m.w, s, lvl: m.lvl, rng: m.rng, budget: BASE.points, snap: m.snap, lsA: m.lsA, diag: m.rule === 'diag' });
}

/** Both sides' placements appear at once; two on one square cancel each other (rules page §4). */
export const apply = (m: { w: World; pend: Record<Side, Placement[]> }) => E.apply(m.w, BASE, m.pend);

/** "Last seen": where each side last saw the other's towers (rules page §5). */
export const updLS = (m: { w: World; R: number; lsC: Record<number, number>; lsA: Record<number, number> }) => E.updLS(m.w, m.R, { C: m.lsC, A: m.lsA });
