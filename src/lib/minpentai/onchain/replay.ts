/**
 * Onchain Minpentai v1 (spike, owner 2026-10-21): replay a finished solo match (a person as Cyan
 * against a computer player as Amber) from its inputs alone, exactly as the page plays it
 * (controller.ts: mk, beginAct, startRun, runTick, checkEnd, resign).
 *
 * Inputs: the seed, the computer player's level (0 practice, 1–5 the ladder's rungs), the
 * person's placements for every turn to act, and how it ended (played out, or resigned at a step).
 * Everything else follows from them: the drawn rule, the computer player's moves (botPlan, on the
 * match's one seeded rng, as the page does), every step, the result and the final board.
 *
 * Pure: no DOM, no clock, no network. The person's placements go through the one-on-one server's
 * own check (checkPlacements), so a replay refuses anything the rules don't allow.
 */
import { K, MAXS, RULE_IDS, apply, botPlan, rng, step, towers, updLS, world, type Placement, type RuleId, type Side, type World } from '../play-game/game';
import { checkPlacements, type LiveMatch } from '../play-server/match';

/** The seeds the page draws: (Date.now() % 1e6) | 0. */
export const MAX_SEED = 999_999;

export interface SoloMatch {
  seed: number;
  /** 0 practice, 1–5 the ladder's rungs. */
  level: number;
  /** The person's (Cyan's) placements, one list per turn to act, in order. */
  turns: Placement[][];
  /** Played to the end (a side lost its last tower, or step 96), or resigned at this step. */
  end: { kind: 'end' } | { kind: 'resign'; step: number };
}

export interface Replayed {
  rule: RuleId;
  /** 'C' the person won, 'A' the computer player won, 'D' a draw. Resigning is a loss ('A'). */
  win: Side | 'D';
  step: number;
  towers: Record<Side, number>;
  /** The board when the match ended. */
  board: World;
  /** The computer player's placements, one list per turn to act. */
  amber: Placement[][];
}

export class ReplayError extends Error {}

/** The rule the page draws for a seed: the first number of the match's rng (controller.ts mk). */
export function ruleFor(seed: number): RuleId {
  return RULE_IDS[Math.floor(rng(seed)() * RULE_IDS.length)];
}

export function replaySolo(input: SoloMatch): Replayed {
  const { seed, level, turns, end } = input;
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw new ReplayError(`seed ${seed} is not one the page draws (0–${MAX_SEED})`);
  if (!Number.isInteger(level) || level < 0 || level > 5) throw new ReplayError(`level ${level} is not 0–5`);
  if (end.kind === 'resign' && (!Number.isInteger(end.step) || end.step < 0 || end.step > MAXS)) throw new ReplayError(`resign step ${end.step} is not 0–${MAXS}`);
  // mk: one rng for the match; its first number draws the rule, the rest are the computer player's.
  const r = rng(seed);
  const rule = RULE_IDS[Math.floor(r() * RULE_IDS.length)];
  const R = rule === 'sight2' ? 2 : 3, every = rule === 'every8' ? 8 : 12, cost = rule === 'cost3' ? 3 : 4;
  const m = {
    lvl: level, rule, R, every, cost, rng: r, w: world(),
    pend: { C: [] as Placement[], A: [] as Placement[] },
    snap: { C: [] as number[], A: [] as number[] },
    lsC: { [K(13, 2)]: 0, [K(13, 7)]: 0 } as Record<number, number>,
    lsA: { [K(1, 2)]: 0, [K(1, 7)]: 0 } as Record<number, number>,
  };
  const amber: Placement[][] = [];
  const done = (win: Side | 'D'): Replayed => ({ rule, win, step: m.w.step, towers: { C: towers(m.w, 'C').length, A: towers(m.w, 'A').length }, board: m.w, amber });
  const resignedAt = (s: number) => end.kind === 'resign' && end.step === s;
  let t = 0;
  for (;;) {
    // beginAct: the computer player plans first, from the board as it stands.
    m.snap = { C: towers(m.w, 'C'), A: towers(m.w, 'A') };
    m.pend = { C: [], A: botPlan(m) };
    amber.push(m.pend.A);
    if (resignedAt(m.w.step)) {
      if (t !== turns.length) throw new ReplayError(`resigned at step ${m.w.step} with ${turns.length - t} turn(s) left over`);
      return done('A');
    }
    if (t >= turns.length) throw new ReplayError(`no placements for the turn to act at step ${m.w.step}`);
    try {
      m.pend.C = checkPlacements(m as unknown as LiveMatch, 'C', turns[t].map((p) => ({ ...p, o: 'C' })));
    } catch (e) {
      throw new ReplayError(`turn ${t + 1} (step ${m.w.step}): ${(e as Error).message}`);
    }
    t++;
    // startRun, then runTick until the next turn to act or the end (checkEnd).
    apply(m);
    updLS(m);
    do {
      step(m.w);
      updLS(m);
      const c = towers(m.w, 'C').length, a = towers(m.w, 'A').length;
      const over = !c || !a || m.w.step >= MAXS;
      if (over) {
        if (end.kind === 'resign') throw new ReplayError(`the match ended at step ${m.w.step}, before the resign at step ${end.step}`);
        if (t !== turns.length) throw new ReplayError(`the match ended at step ${m.w.step} with ${turns.length - t} turn(s) left over`);
        return done(!c && !a ? 'D' : !c ? 'A' : !a ? 'C' : c > a ? 'C' : a > c ? 'A' : 'D');
      }
      if (resignedAt(m.w.step) && m.w.step % every !== 0) {
        if (t !== turns.length) throw new ReplayError(`resigned at step ${m.w.step} with ${turns.length - t} turn(s) left over`);
        return done('A');
      }
    } while (m.w.step % every !== 0);
  }
}
