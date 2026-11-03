import 'server-only';
import type postgres from 'postgres';
import { handleFor } from './adaptation-pages';

/**
 * Admin picks (owner, 2026-10-29; principle 5 as reread that day): an admin's pick of the image shown first for a moment
 * (c<chapter>-b<block>) or a glossary term. One of only three places that may read studio.admin_picks (P5e: this file,
 * the pick switch and /api/admin/picks): a pick is shown labelled "Picked by @…" with the reader's switch, and orders
 * nothing else. Append-only: the latest row per target counts; image_kind 'none' clears a pick. Until the owner applies
 * 0030_admin_picks, the table doesn't exist and every read here answers "no picks".
 */
type Sql = postgres.Sql;
export type PickTargetKind = 'moment' | 'term';
export type PickImageKind = 'seeded' | 'reader' | 'sheet';
export interface Pick {
  targetKind: PickTargetKind;
  target: string;
  imageKind: PickImageKind;
  imageRef: string;
  byFid: number;
  /** The picker's handle, for the label "Picked by @handle". */
  by: string;
  at: string;
}

export const MOMENT = /^c([0-9]{1,2})-b([0-9]{1,4})$/;
export const TERM = /^[a-z0-9-]{1,80}$/;

/**
 * Where 0030_admin_picks is missing (a local database without it), the table is missing: remembered for a minute, so readers' pages don't each
 * send a query that can only fail (the server has one database connection; 120 failing reads queued behind a slow one
 * in the UI check, 2026-10-30). A read that takes over 3 seconds is given up: no picks shown, the page as it was.
 */
let missingUntil = 0;
const LIMIT_MS = 3000;
async function within<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error('picks: the read took over 3 s')), LIMIT_MS)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** The current pick for each target matching `where` (a chapter's moments, one term, or every term). */
export async function currentPicks(sql: Sql, where: { chapter: number } | { term: string } | { terms: true }): Promise<Pick[]> {
  if (Date.now() < missingUntil) return [];
  try {
    const rows = await within(sql<{ target_kind: PickTargetKind; target: string; image_kind: PickImageKind | 'none'; image_ref: string | null; by_fid: string; picked_at: Date }[]>`
      select distinct on (target_kind, target) target_kind, target, image_kind, image_ref, by_fid, picked_at
      from studio.admin_picks
      where ${'chapter' in where ? sql`target_kind = 'moment' and target like ${`c${where.chapter}-b%`}` : 'term' in where ? sql`target_kind = 'term' and target = ${where.term}` : sql`target_kind = 'term'`}
      order by target_kind, target, picked_at desc, id desc`);
    const live = rows.filter((r) => r.image_kind !== 'none' && r.image_ref);
    return Promise.all(live.map(async (r) => ({
      targetKind: r.target_kind, target: r.target, imageKind: r.image_kind as PickImageKind, imageRef: r.image_ref!, byFid: Number(r.by_fid),
      by: (await handleFor(Number(r.by_fid)).catch(() => null)) ?? `FID ${r.by_fid}`, at: new Date(r.picked_at).toISOString(),
    })));
  } catch (e) {
    // 0030_admin_picks missing (42P01): no picks, and none asked for again for a minute.
    if ((e as { code?: string }).code === '42P01') missingUntil = Date.now() + 60_000;
    else console.error('picks: none read', (e as Error).message);
    return [];
  }
}

/** An admin's pick (or, with imageKind 'none', clearing it): a new row; the latest counts. The caller checks the admin. */
export async function addPick(sql: Sql, p: { targetKind: PickTargetKind; target: string; imageKind: PickImageKind | 'none'; imageRef: string | null; byFid: number }) {
  await sql`insert into studio.admin_picks ${sql({ target_kind: p.targetKind, target: p.target, image_kind: p.imageKind, image_ref: p.imageKind === 'none' ? null : p.imageRef, by_fid: p.byFid })}`;
}
