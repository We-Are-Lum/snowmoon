/**
 * Replays a person's solo match under a version (spike), the way the onchain branch's replaySolo
 * replays Play today: one rng for the match, whose first number draws the rule (a second draws the
 * switch's rule, if the version has one) and the rest go to the computer player; the computer
 * plans first each turn; the person's placements are checked against the version's rules.
 *
 * Pure. A version's ruleset manifest (manifest.ts) pins this file as its replay entry.
 */
import { drawRules, engine, layout, rng, verdict, type Kills, type Placement, type Side, type World } from './engine';
import type { Version } from './schema';

export class ReplayError extends Error {}
export const MAX_SEED = 0xffff_ffff;

export interface VersionMatch {
  seed: number;
  level: number;
  /** The person's (Cyan's) placements, one list per turn to act. */
  turns: { t: string; x: number; y: number; dx?: number; dy?: number }[][];
  end: { kind: 'end' } | { kind: 'resign'; step: number };
}
export interface Replayed { first: string | null; second: string | null; win: Side | 'D'; step: number; towers: Record<Side, number>; board: World; amber: Placement[][] }

export function replayVersion(v: Pick<Version, 'set' | 'drawn' | 'rocksAt'>, input: VersionMatch): Replayed {
  const { seed, level, turns, end } = input;
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw new ReplayError(`engine seed ${seed} is not 0 to 2^32 - 1`);
  if (!Number.isInteger(level) || level < 0 || level > 5) throw new ReplayError(`level ${level} is not 0-5`);
  const r = rng(seed);
  const { first, second, s1, s2 } = drawRules(v, r);
  if (end.kind === 'resign' && (!Number.isInteger(end.step) || end.step < 0 || end.step > s1.maxSteps)) throw new ReplayError(`resign step ${end.step} is out of range`);
  const L = layout(v, s1), e = engine(L);
  let s = s1;
  const w = e.world(s);
  const ls: Record<Side, Record<number, number>> = { C: {}, A: {} };
  L.towers.A.forEach((k) => (ls.C[k] = 0));
  L.towers.C.forEach((k) => (ls.A[k] = 0));
  const amber: Placement[][] = [];
  const saved: Record<Side, number> = { C: 0, A: 0 }, kills: Kills = { C: 0, A: 0 };
  const done = (win: Side | 'D'): Replayed => ({ first: first?.id ?? null, second: second?.id ?? null, win, step: w.step, towers: { C: e.towers(w, 'C').length, A: e.towers(w, 'A').length }, board: w, amber });
  const resignedAt = (st: number) => end.kind === 'resign' && end.step === st;
  let t = 0;
  for (;;) {
    if (s2 && s === s1 && w.step >= s1.switchAt) s = s2;
    const snap = { C: e.towers(w, 'C'), A: e.towers(w, 'A') };
    const base = w.step === 0 ? s.setupPoints : s.points;
    const budget = { C: base + saved.C, A: base + saved.A };
    const a = e.botPlan({ w, s, lvl: level, rng: r, budget: budget.A, snap, lsA: ls.A, diag: s.directions === 8 });
    amber.push(a);
    if (resignedAt(w.step)) {
      if (t !== turns.length) throw new ReplayError(`resigned at step ${w.step} with ${turns.length - t} turn(s) left over`);
      return done('A');
    }
    if (t >= turns.length) throw new ReplayError(`no placements for the turn to act at step ${w.step}`);
    const c: Placement[] = turns[t].map((p) => {
      if (p.t !== 'g' && p.t !== 's' && p.t !== 't') throw new ReplayError(`turn ${t + 1}: pieces are g, s and t`);
      return { t: p.t, o: 'C', x: p.x, y: p.y, dx: p.t === 'g' ? p.dx ?? 0 : 0, dy: p.t === 'g' ? p.dy ?? 0 : 0 };
    });
    const why = e.refuse(w, s, 'C', snap.C, budget.C, c);
    if (why) throw new ReplayError(`turn ${t + 1} (step ${w.step}): ${why}`);
    t++;
    for (const [o, ps] of [['C', c], ['A', a]] as const) saved[o] = Math.min(s.carryOver, budget[o] - ps.reduce((n, p) => n + e.cost(s, p.t), 0));
    e.apply(w, s, { C: c, A: a });
    e.updLS(w, s.sight, ls);
    const from = w.step;
    do {
      e.step(w, s, kills);
      e.updLS(w, s.sight, ls);
      const over = verdict(e, w, s, kills);
      if (over) {
        if (end.kind === 'resign') throw new ReplayError(`the match ended at step ${w.step}, before the resign at step ${end.step}`);
        if (t !== turns.length) throw new ReplayError(`the match ended at step ${w.step} with ${turns.length - t} turn(s) left over`);
        return done(over);
      }
      if (resignedAt(w.step) && w.step - from < s.every) {
        if (t !== turns.length) throw new ReplayError(`resigned at step ${w.step} with ${turns.length - t} turn(s) left over`);
        return done('A');
      }
    } while (w.step - from < s.every);
  }
}
