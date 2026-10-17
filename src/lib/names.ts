import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Showing a Farcaster username with published work (owner, 2026-10-08, decision 12):
 * - Website sign-ins: the name Farcaster's relay sends our server at sign-in, handed back to the
 *   device signed by our server (IMAGES_TICKET_SECRET), so a page can't claim someone else's name.
 * - Otherwise (inside a Farcaster app): our server asks Farcaster's own public API for the name of
 *   the FID, sending only the FID, and caches it. Named on About. No Neynar.
 * Until one of these gives a name, the byline is "FID n".
 */
// Farcaster usernames are an fname or an ENS name whose label is at most 16 lowercase letters, numbers
// and hyphens (docs.farcaster.xyz/learn/what-is-farcaster/usernames), so the longest is a basename,
// 16 + ".base.eth" = 25 characters. 31 leaves room; the lobby table (0009) holds the same rule.
export const NAME = /^[a-z0-9][a-z0-9.-]{0,30}$/i;
export const NAME_RULE = '1 to 31 letters, numbers, dots or hyphens';
const PROOF_DAYS = 30;

function secret(): Buffer | null {
  const s = process.env.IMAGES_TICKET_SECRET;
  return s && s.length >= 32 ? Buffer.from(s) : null;
}
const mac = (key: Buffer, body: string) => createHmac('sha256', key).update(`name:${body}`).digest();

/** At website sign-in: the relay's name for this FID, signed. Null when there is no name or no secret. */
export function signName(fid: number, username: string | null | undefined): string | null {
  const key = secret();
  if (!key || !username || !NAME.test(username)) return null;
  const body = Buffer.from(JSON.stringify({ fid, username, at: Date.now() })).toString('base64url');
  return `${body}.${mac(key, body).toString('base64url')}`;
}

/** The name in a signed proof, if the signature is ours, it is for this FID, and it is recent. */
export function readName(proof: unknown, fid: number): string | null {
  const key = secret();
  if (!key || typeof proof !== 'string') return null;
  const [body, sig] = proof.split('.');
  if (!body || !sig) return null;
  const want = mac(key, body);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { fid: number; username: string; at: number };
  if (p.fid !== fid || Date.now() - p.at > PROOF_DAYS * 86400_000 || !NAME.test(p.username)) return null;
  return p.username;
}

const cache = new Map<number, { name: string | null; unfit: string | null; at: number }>();
const DAY = 86400_000;

/** Farcaster's public API: GET api.farcaster.xyz/v2/user?fid=… → result.user.username. Cached a day. */
export async function lookupName(fid: number): Promise<string | null> {
  return (await lookup(fid)).name;
}
/** The lookup, and, when Farcaster has a name for this FID that doesn't fit NAME, that name (`unfit`). */
async function lookup(fid: number): Promise<{ name: string | null; unfit: string | null }> {
  const hit = cache.get(fid);
  if (hit && Date.now() - hit.at < DAY) return hit;
  const res = await fetch(`https://api.farcaster.xyz/v2/user?fid=${fid}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return hit ?? { name: null, unfit: null };
  const j = (await res.json().catch(() => ({}))) as { result?: { user?: { username?: unknown } } };
  const raw = typeof j.result?.user?.username === 'string' && j.result.user.username ? j.result.user.username : null;
  const name = raw && NAME.test(raw) ? raw : null;
  const out = { name, unfit: raw && !name ? raw : null };
  cache.set(fid, { ...out, at: Date.now() });
  return out;
}

/** The byline name for a publish: the signed website name, else the public lookup, else none. */
export async function bylineName(fid: number, proof: unknown): Promise<{ name: string | null; source: 'relay' | 'farcaster-api' | null; unfit?: string }> {
  const signed = readName(proof, fid);
  if (signed) return { name: signed, source: 'relay' };
  const looked = await lookup(fid);
  if (looked.name) return { name: looked.name, source: 'farcaster-api' };
  return looked.unfit ? { name: null, source: null, unfit: looked.unfit } : { name: null, source: null };
}

const byName = new Map<string, { fid: number | null; username: string | null; at: number }>();
const HOUR = 3600_000;

/**
 * The other way round, for adaptation pages (/@<fname>/<id>, docs/proposals/adaptation-urls.md):
 * Farcaster's public API, GET api.farcaster.xyz/v2/user-by-username?username=… → result.user.fid.
 * Sends only the name in the URL, never anything about the visitor. Cached an hour (a name that
 * isn't found, five minutes), so a rename shows up within the hour. `failed` is true when Farcaster
 * didn't answer, so the caller can fall back on names it has seen instead of saying "no such name".
 */
export async function lookupFid(name: string): Promise<{ fid: number | null; username: string | null; failed?: boolean }> {
  const key = name.toLowerCase();
  if (!NAME.test(key)) return { fid: null, username: null };
  const hit = byName.get(key);
  if (hit && Date.now() - hit.at < (hit.fid ? HOUR : 5 * 60_000)) return hit;
  const res = await fetch(`https://api.farcaster.xyz/v2/user-by-username?username=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  // Farcaster answers an unknown name with 400 or 404; anything else that isn't ok means it didn't answer.
  if (!res || (!res.ok && res.status !== 400 && res.status !== 404)) return hit ?? { fid: null, username: null, failed: true };
  const j = res.ok ? ((await res.json().catch(() => ({}))) as { result?: { user?: { fid?: unknown; username?: unknown } } }) : {};
  const fid = typeof j.result?.user?.fid === 'number' && j.result.user.fid > 0 ? j.result.user.fid : null;
  const raw = typeof j.result?.user?.username === 'string' ? j.result.user.username.toLowerCase() : null;
  const out = { fid, username: fid && raw && NAME.test(raw) ? raw : null, at: Date.now() };
  byName.set(key, out);
  return out;
}
