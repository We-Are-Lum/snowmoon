import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';

/**
 * The Neynar user score (decision 11, owner 2026-10-09): who outside the invited list may make
 * images. Looked up only when someone presses Generate, never on page load. Neynar receives the
 * FID and nothing else: no prompt, no name, no cookie, no address of ours beyond the request
 * itself. A value is kept a day per FID in studio.image_scores (migration 0010); a failed lookup is
 * never kept, and whoever asks then is refused rather than let through.
 */
type Sql = postgres.Sql;

/** Where the lookup goes. Mutable only so the tests can point it at a local stand-in. */
export const NEYNAR = { url: 'https://api.neynar.com/v2/farcaster/user/bulk', timeoutMs: 4000 };

export type Lookup = { ok: true; value: number; fromCache: boolean } | { ok: false; why: string };

const FRESH = `now() - make_interval(hours => ${Number(IMAGES.scoreCacheHours)})`;

/** A value kept from a lookup in the last day, or null. Never calls Neynar. */
export async function keptValue(sql: Sql, fid: number): Promise<number | null> {
  const [row] = await sql`select score::float8 as v from studio.image_scores where fid = ${fid} and fetched_at > ${sql.unsafe(FRESH)}`;
  return row ? Number(row.v) : null;
}

/** The person's value: kept, or asked of Neynar with only the FID. Never throws. */
export async function lookUp(sql: Sql, fid: number): Promise<Lookup> {
  try {
    // Rows older than a day go; cheap, on the index.
    await sql`delete from studio.image_scores where fetched_at <= ${sql.unsafe(FRESH)}`;
    const kept = await keptValue(sql, fid);
    if (kept !== null) return { ok: true, value: kept, fromCache: true };
  } catch (e) {
    console.error('neynar: cache unavailable', (e as { code?: string }).code ?? (e as Error).name);
    return { ok: false, why: 'cache' };
  }
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return { ok: false, why: 'no NEYNAR_API_KEY' };
  let value: number | null = null;
  try {
    const res = await fetch(`${NEYNAR.url}?fids=${encodeURIComponent(String(fid))}`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(NEYNAR.timeoutMs),
      redirect: 'error',
      // No `cache` option: Next 15 doesn't cache fetch here by default, and the option adds headers.
    });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const body = (await res.json()) as { users?: { fid?: unknown; score?: unknown; experimental?: { neynar_user_score?: unknown } }[] };
    const u = body.users?.[0];
    if (!u || Number(u.fid) !== fid) return { ok: false, why: 'no such user in the answer' };
    const raw = typeof u.score === 'number' ? u.score : u.experimental?.neynar_user_score;
    value = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
  } catch (e) {
    return { ok: false, why: (e as Error).name };
  }
  if (value === null) return { ok: false, why: 'no value in the answer' };
  try {
    await sql`insert into studio.image_scores (fid, score) values (${fid}, ${value})
      on conflict (fid) do update set score = excluded.score, fetched_at = now()`;
  } catch (e) {
    console.error('neynar: could not keep the value', (e as { code?: string }).code ?? (e as Error).name);
  }
  return { ok: true, value, fromCache: false };
}

/** Shown to the person: two decimals, rounded down, so a refused 0.695 never reads as "0.70". */
export function shown(v: number): string {
  return (Math.floor(v * 100 + 1e-9) / 100).toFixed(2);
}
