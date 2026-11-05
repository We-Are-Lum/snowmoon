import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, IMAGES } from '../config';
import { currentDecision, decide } from '../checks/decisions';

/**
 * The Neynar user score (decision 11, owner 2026-10-09): who outside the invited list may make
 * images, and whose remix-challenge versions count. Looked up only when someone presses Generate or
 * publishes, never on page load. Neynar receives the FID and nothing else: no prompt, no name, no
 * cookie, no address of ours beyond the request itself.
 *
 * Only the decision is kept (owner, 2026-11-04: "store the decision, not the score"), in
 * studio.check_decisions (src/lib/checks/decisions.ts): passed or not, when, and the threshold. A pass
 * is used for 90 days and a fail for 24 hours without asking Neynar again; a report or a hide withdraws
 * a pass early, and a changed threshold is asked again. The score itself is used for the one answer
 * it was looked up for (the refusal says it) and then forgotten. A failed lookup is never kept, and
 * whoever asks then is refused rather than let through.
 */
type Sql = postgres.Sql;

/** Where the lookup goes. Mutable only so the tests can point it at a local stand-in. */
export const NEYNAR = { url: 'https://api.neynar.com/v2/farcaster/user/bulk', timeoutMs: 4000 };

/** The rule a decision is stored under, e.g. 'neynar-score>=0.7'. */
export const neynarRule = (min: number) => `neynar-score>=${Number(min)}`;

/**
 * Every Neynar threshold the site uses today: Generate's (IMAGES) and the remix challenge's (CHALLENGE, fixed for the
 * whole challenge). One lookup decides all of them, so publishing never asks Neynar a second time.
 */
export const neynarThresholds = (): number[] => [...new Set([IMAGES.neynarMinScore, CHALLENGE.neynarMinScore])];

/**
 * The check's answer. `score` is set only when Neynar was asked just now (for the refusal's wording); it is never
 * stored. `decidedAt` is when the decision was made (now, or when the kept one was).
 */
export type Check = { ok: true; passed: boolean; score: number | null; decidedAt: Date } | { ok: false; why: string };

/** The kept decision for this FID under this threshold, or null. Never calls Neynar. Throws if the store can't be read. */
export async function keptDecision(sql: Sql, fid: number, min: number) {
  return currentDecision(sql, 'farcaster', String(fid), neynarRule(min));
}

/** Whether the FID's account passes `min`: the kept decision while current, or asked of Neynar with only the FID. Never throws. */
export async function checkNeynar(sql: Sql, fid: number, min: number): Promise<Check> {
  try {
    const kept = await keptDecision(sql, fid, min);
    if (kept) return { ok: true, passed: kept.passed, score: null, decidedAt: kept.decidedAt };
  } catch (e) {
    console.error('neynar: decisions unavailable', (e as { code?: string }).code ?? (e as Error).name);
    return { ok: false, why: 'store' };
  }
  const r = await askNeynar(fid);
  if (!r.ok) return r;
  // Decide every threshold in use now, then forget the score.
  for (const t of new Set([...neynarThresholds(), min])) await decide(sql, 'farcaster', String(fid), r.value >= t, neynarRule(t));
  return { ok: true, passed: r.value >= min, score: r.value, decidedAt: new Date() };
}

/** Asks Neynar for the FID's user score. Nothing is stored here. Never throws. */
async function askNeynar(fid: number): Promise<{ ok: true; value: number } | { ok: false; why: string }> {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return { ok: false, why: 'no NEYNAR_API_KEY' };
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
    const value = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
    return value === null ? { ok: false, why: 'no value in the answer' } : { ok: true, value };
  } catch (e) {
    return { ok: false, why: (e as Error).name };
  }
}

/** Shown to the person: two decimals, rounded down, so a refused 0.695 never reads as "0.70". */
export function shown(v: number): string {
  return (Math.floor(v * 100 + 1e-9) / 100).toFixed(2);
}
