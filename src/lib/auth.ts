import 'server-only';
import { createClient } from '@farcaster/quick-auth';
import { readSession, type WalletSession } from './wallet/session';
import { db } from './db';
import { configLink, linkedFidFor } from './wallet/links';
import { readSocialSession, type SocialSession } from './social/session';
import { personForSocial } from './social/accounts';
import { socialPerson } from './people';
import { readFarcasterSession } from './farcaster-session';
import { sessionEnded } from './session-ends';

/**
 * Sign In with Farcaster, as a bearer token. No cookie: on Farcaster web the app runs in a cross-site iframe, where
 * browsers that block third-party cookies (Safari, Brave) would drop it.
 * - Inside the Farcaster app: Farcaster's own Quick Auth JWT (the client uses sdk.quickAuth.fetch, which adds it).
 * - On the website (owner, 2026-11-23; branch session-30d): the site's own session, "f1.…" (src/lib/farcaster-session.ts),
 *   issued once Farcaster's token was verified at sign-in; 30 days, unless "Sign out on every device" ended it.
 * Every route takes either the same way, through getFid.
 */
const quickAuth = createClient();

export function domain(request: Request): string {
  if (process.env.NEXT_PUBLIC_URL) return new URL(process.env.NEXT_PUBLIC_URL).hostname;
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

const bearer = (request: Request) => (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;

/**
 * The signed-in FID, or null: the website's own session (signature, expiry, and not ended by "Sign out on every
 * device"), or a valid Quick Auth token.
 */
export async function getFid(request: Request): Promise<number | null> {
  const token = bearer(request);
  if (!token) return null;
  if (token.startsWith('f1.')) {
    const s = readFarcasterSession(token);
    if (!s) return null;
    return (await sessionEnded(db(), [s.fid], s.at)) ? null : s.fid;
  }
  try {
    const payload = await quickAuth.verifyJwt({ token, domain: domain(request) });
    return Number(payload.sub);
  } catch {
    return null;
  }
}

/**
 * A wallet session from a token (the bearer, or a route's `X-Wallet-Session`): its signature and expiry, and not ended
 * by "Sign out on every device" for the wallet's account or the FID it is linked to.
 */
export async function walletFrom(token: string | null | undefined): Promise<WalletSession | null> {
  const w = readSession(token);
  if (!w) return null;
  const sql = db();
  return (await sessionEnded(sql, [-w.account, await linkedFidFor(sql, w.account, w.address)], w.at)) ? null : w;
}
/** A wallet sign-in's session (src/lib/wallet/session.ts), or null. */
export async function getWallet(request: Request): Promise<WalletSession | null> {
  return walletFrom(bearer(request));
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
  const w = await getWallet(request);
  if (w) return (await linkedFidFor(db(), w.account, w.address)) ?? -w.account;
  // A Lens or Bluesky sign-in (branch signin-lens-bluesky): its linked FID, the Lens account a Bluesky account is
  // linked to, or the account itself (src/lib/social/accounts.ts, src/lib/people.ts).
  const s = await getSocial(request);
  return s ? await personForSocial(db(), s) : null;
}

/** The kind of sign-in on the request (not who it acts as): for the assistant's words (src/lib/chat/gate.ts). */
export async function signedInAs(request: Request): Promise<'wallet' | 'lens' | 'bluesky' | null> {
  if (await getWallet(request)) return 'wallet';
  return (await getSocial(request))?.kind ?? null;
}

/**
 * A Lens or Bluesky session from a token (the bearer, or a route's `X-Social-Session`): its signature and expiry, and
 * not ended by "Sign out on every device" for the account or the person it signs in as.
 */
export async function socialFrom(token: string | null | undefined): Promise<SocialSession | null> {
  const s = readSocialSession(token);
  if (!s) return null;
  const sql = db();
  return (await sessionEnded(sql, [socialPerson(s.account), await personForSocial(sql, s)], s.at)) ? null : s;
}
/** A Lens or Bluesky sign-in's session (src/lib/social/session.ts), or null. */
export async function getSocial(request: Request): Promise<SocialSession | null> {
  return socialFrom(bearer(request));
}

/** The FID LINKED_WALLETS (config) links an address to, or null; the table may say otherwise (linkedFidFor). */
export const linkedFid = (address: string): number | null => configLink(address);
