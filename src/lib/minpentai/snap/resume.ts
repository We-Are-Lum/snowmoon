/**
 * Each Farcaster ID's latest snap match, so the snap's first page can offer "Resume" after a dropped
 * page (owner, 2026-10-21). Only the seed, the computer player's level, the version and the
 * finished turns' placements: no taps, no pieces of an unfinished turn, no result. Practice only:
 * nothing here is a record of play, and nothing goes onchain. A match is dropped when it ends, and
 * any row is deleted 30 days after its last turn.
 *
 * Kept in studio.mp_snap_resume (DRAFT migration 0025, not applied) when the site's database is
 * configured; otherwise in this server instance's memory, which a cold start empties (the
 * separate test project has no environment variables, so Resume there only lasts while its
 * instance is warm). Best effort: a database error is logged and the game goes on without it.
 */
import { db } from '~/lib/db';
import { decMatch, encMatch, type P } from './moves';

export interface Saved { seed: number; lvl: number; ver: string; turns: P[][] }

const KEEP_DAYS = 30;
const memory = new Map<number, { saved: Saved; at: number }>();
let lastSweep = 0;

async function safe<T>(f: () => Promise<T>, fallback: T): Promise<T> {
  try { return await f(); } catch (e) { console.error('snap resume store', (e as Error).message); return fallback; }
}

export const load = (fid: number) => safe(() => loadNow(fid), null);
export const save = (fid: number, s: Saved) => safe(() => saveNow(fid, s), undefined);
export const drop = (fid: number) => safe(() => dropNow(fid), undefined);

async function loadNow(fid: number): Promise<Saved | null> {
  const sql = db();
  if (!sql) {
    const m = memory.get(fid);
    return m && Date.now() - m.at < KEEP_DAYS * 86_400_000 ? m.saved : null;
  }
  const rows = await sql<{ lvl: number; ver: string; moves: string }[]>`
    select lvl, ver, moves from studio.mp_snap_resume where fid = ${fid} and updated_at > now() - make_interval(days => ${KEEP_DAYS})`;
  const r = rows[0];
  const m = r && decMatch(r.moves);
  return m ? { ...m, lvl: r.lvl, ver: r.ver } : null;
}

async function saveNow(fid: number, s: Saved): Promise<void> {
  const sql = db();
  if (!sql) { memory.set(fid, { saved: structuredClone(s), at: Date.now() }); return; }
  const moves = encMatch(s.seed, s.turns);
  await sql`
    insert into studio.mp_snap_resume (fid, lvl, ver, moves) values (${fid}, ${s.lvl}, ${s.ver}, ${moves})
    on conflict (fid) do update set lvl = excluded.lvl, ver = excluded.ver, moves = excluded.moves, updated_at = now()`;
  // Retention without a cron: at most once per 10 minutes per instance.
  if (Date.now() - lastSweep > 600_000) {
    lastSweep = Date.now();
    await sql`delete from studio.mp_snap_resume where updated_at < now() - make_interval(days => ${KEEP_DAYS})`;
  }
}

async function dropNow(fid: number): Promise<void> {
  const sql = db();
  if (!sql) { memory.delete(fid); return; }
  await sql`delete from studio.mp_snap_resume where fid = ${fid}`;
}
