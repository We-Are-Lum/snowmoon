/**
 * What one player is sent (rules page §5): their own pieces anywhere, the rocks, and anything on a
 * square their towers light right now; the opponent's towers outside sight only as "last seen".
 * Each run frame is fogged by that player's towers in that frame. Never sent: the seed, the
 * opponent's placements before they appear, glider ids, any other square. Once the match is over,
 * the whole board at every step (rules §5: players see the true count at the end).
 */
import { MAXS, type Side } from '../play-game/game';
import type { BoardView, LivePhase, LiveRules, MatchView, Person } from '../play-game/live-types';
import type { Engine } from '../versions/engine';
import { BASE, type Settings } from '../versions/schema';
import { SOLO_V1_ENGINE, drawnOf, type VersionRules } from '../versions/solo-v1';
import { GONE_MS, other, rulesOf, type LiveMatch, type Over } from './match';

/** The squares `side` sees in board b: within R of their towers in b (on Play's board unless an engine is given). */
export function sightOf(b: BoardView, side: Side, R: number, e: Engine = SOLO_V1_ENGINE): Set<number> {
  return e.lit(e.world(BASE, true), side, R, b.tw.filter(([, o]) => o === side).map(([k]) => k));
}

export function fog(b: BoardView, side: Side, R: number, e: Engine = SOLO_V1_ENGINE): BoardView {
  const see = sightOf(b, side, R, e), W = e.W;
  return {
    step: b.step,
    rock: b.rock.slice(),
    tw: b.tw.filter(([k, o]) => o === side || see.has(k)),
    // Only what is in sight, a side's own squares and gliders too (owner, 2026-10-31): an own glider out of sight
    // would show where it bounced off a hidden piece, and an own square's hits left a hidden glider's hit. Own
    // towers are always in sight (they make it).
    sq: b.sq.filter(([k]) => see.has(k)),
    // Sorted by square, so the order says nothing about when a glider was placed.
    gl: b.gl.filter(([x, y]) => see.has(y * W + x)).sort((a, c) => a[1] * W + a[0] - (c[1] * W + c[0]) || a[2] - c[2] || a[3] - c[3]),
    flash: b.flash.filter((k) => see.has(k)),
  };
}

const s = (n: number) => (n === 1 ? '' : 's');

/** The prototype's checkEnd and finish wording, for the player reading it. */
export function why(o: Over, you: Side, opp: string, maxSteps = MAXS): string {
  const n = o.step, them = `@${opp}`;
  const mine = o.counts[you], theirs = o.counts[other(you)];
  switch (o.kind) {
    case 'end':
      if (!mine && !theirs) return `Both sides lost their last tower at step ${n}.`;
      if (!mine) return `Your last tower fell at step ${n}.`;
      if (!theirs) return `${them}'s last tower fell at step ${n}.`;
      return `Time ran out at step ${maxSteps}. ${them} had ${theirs} tower${s(theirs)}, you had ${mine}.`;
    case 'resign':
      return o.by === you ? `You resigned at step ${n}. It counts as a loss.` : `${them} resigned at step ${n}.`;
    case 'left':
      return o.by === you ? `You left at step ${n}. Leaving counts as resigning.` : `${them} left at step ${n}. Leaving counts as resigning.`;
    case 'gone':
      return o.by === you
        ? "You didn't come back within 60 seconds. That counts as resigning."
        : `${them} didn't come back within 60 seconds. That counts as resigning.`;
    case 'cancelled':
      return o.abandoned ? 'Nobody came back to this match for a day, so it ended with no result.' : 'Match cancelled during setup. No result.';
  }
}

export function phaseOf(m: LiveMatch, now: number): LivePhase {
  if (m.over) return 'over';
  if (m.paused) return 'paused';
  return now < m.actStart ? 'run' : 'act';
}

/** MatchView for `you`. Call after touch()/advance() at the same `now`. */
export function viewFor(m: LiveMatch, you: Side, now: number, meta: { id: string; version: number; opponent: Person }): MatchView {
  const opp = other(you), R = m.R, phase = phaseOf(m, now), { e, s: st } = rulesOf(m);
  const last = m.hist[m.hist.length - 1];
  const frames = m.runFrom === null ? [] : m.hist.slice(m.runFrom).map((b) => fog(b, you, R, e));
  const live = phase === 'act' || phase === 'run' || phase === 'paused';
  const o = m.over;
  return {
    id: meta.id,
    version: meta.version,
    you,
    opponent: meta.opponent,
    rule: m.rule,
    R,
    every: m.every,
    cost: m.cost,
    rules: liveRules(m.version, m.rule, st, e),
    phase,
    board: fog(last, you, R, e),
    snap: m.snap[you].slice(),
    lastSeen: { ...(you === 'C' ? m.lsC : m.lsA) },
    frames,
    mine: o ? [] : m.pend[you].map(({ t, x, y, dx, dy }) => ({ t, x, y, dx, dy })),
    ended: live && m.ended[you],
    oppEnded: live && m.ended[opp],
    msLeft: o ? null : Math.max(0, m.deadline - (m.paused ? m.paused.since : now)),
    paused: m.paused && !o ? { who: m.paused.who === you ? 'you' : 'opponent', msLeft: Math.max(0, m.paused.since + GONE_MS - now) } : null,
    result: o
      ? {
          win: o.win,
          why: why(o, you, meta.opponent.username, st.maxSteps),
          kind: o.kind,
          step: o.step,
          replay: m.hist.map((b) => ({ ...b, rock: b.rock.slice(), tw: b.tw.slice(), sq: b.sq.slice(), gl: b.gl.slice(), flash: b.flash.slice() })),
          rematch: m.rm
            ? { mine: m.rm[you] !== null, theirs: m.rm[opp] !== null, msLeft: Math.max(0, m.rm.until - now), matchId: m.rm.matchId }
            : { mine: false, theirs: false, msLeft: 0, matchId: null },
        }
      : null,
    serverNow: now,
  };
}

/** A match's rules for the page (LiveRules). */
export function liveRules(v: VersionRules | undefined, rule: string, s: Settings, e: Engine): LiveRules {
  const d = v ? drawnOf(v).find((x) => x.id === rule) : drawnOf({ set: {} }).find((x) => x.id === rule);
  return {
    W: e.W, H: e.H, ruleText: d?.text ?? 'No new rule this match.',
    setupPoints: s.setupPoints, points: s.points, cost: { g: s.costGlider, s: s.costSquare, t: s.costTower },
    maxSteps: s.maxSteps, directions: s.directions === 8 ? 8 : 4, sight: s.sight, reach: s.reach, startTowers: e.L.towers.C.length,
  };
}
