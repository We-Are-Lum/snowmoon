/**
 * A snap match replayed from its inputs (state.ts) with the site's engine: the flow of Play's
 * practice match (controller.ts: mk, beginAct, startRun, runTick, checkEnd) and of the onchain
 * spike's replaySolo (minpentai-onchain branch, src/lib/minpentai/onchain/replay.ts), which this
 * follows step for step. One rng per match: its first number draws the rule, the computer player
 * takes the rest in order. The person's placements go through the one-on-one server's own check
 * (checkPlacements), so the snap allows exactly what the site allows.
 *
 * Pure: no clock, no network. scripts/test-minpentai-snap.ts plays the same seeds through
 * PlayController and checks every board matches.
 */
import { K, MAXS, RULE_IDS, apply, botPlan, rng, step, towers, updLS, world, type Placement, type RuleId, type Side, type World } from '../play-game/game';
import type { BoardView } from '../play-game/live-types';
import { checkPlacements, fullBoard, type LiveMatch } from '../play-server/match';
import { fog } from '../play-server/view';
import type { P } from './state';
import { settings, versionOf } from './versions';

export interface Run {
  /** Frame 0 is the turn's placements appearing; then one frame a step. Fogged for Cyan. */
  frames: BoardView[];
  /** Where Cyan last saw Amber's towers, at each frame. */
  ls: Record<number, number>[];
  /** The same frames unfogged: shown only once the match is over. */
  full: BoardView[];
}

export interface Played {
  drawn: RuleId;
  rule: RuleId;
  R: number;
  every: number;
  cost: number;
  /** The board now: at the current turn to act, or where the match ended. */
  w: World;
  /** Cyan's towers when this turn to act began: where it may place. */
  snapC: number[];
  lsC: Record<number, number>;
  runs: Run[];
  /** The match the way checkPlacements reads it, for checking this turn's placements. */
  live: LiveMatch;
  over: null | { win: Side | 'D'; step: number; counts: Record<Side, number>; kind: 'end' | 'resign' };
}

export class Unplayable extends Error {}

export function play(input: { seed: number; lvl: number; ver: string; rule: RuleId | ''; turns: P[][]; resigned: boolean }): Played {
  const r = rng(input.seed);
  const drawn = RULE_IDS[Math.floor(r() * RULE_IDS.length)];
  const set = settings(drawn, versionOf(input.ver), input.rule);
  const m = {
    lvl: input.lvl, ...set, rng: r, w: world(),
    pend: { C: [] as Placement[], A: [] as Placement[] },
    snap: { C: [] as number[], A: [] as number[] },
    lsC: { [K(13, 2)]: 0, [K(13, 7)]: 0 } as Record<number, number>,
    lsA: { [K(1, 2)]: 0, [K(1, 7)]: 0 } as Record<number, number>,
  };
  const runs: Run[] = [];
  const out = (over: Played['over']): Played => ({
    drawn, ...set, w: m.w, snapC: m.snap.C, lsC: m.lsC, runs, live: m as unknown as LiveMatch, over,
  });
  const counts = () => ({ C: towers(m.w, 'C').length, A: towers(m.w, 'A').length });
  for (let t = 0; ; t++) {
    // beginAct: the computer player plans first, from the board as it stands.
    m.snap = { C: towers(m.w, 'C'), A: towers(m.w, 'A') };
    m.pend = { C: [], A: botPlan(m) };
    if (t === input.turns.length) {
      return out(input.resigned ? { win: 'A', step: m.w.step, counts: counts(), kind: 'resign' } : null);
    }
    try {
      m.pend.C = checkPlacements(m as unknown as LiveMatch, 'C', input.turns[t]);
    } catch (e) {
      throw new Unplayable(`turn ${t + 1}: ${(e as Error).message}`);
    }
    // startRun, then runTick until the next turn to act or the end.
    apply(m);
    updLS(m);
    const b0 = fullBoard(m.w);
    const run: Run = { frames: [fog(b0, 'C', m.R)], ls: [{ ...m.lsC }], full: [b0] };
    runs.push(run);
    for (;;) {
      step(m.w);
      updLS(m);
      const b = fullBoard(m.w);
      run.frames.push(fog(b, 'C', m.R));
      run.ls.push({ ...m.lsC });
      run.full.push(b);
      const { C: c, A: a } = counts();
      if (!c || !a || m.w.step >= MAXS) {
        if (t + 1 !== input.turns.length) throw new Unplayable(`the match ended at step ${m.w.step} with turns left over`);
        return out({ win: !c && !a ? 'D' : !c ? 'A' : !a ? 'C' : c > a ? 'C' : a > c ? 'A' : 'D', step: m.w.step, counts: { C: c, A: a }, kind: 'end' });
      }
      if (m.w.step % m.every === 0) break;
    }
  }
}

/** Check this turn's placements as the site would. Returns the refusal, or null. */
export function refusal(p: Played, pend: P[]): string | null {
  try {
    checkPlacements(p.live, 'C', pend);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
