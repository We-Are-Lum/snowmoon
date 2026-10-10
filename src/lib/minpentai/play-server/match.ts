/**
 * One-on-one, as the server runs it: the whole match, hidden from both players (rules page §4–§7,
 * docs/design/minpentai-rules.dc.html). Pure: no DB, no clock; every function takes `now` (ms).
 *
 * The flow is Design's 'duel' in docs/design/minpentai-play-prototype.dc.html (mk, beginAct,
 * startRun, runTick, checkEnd, finish, leave, rematch), with Design's stand-in opponent replaced by
 * the second player, and its timers replaced by deadlines that any request resolves lazily
 * (advance): the act clock, a player not heard from for 15 s (pause), then 60 s more (gone).
 */
import {
  D4, D8, COST, K, MAXS, RULE_IDS, apply, clone, empty, inb, lit, rng, step, towers, updLS, world,
  type Piece, type Placement, type RuleId, type Side, type World,
} from '../play-game/game';
import type { BoardView } from '../play-game/live-types';

export const RULES_VERSION = 'play-rules-draft-1-2026-10-09';
/** Setup's turn to act, later turns, one step of playback (rules §4; the prototype's runT). */
export const SETUP_MS = 90_000;
export const TURN_MS = 45_000;
export const STEP_MS = 170;
/** Not heard from for 15 s pauses the match; 60 s more counts as resigning (rules §6). */
export const PAUSE_MS = 15_000;
export const GONE_MS = 60_000;
/** Both must ask for a rematch within 20 s of the end. */
export const REMATCH_MS = 20_000;
export const POINTS = 8;

export const other = (s: Side): Side => (s === 'C' ? 'A' : 'C');

export type EndKind = 'end' | 'resign' | 'left' | 'gone' | 'cancelled';
export interface Over {
  win: Side | 'D';
  kind: EndKind;
  /** Who resigned, left or did not come back. */
  by: Side | null;
  step: number;
  /** True tower counts at the end. */
  counts: Record<Side, number>;
  at: number;
  /** Nobody polled the match for 24 hours (the cleanup ended it): no result, kind 'cancelled'. */
  abandoned?: boolean;
}

export interface LiveMatch {
  rule: RuleId;
  R: number;
  every: number;
  cost: number;
  w: World;
  lsC: Record<number, number>;
  lsA: Record<number, number>;
  /** The whole board at every step (hist[i].step === i), for "watch it again" and the frames. */
  hist: BoardView[];
  /** The step the latest run began at (its first frame), or null before the first run. */
  runFrom: number | null;
  snap: Record<Side, number[]>;
  pend: Record<Side, Placement[]>;
  ended: Record<Side, boolean>;
  /** The turn to act opens at actStart (after the run's frames have played) and closes at deadline. */
  actStart: number;
  deadline: number;
  paused: { who: Side; since: number } | null;
  /** When the last pause ended (a second pause can't start before it). */
  resumedAt: number;
  /** When each player was last heard from (kept in columns by the store). */
  seen: Record<Side, number>;
  /** Every turn's placements, for the record. */
  moves: { step: number; C: Placement[]; A: Placement[] }[];
  over: Over | null;
  rm: { C: number | null; A: number | null; until: number; matchId: string | null } | null;
}

/** The whole board as a BoardView (no fog). */
export function fullBoard(w: World): BoardView {
  return {
    step: w.step,
    rock: Object.keys(w.rock).map(Number),
    tw: Object.keys(w.tw).map((k) => [+k, w.tw[+k]] as [number, Side]),
    sq: Object.keys(w.sq).map((k) => [+k, w.sq[+k].o, w.sq[+k].hp] as [number, Side, number]),
    gl: w.gl.map((g) => [g.x, g.y, g.dx, g.dy, g.o] as [number, number, number, number, Side]),
    flash: (w.flash || []).slice(),
  };
}

/** The rule, as the prototype's mk draws it: the first number of rng(seed). */
export function drawRule(seed: number): RuleId {
  const r = rng(seed);
  return RULE_IDS[Math.floor(r() * RULE_IDS.length)];
}

/** A new match (the prototype's mk, then beginAct for setup). */
export function createMatch(seed: number, now: number): LiveMatch {
  const rule = drawRule(seed);
  const w = world();
  const m: LiveMatch = {
    rule, R: rule === 'sight2' ? 2 : 3, every: rule === 'every8' ? 8 : 12, cost: rule === 'cost3' ? 3 : 4,
    w, lsC: {}, lsA: {}, hist: [], runFrom: null,
    snap: { C: [], A: [] }, pend: { C: [], A: [] }, ended: { C: false, A: false },
    actStart: now, deadline: now + SETUP_MS, paused: null, resumedAt: now, seen: { C: now, A: now },
    moves: [], over: null, rm: null,
  };
  // Starts are mirrored, so each side knows where the other's towers began (rules §5).
  m.lsC[K(13, 2)] = 0; m.lsC[K(13, 7)] = 0; m.lsA[K(1, 2)] = 0; m.lsA[K(1, 7)] = 0;
  m.hist.push(fullBoard(m.w));
  beginAct(m, now, SETUP_MS);
  return m;
}

