import 'server-only';
import { createClient } from '@farcaster/quick-auth';
import { readSession, type WalletSession } from './wallet/session';
import { db } from './db';
import { configLink, linkedFidFor } from './wallet/links';

/**
 * Sign In with Farcaster via Quick Auth, as a bearer token.
 *
 * Every authenticated request carries `Authorization: Bearer <quick auth JWT>`
 * (the client uses sdk.quickAuth.fetch, which adds it). No cookie: on Farcaster
 * web the app runs in a cross-site iframe, where browsers that block third-party
 * cookies (Safari, Brave) would drop it.
 */
const quickAuth = createClient();

export function domain(request: Request): string {
  if (process.env.NEXT_PUBLIC_URL) return new URL(process.env.NEXT_PUBLIC_URL).hostname;
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

/** The signed-in FID, or null if the request has no valid Quick Auth token. */
export async function getFid(request: Request): Promise<number | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  try {
    const payload = await quickAuth.verifyJwt({ token, domain: domain(request) });
    return Number(payload.sub);
  } catch {
    return null;
  }
}

/** A wallet sign-in's session (src/lib/wallet/session.ts), or null. */
export function getWallet(request: Request): WalletSession | null {
  const token = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)?.[1];
  return readSession(token);
}

/**
 * Who is signed in, for the routes that also take a wallet sign-in (making and publishing images,
 * and agreeing to how one's words are published; owner, 2026-10-13; "Make your own", owner, 2026-10-19): a Farcaster FID, or minus a
 * wallet account's number (never a FID, which is positive). Every other route uses getFid. A wallet linked to a
 * Farcaster account signs in as that FID (owner, 2026-10-22): the newest active link in studio.wallet_links, or
 * LINKED_WALLETS while that table isn't there (src/lib/wallet/links.ts). The payment address is never linked.
 */
export async function getPerson(request: Request): Promise<number | null> {
  const fid = await getFid(request);
  if (fid !== null) return fid;
  const w = getWallet(request);
  return w ? (await linkedFidFor(db(), w.account, w.address)) ?? -w.account : null;
}

/** The FID LINKED_WALLETS (config) links an address to, or null; the table may say otherwise (linkedFidFor). */
export const linkedFid = (address: string): number | null => configLink(address);
