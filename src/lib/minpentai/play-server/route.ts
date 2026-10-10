import 'server-only';
import { NextResponse } from 'next/server';
import type postgres from 'postgres';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { bylineName } from '~/lib/names';
import { Refused } from './match';

/**
 * What every Minpentai Play route does first: the signed-in FID (Quick Auth) or 401; the database
 * or 503; then the handler. Every answer is `private, no-store`: views are per player, and a cached
 * one would show one player's fog to the other. Errors are JSON {error}.
 */
export const HEADERS = { 'Cache-Control': 'private, no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function play(request: Request, fn: (c: { sql: postgres.Sql; fid: number; now: number }) => Promise<unknown>): Promise<Response> {
  const fid = await getFid(request);
  if (fid === null) return json({ error: 'Sign in with Farcaster to play' }, 401);
  const sql = db();
  if (!sql) return json({ error: 'not available here' }, 503);
  try {
    const out = await fn({ sql, fid, now: Date.now() });
    if (out instanceof Response) {
      out.headers.set('Cache-Control', HEADERS['Cache-Control']);
      return out;
    }
    return json(out);
  } catch (e) {
    if (e instanceof Refused) return json({ error: e.message }, e.status);
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
  if (!by.name) {
    throw new Refused(400, 'Playing other people needs a Farcaster username, and we could not find yours. Set one in Farcaster, or sign in again, then try again.');
  }
  return by.name;
}
