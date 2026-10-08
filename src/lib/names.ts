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
const NAME = /^[a-z0-9][a-z0-9.-]{0,30}$/i;
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

const cache = new Map<number, { name: string | null; at: number }>();
const DAY = 86400_000;

/** Farcaster's public API: GET api.farcaster.xyz/v2/user?fid=… → result.user.username. Cached a day. */
export async function lookupName(fid: number): Promise<string | null> {
  const hit = cache.get(fid);
  if (hit && Date.now() - hit.at < DAY) return hit.name;
  const res = await fetch(`https://api.farcaster.xyz/v2/user?fid=${fid}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return hit?.name ?? null;
  const j = (await res.json().catch(() => ({}))) as { result?: { user?: { username?: unknown } } };
  const name = typeof j.result?.user?.username === 'string' && NAME.test(j.result.user.username) ? j.result.user.username : null;
  cache.set(fid, { name, at: Date.now() });
  return name;
}

/** The byline name for a publish: the signed website name, else the public lookup, else none. */
export async function bylineName(fid: number, proof: unknown): Promise<{ name: string | null; source: 'relay' | 'farcaster-api' | null }> {
  const signed = readName(proof, fid);
  if (signed) return { name: signed, source: 'relay' };
  const looked = await lookupName(fid);
  return looked ? { name: looked, source: 'farcaster-api' } : { name: null, source: null };
}