function beginAct(m: LiveMatch, start: number, dur: number) {
  m.snap = { C: towers(m.w, 'C'), A: towers(m.w, 'A') };
  m.pend = { C: [], A: [] };
  m.ended = { C: false, A: false };
  m.actStart = start;
  m.deadline = start + dur;
}

/** The prototype's checkEnd, without the wording (see view.ts). */
export function checkEnd(w: World): Side | 'D' | null {
  const c = towers(w, 'C').length, a = towers(w, 'A').length;
  if (!c && !a) return 'D';
  if (!c) return 'A';
  if (!a) return 'C';
  if (w.step >= MAXS) return c > a ? 'C' : a > c ? 'A' : 'D';
  return null;
}

function finish(m: LiveMatch, win: Side | 'D', kind: EndKind, by: Side | null, at: number) {
  m.over = { win, kind, by, step: m.w.step, counts: { C: towers(m.w, 'C').length, A: towers(m.w, 'A').length }, at };
  m.paused = null;
  // No rematch after leaving, not coming back, or a cancelled setup (the prototype's finish).
  m.rm = kind === 'end' || kind === 'resign' ? { C: null, A: null, until: at + REMATCH_MS, matchId: null } : null;
}

const atSetup = (m: LiveMatch) => m.w.step === 0 && m.runFrom === null;

/**
 * The end of a turn to act at time t (both ended, or the clock ran out): both sides' placements
 * appear at once (apply), then the match runs on its own to the next turn to act or the end
 * (the prototype's startRun and runTick). What a player placed stands even if they did not end.
 */
export function resolveTurn(m: LiveMatch, t: number) {
  m.moves.push({ step: m.w.step, C: m.pend.C, A: m.pend.A });
  apply(m);
  updLS(m);
  m.hist[m.hist.length - 1] = fullBoard(m.w);
  m.runFrom = m.w.step;
  for (;;) {
    step(m.w);
    updLS(m);
    m.hist.push(fullBoard(m.w));
    const win = checkEnd(m.w);
    if (win) {
      m.pend = { C: [], A: [] };
      m.ended = { C: false, A: false };
      finish(m, win, 'end', null, t);
      return;
    }
    if (m.w.step % m.every === 0) {
      beginAct(m, t + (m.w.step - m.runFrom) * STEP_MS, TURN_MS);
      return;
    }
  }
}

/** Gone: counts as resigning, except during setup, where the match is cancelled with no result. */
function gone(m: LiveMatch, who: Side, at: number) {
  if (atSetup(m)) finish(m, 'D', 'cancelled', who, at);
  else finish(m, other(who), 'gone', who, at);
}

/**
 * Resolve, in time order, everything that has happened by `now`: act deadlines, a pause starting,
 * a paused player counting as gone. Returns whether anything changed.
 */
export function advance(m: LiveMatch, now: number): boolean {
  let changed = false;
  for (let guard = 0; guard < 64; guard++) {
    if (m.over) return changed;
    if (m.paused) {
      const goneAt = m.paused.since + GONE_MS;
      if (now >= goneAt) { gone(m, m.paused.who, goneAt); return true; }
      return changed;
    }
    const s: Side = m.seen.C <= m.seen.A ? 'C' : 'A';
    const pauseAt = Math.max(m.seen[s] + PAUSE_MS, m.resumedAt);
    if (m.deadline <= now && m.deadline <= pauseAt) { resolveTurn(m, m.deadline); changed = true; continue; }
    if (pauseAt <= now) { m.paused = { who: s, since: pauseAt }; changed = true; continue; }
    return changed;
  }
  return changed;
}

/**
 * A request from `side` at `now` (polling counts as being there). Resolves what is due first; a
 * paused player coming back resumes the match, and the clocks move on by the time it was paused.
 * Returns whether the match changed (the seen time alone is not a change).
 */
export function touch(m: LiveMatch, side: Side, now: number): boolean {
  let changed = advance(m, now);
  if (!m.over && m.paused && m.paused.who === side) {
    const d = now - m.paused.since;
    m.deadline += d;
    m.actStart += d;
    m.paused = null;
    m.resumedAt = now;
    changed = true;
  }
  m.seen[side] = Math.max(m.seen[side], now);
  return changed;
}

