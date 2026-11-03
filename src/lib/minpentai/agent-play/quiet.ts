import 'server-only';
import { after } from 'next/server';
import { planComputer, QUIET_MS, type SoloMatch } from './solo';
import { load, save, StoreError } from './store';

/**
 * When a turn's answers may come, so that their timing says nothing about the dark (owner, 2026-11-01, after the
 * production check found a final submit's time growing with the computer's hidden towers):
 *
 * - The site computer plans its orders for a turn as soon as the turn opens, after the answer that opened it has been
 *   sent (planSoon, Next's after()), and they are stored with the match.
 * - Nothing about the match is answered before QUIET_MS after the turn opened (settle): every call, the person's view,
 *   the sandbox, every submission and the live link. Planning takes CPU on the same server, so a call during it would
 *   otherwise run slower and show that the computer is still planning; inside the quiet time every call waits the
 *   same, whether or not planning has finished.
 * - If the plan isn't stored by then (planning ran long, or ran on another server), the call plans it itself, logs it,
 *   and its wait is rounded up to the next whole second after the turn opened.
 */
export { QUIET_MS };

const sleepUntil = async (t: number) => { const ms = t - Date.now(); if (ms > 0) await new Promise((r) => setTimeout(r, ms)); };

/** Plans the computer's orders for the open turn just after this answer is sent. Never seen by the player. */
export function planSoon(id: string) {
  after(async () => {
    for (let i = 0; i < 3; i++) {
      const r = await load(id);
      if (!r || r.m.end || r.m.pend.A) return;
      const t0 = Date.now();
      planComputer(r.m, new Date().toISOString());
      const ms = Date.now() - t0;
      try {
        await save(r.m, r.version);
        console.log('minpentai agent play: computer planned', JSON.stringify({ ms, level: r.m.level, ruleset: r.m.ruleset, turn: r.m.turn, opened_ago_ms: Date.now() - r.m.openedAt }));
        return;
      } catch (e) {
        if (!(e instanceof StoreError)) throw e; // someone saved in between: load again
      }
    }
  });
}

/**
 * A match, read after its quiet time: waits until QUIET_MS after the turn opened; then, if the computer's orders
 * still aren't stored, plans and stores them here and rounds the wait up to the next whole second.
 */
export async function settle(id: string): Promise<{ m: SoloMatch; version: number } | null> {
  let r = await load(id);
  if (!r) return null;
  const opened = r.m.openedAt ?? 0;
  await sleepUntil(opened + QUIET_MS);
  r = await load(id);
  if (!r || r.m.end || r.m.pend.A) return r;
  // Late: the plan isn't in. Make it here (the same orders the computer would have stored: they follow from the board
  // and its committed random value), store it, and wait to a whole second after the turn opened.
  for (let i = 0; i < 3 && r && !r.m.pend.A; i++) {
    planComputer(r.m, new Date().toISOString());
    try { await save(r.m, r.version); } catch (e) { if (!(e instanceof StoreError)) throw e; }
    r = await load(id);
  }
  const elapsed = Date.now() - opened;
  console.log('minpentai agent play: planning ran past the quiet time', JSON.stringify({ elapsed_ms: elapsed, quiet_ms: QUIET_MS, level: r?.m.level, ruleset: r?.m.ruleset }));
  await sleepUntil(opened + Math.ceil(elapsed / 1000) * 1000);
  return r;
}
