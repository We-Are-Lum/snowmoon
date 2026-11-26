import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SESSIONS } from './config';

/**
 * The website's Farcaster sign-in session (owner, 2026-11-23; branch session-30d). At sign-in the server verifies
 * Farcaster's own token once (src/app/api/auth/web/status) and issues this instead, as signSocialSession does for Lens
 * and Bluesky: "f1." + {sub: the FID, at: when it was issued (ms), exp}, signed with a key derived from
 * IMAGES_TICKET_SECRET. Nothing is stored for it. The page keeps it in localStorage and sends it as the bearer header,
 * never a cookie; src/lib/auth.ts getFid accepts it everywhere Farcaster's token is accepted, unless "Sign out on every
 * device" ended it. It lasts SESSIONS.hours (30 days). Inside the Farcaster app, Quick Auth stays as it is.
 */
export interface FarcasterSession {
  fid: number;
  /** When it was issued, ms since the epoch. */
  at: number;
  /** Seconds since the epoch. */
  exp: number;
}

function key(): Buffer | null {
  const s = process.env.IMAGES_TICKET_SECRET;
  return s && s.length >= 32 ? createHmac('sha256', s).update('farcaster:session').digest() : null;
}
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function signFarcasterSession(fid: number, hours: number = SESSIONS.hours): string | null {
  const k = key();
  if (!k || !Number.isSafeInteger(fid) || fid <= 0) return null;
  const at = Date.now();
  const exp = Math.floor(at / 1000 + hours * 3600);
  // `sub` and `exp`, as in a JWT's payload, so the page reads the FID and expiry the way it read Farcaster's token.
  const body = Buffer.from(JSON.stringify({ sub: fid, at, exp })).toString('base64url');
  return `f1.${body}.${createHmac('sha256', k).update(body).digest('base64url')}`;
}

export function readFarcasterSession(token: string | null | undefined): FarcasterSession | null {
  const k = key();
  if (!k || !token?.startsWith('f1.') || token.length > 1000) return null;
  const [, body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !same(Buffer.from(sig, 'base64url'), createHmac('sha256', k).update(body).digest())) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as { sub?: unknown; at?: unknown; exp?: unknown };
    if (!Number.isSafeInteger(s.sub) || (s.sub as number) <= 0 || !Number.isSafeInteger(s.at) || !Number.isSafeInteger(s.exp)) return null;
    if ((s.exp as number) * 1000 <= Date.now()) return null;
    return { fid: s.sub as number, at: s.at as number, exp: s.exp as number };
  } catch {
    return null;
  }
}