export class Refused extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}

/** Nobody polled the match for a day: it ends with no result (kind 'cancelled', abandoned). */
export function abandon(m: LiveMatch, at: number) {
  if (m.over) return;
  finish(m, 'D', 'cancelled', null, at);
  m.over!.abandoned = true;
}

export interface PlacementIn { t: Piece; x: number; y: number; dx: number; dy: number }

/**
 * Check a whole turn's placements for `side` (rules §4): pieces g, s, t; on the board; one piece a
 * square; empty; within R of a tower the player had when the turn began; 8 points under this
 * match's glider cost; directions straight, or diagonal too under the 'diag' rule. Throws Refused
 * (400) with the prototype's wording. Squares and towers carry no direction (dx = dy = 0).
 */
export function checkPlacements(m: LiveMatch, side: Side, list: unknown): Placement[] {
  if (!Array.isArray(list)) throw new Refused(400, 'Bad placements');
  if (list.length > POINTS) throw new Refused(400, 'Not enough points left this turn.');
  const zone = lit(m.w, side, m.R, m.snap[side]);
  const dirs = m.rule === 'diag' ? D8 : D4;
  const used = new Set<number>();
  const out: Placement[] = [];
  let pts = POINTS;
  for (const raw of list) {
    const p = (raw ?? {}) as Partial<PlacementIn>;
    if (p.t !== 'g' && p.t !== 's' && p.t !== 't') throw new Refused(400, 'Pieces are gliders, squares and towers.');
    const { x, y } = p;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inb(x!, y!)) throw new Refused(400, 'That square is not on the board.');
    const k = K(x!, y!);
    if (used.has(k)) throw new Refused(400, 'That square is taken.');
    if (!zone.has(k)) throw new Refused(400, `Place in the lit area: within ${m.R} squares of a tower you had when this turn began.`);
    if (!empty(m.w, k)) throw new Refused(400, 'That square is taken.');
    let dx = 0, dy = 0;
    if (p.t === 'g') {
      dx = p.dx as number; dy = p.dy as number;
      if (!dirs.some(([a, b]) => a === dx && b === dy)) {
        throw new Refused(400, m.rule === 'diag' ? 'Gliders fly in one of eight directions.' : 'Gliders fly up, down, left or right in this match.');
      }
    }
    pts -= p.t === 'g' ? m.cost : COST[p.t];
    if (pts < 0) throw new Refused(400, 'Not enough points left this turn.');
    used.add(k);
    out.push({ t: p.t, o: side, x: x!, y: y!, dx, dy });
  }
  return out;
}

/** Replace this turn's placements (TurnBody). Call touch first. Both ended → the turn resolves now. */
export function playTurn(m: LiveMatch, side: Side, body: unknown, now: number) {
  const b = (body ?? {}) as { placements?: unknown; ended?: unknown };
  if (m.over) throw new Refused(409, 'The match is over.');
  if (m.paused) throw new Refused(409, 'The match is paused.');
  if (now < m.actStart) throw new Refused(409, 'Your turn to act is over. Wait for the run to finish.');
  if (now >= m.deadline) throw new Refused(409, 'Time to act ran out.');
  m.pend[side] = checkPlacements(m, side, b.placements ?? []);
  m.ended[side] = b.ended === true;
  if (m.ended.C && m.ended.A) resolveTurn(m, now);
}

export function resign(m: LiveMatch, side: Side, now: number) {
  if (m.over) throw new Refused(409, 'The match is over.');
  finish(m, other(side), 'resign', side, now);
}

/** Leaving during setup cancels with no result; later it counts as resigning. */
export function leave(m: LiveMatch, side: Side, now: number) {
  if (m.over) throw new Refused(409, 'The match is over.');
  if (atSetup(m)) finish(m, 'D', 'cancelled', side, now);
  else finish(m, other(side), 'left', side, now);
}

/** Ask for a rematch. Returns true when both have asked within the 20 s (create the new match). */
export function askRematch(m: LiveMatch, side: Side, now: number): boolean {
  if (!m.over) throw new Refused(409, 'The match is not over.');
  if (!m.rm) throw new Refused(409, 'No rematch after this match.');
  if (m.rm.matchId) return false;
  if (now >= m.rm.until) throw new Refused(409, 'The rematch offer ran out.');
  if (m.rm[side] === null) m.rm[side] = now;
  return m.rm.C !== null && m.rm.A !== null;
}

/** For tests: a deep copy. */
export function copyMatch(m: LiveMatch): LiveMatch {
  const c = JSON.parse(JSON.stringify({ ...m, w: undefined })) as LiveMatch;
  c.w = clone(m.w);
  return c;
}
