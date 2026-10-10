/**
 * The computer ladder's progress (owner, 2026-10-09: a new private table keyed by FID, readable
 * only by that person through the server). The matches run in the browser; the server checks the
 * rung is open and records the try: tries + 1; the first win records its step; a win on rung n
 * opens rung n + 1 (up to 5); a loss or a draw opens nothing. The prototype's finish, for 'ladder'.
 */
import { MAXS } from '../play-game/game';
import type { LadderProgress } from '../play-game/live-types';
import { Refused } from './match';

export const RUNGS = 5;
export const freshProgress = (): LadderProgress => ({ opened: 1, rec: {} });

/** A stored row's progress, cleaned (unknown keys dropped). */
export function readProgress(opened: unknown, rec: unknown): LadderProgress {
  const o = Math.min(RUNGS, Math.max(1, Number(opened) || 1));
  const out: LadderProgress = { opened: o, rec: {} };
  const r = (rec && typeof rec === 'object' ? rec : {}) as Record<string, { tries?: unknown; won?: unknown }>;
  for (let n = 1; n <= RUNGS; n++) {
    const e = r[n];
    if (!e) continue;
    const tries = Number(e.tries) || 0;
    out.rec[n] = Number.isInteger(e.won) ? { tries, won: e.won as number } : { tries };
  }
  return out;
}

/** Apply one result (LadderResultBody). Throws Refused: 400 for a bad body, 409 for a rung not open. */
export function recordResult(prog: LadderProgress, body: unknown): LadderProgress {
  const b = (body ?? {}) as { rung?: unknown; win?: unknown; step?: unknown };
  const rung = b.rung, win = b.win, st = b.step;
  if (!Number.isInteger(rung) || (rung as number) < 1 || (rung as number) > RUNGS) throw new Refused(400, 'Bad rung');
  if (win !== 'C' && win !== 'A' && win !== 'D') throw new Refused(400, 'Bad result');
  if (!Number.isInteger(st) || (st as number) < 0 || (st as number) > MAXS) throw new Refused(400, 'Bad step');
  const n = rung as number;
  if (n > prog.opened) throw new Refused(409, 'That rung is not open yet. Beat the one before it first.');
  const rec = { ...prog.rec };
  const r = { ...(rec[n] || { tries: 0 }) };
  r.tries = (r.tries || 0) + 1;
  if (win === 'C' && r.won === undefined) r.won = st as number;
  rec[n] = r;
  const opened = win === 'C' ? Math.max(prog.opened, Math.min(RUNGS, n + 1)) : prog.opened;
  return { opened, rec };
}
