import 'server-only';
import { NextResponse, after } from 'next/server';
import type postgres from 'postgres';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { NAME_RULE, bylineName } from '~/lib/names';
import { Refused } from './match';
import { cleanup, cleanupDue, limitRequest, type RequestKind } from './store';

/**
 * What every Minpentai Play route does first, in this order: the signed-in FID (Quick Auth) or 401;
 * the database or 503; the limits (src/lib/config.ts MINPENTAI_PLAY: 429 with retryAfterMs, or 503
 * at the sitewide daily total); then the handler. After the answer, at most once per 10 minutes per
 * server instance, the cleanup (retention, 0009's header). Every answer is `private, no-store`:
 * views are per player, and a cached one would show one player's fog to the other. Errors are
 * JSON {error} (429 adds retryAfterMs and a Retry-After header).
 */
export const HEADERS = { 'Cache-Control': 'private, no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

const refusal = (e: Refused) => {
  const res = json({ error: e.message, ...(e.extra ?? {}) }, e.status);
  const retry = e.extra?.retryAfterMs;
  if (typeof retry === 'number') res.headers.set('Retry-After', String(Math.max(1, Math.ceil(retry / 1000))));
  return res;
};

/** Match and lobby views have a minimum interval; everything else is only counted. */
export function kindOf(request: Request): RequestKind {
  if (request.method !== 'GET') return 'other';
  const p = new URL(request.url).pathname.replace(/\/$/, '');
  if (p === '/api/minpentai/lobby') return 'lobby-view';
  if (/^\/api\/minpentai\/match\/[^/]+$/.test(p)) return 'match-view';
  return 'other';
}

export async function play(request: Request, fn: (c: { sql: postgres.Sql; fid: number; now: number }) => Promise<unknown>): Promise<Response> {
  const fid = await getFid(request);
  if (fid === null) return json({ error: 'Sign in with Farcaster to play' }, 401);
  const sql = db();
  if (!sql) return json({ error: 'not available here' }, 503);
  const now = Date.now();
  if (cleanupDue(now)) {
    after(() => cleanup(sql, Date.now()).catch((e) => console.error('minpentai play cleanup failed', (e as { code?: string }).code ?? (e as Error).name)));
  }
  try {
    await limitRequest(sql, fid, kindOf(request), now);
    const out = await fn({ sql, fid, now });
    if (out instanceof Response) {
      out.headers.set('Cache-Control', HEADERS['Cache-Control']);
      return out;
    }
    return json(out);
  } catch (e) {
    if (e instanceof Refused) return refusal(e);
    // Only the error's type: a database error carries its query parameters.
    console.error('minpentai play failed', (e as { code?: string }).code ?? (e as Error).name);
    return json({ error: 'Something went wrong' }, 500);
  }
}

/** The request's JSON body, or {} when there is none. */
export async function body(request: Request): Promise<Record<string, unknown>> {
  const b = await request.json().catch(() => ({}));
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/**
 * The player's Farcaster username, verified by the server (decision 12: the signed website name,
 * else Farcaster's public API). Never a name the page sends. Without one, no lobby and no invites.
 */
export async function verifiedName(fid: number, nameProof: unknown): Promise<string> {
  const by = await bylineName(fid, nameProof);
  if (!by.name && by.unfit) {
    // Model-drafted wording. Farcaster's names fit (see NAME in src/lib/names.ts); this is for one that doesn't.
    const shown = by.unfit.length > 40 ? `${by.unfit.slice(0, 40)}…` : by.unfit;
    throw new Refused(400, `Your Farcaster username, "${shown}", can't be shown in the lobby: usernames here are ${NAME_RULE}. Playing the computer and free play still work.`);
  }
  if (!by.name) {
    throw new Refused(400, 'Playing other people needs a Farcaster username, and we could not find yours. Set one in Farcaster, or sign in again, then try again.');
  }
  return by.name;
}
