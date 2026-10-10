/**
 * What one player is sent (rules page §5): their own pieces anywhere, the rocks, and anything on a
 * square their towers light right now; the opponent's towers outside sight only as "last seen".
 * Each run frame is fogged by that player's towers in that frame. Never sent: the seed, the
 * opponent's placements before they appear, glider ids, any other square. Once the match is over,
 * the whole board at every step (rules §5: players see the true count at the end).
 */
import { MAXS, W, lit, world, type Side } from '../play-game/game';
import type { BoardView, LivePhase, MatchView, Person } from '../play-game/live-types';
import { GONE_MS, other, type LiveMatch, type Over } from './match';

const BLANK = world(true);

/** The squares `side` sees in board b: within R of their towers in b. */
export function sightOf(b: BoardView, side: Side, R: number): Set<number> {
  return lit(BLANK, side, R, b.tw.filter(([, o]) => o === side).map(([k]) => k));
}

export function fog(b: BoardView, side: Side, R: number): BoardView {
  const see = sightOf(b, side, R);
  return {
    step: b.step,
    rock: b.rock.slice(),
    tw: b.tw.filter(([k, o]) => o === side || see.has(k)),
    sq: b.sq.filter(([k, o]) => o === side || see.has(k)),
    // Sorted by square, so the order says nothing about when a glider was placed.
    gl: b.gl.filter(([x, y, , , o]) => o === side || see.has(y * W + x)).sort((a, c) => a[1] * W + a[0] - (c[1] * W + c[0]) || a[2] - c[2] || a[3] - c[3]),
    flash: b.flash.filter((k) => see.has(k)),
  };
}

const s = (n: number) => (n === 1 ? '' : 's');

/** The prototype's checkEnd and finish wording, for the player reading it. */
export function why(o: Over, you: Side, opp: string): string {
  const n = o.step, them = `@${opp}`;
  const mine = o.counts[you], theirs = o.counts[other(you)];
  switch (o.kind) {
    case 'end':
      if (!mine && !theirs) return `Both sides lost their last tower at step ${n}.`;
      if (!mine) return `Your last tower fell at step ${n}.`;
      if (!theirs) return `${them}'s last tower fell at step ${n}.`;
      return `Time ran out at step ${MAXS}. ${them} had ${theirs} tower${s(theirs)}, you had ${mine}.`;
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
  const opp = other(you), R = m.R, phase = phaseOf(m, now);
  const last = m.hist[m.hist.length - 1];
  const frames = m.runFrom === null ? [] : m.hist.slice(m.runFrom).map((b) => fog(b, you, R));
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
    phase,
    board: fog(last, you, R),
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
          why: why(o, you, meta.opponent.username),
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
