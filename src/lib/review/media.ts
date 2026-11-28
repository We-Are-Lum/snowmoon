import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { safeHttp } from './links';

/**
 * Signed addresses for the pictures of posts and profiles on /admin/bounty (owner, 2026-11-27; branch bounty-inline).
 * The server, after reading a post from its network, signs each picture's address it found there: "m1." + {u, exp},
 * HMAC with a key derived from IMAGES_TICKET_SECRET. The media route (/api/admin/bounty/media, admins only) fetches only
 * an address it signed itself within the last 30 minutes, through the guarded fetch (src/lib/review/remote-image.ts),
 * so it never fetches an address a browser chose, and no instance needs to look the post up again (no extra credits).
 */
const MINUTES = 30;
function key(): Buffer | null {
  const s = process.env.IMAGES_TICKET_SECRET;
  return s && s.length >= 32 ? createHmac('sha256', s).update('review:media').digest() : null;
}

export function signMedia(url: string | null | undefined): string | null {
  const u = safeHttp(url ?? null);
  const k = key();
  if (!u || !k || !u.startsWith('https://')) return null;
  const body = Buffer.from(JSON.stringify({ u, exp: Math.floor(Date.now() / 1000) + MINUTES * 60 })).toString('base64url');
  return `/api/admin/bounty/media?m=m1.${body}.${createHmac('sha256', k).update(body).digest('base64url')}`;
}

/** The address a media token names, if our server signed it and it hasn't run out; else null. */
export function readMedia(token: string | null | undefined): string | null {
  const k = key();
  if (!k || !token?.startsWith('m1.') || token.length > 6000) return null;
  const [, body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const want = createHmac('sha256', k).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as { u?: unknown; exp?: unknown };
    if (typeof t.u !== 'string' || typeof t.exp !== 'number' || t.exp * 1000 <= Date.now()) return null;
    const u = safeHttp(t.u);
    return u && u.startsWith('https://') ? u : null;
  } catch {
    return null;
  }
}
