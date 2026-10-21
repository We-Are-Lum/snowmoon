import 'server-only';
import { createHmac } from 'node:crypto';
import { AGENT_API } from '../config';
import { db } from '../db';

/**
 * The read API's rate limit without sign-in (owner, 2026-10-19: "open without sign-in at a low rate"):
 * AGENT_API.perMinute requests a minute per caller, counted in studio.api_rate (DRAFT migration 0018).
 * The caller is a keyed hash of its address with a key that changes every UTC day, so no address is stored
 * and a day's hashes can't be matched to another day's. Nothing else about a request is stored or logged.
 */
function callerKey(request: Request): string | null {
  const secret = process.env.AGENT_RATE_KEY || process.env.IMAGES_TICKET_SECRET;
  if (!secret) return null;
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  return createHmac('sha256', `${secret}:${day}`).update(ip).digest('hex').slice(0, 32);
}

export type Rate = { ok: true; left: number } | { ok: false; status: 429 | 503; retryAfter?: number };

export async function rateOk(request: Request): Promise<Rate> {
  const sql = db();
  const caller = callerKey(request);
  if (!sql || !caller) return { ok: false, status: 503 };
  const [r] = await sql<{ n: number }[]>`
    insert into studio.api_rate (caller, minute, n) values (${caller}, date_trunc('minute', now()), 1)
    on conflict (caller, minute) do update set n = studio.api_rate.n + 1
    returning n`;
  // Now and then, old rows go (they are only for the minute they count).
  if (Math.random() < 0.02) await sql`delete from studio.api_rate where minute < now() - make_interval(mins => ${AGENT_API.keepMinutes})`;
  if (r.n > AGENT_API.perMinute) return { ok: false, status: 429, retryAfter: 60 - new Date().getUTCSeconds() };
  return { ok: true, left: AGENT_API.perMinute - r.n };
}

/** The test stand-in switch, never on Vercel. */
export const agentTestOn = () => process.env.AGENT_API_TEST === '1' && !process.env.VERCEL;
export const agentApiOn = () => AGENT_API.enabled || agentTestOn();
