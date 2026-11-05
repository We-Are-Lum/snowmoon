import 'server-only';
import { createClient } from '@farcaster/quick-auth';
import { readSession, type WalletSession } from './wallet/session';
import { db } from './db';
import { configLink, linkedFidFor } from './wallet/links';
import { readSocialSession, type SocialSession } from './social/session';
import { personForSocial } from './social/accounts';
import { socialPerson } from './people';
import { linkedOn } from './linked/accounts';
import { fromPostgres, link as linkV2, signIn as signInV2 } from './linked/v2';

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
  if (linkedOn()) return getLinkedPerson(request);
  const fid = await getFid(request);
  if (fid !== null) return fid;
  const w = getWallet(request);
  if (w) return (await linkedFidFor(db(), w.account, w.address)) ?? -w.account;
  // A Lens or Bluesky sign-in (branch signin-lens-bluesky): its linked FID, the Lens account a Bluesky account is
  // linked to, or the account itself (src/lib/social/accounts.ts, src/lib/people.ts).
  const s = getSocial(request);
  return s ? await personForSocial(db(), s) : null;
}

/** A Lens or Bluesky sign-in's session (src/lib/social/session.ts), or null. */
export function getSocial(request: Request): SocialSession | null {
  const token = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)?.[1];
  return readSocialSession(token);
}

/** The FID LINKED_WALLETS (config) links an address to, or null; the table may say otherwise (linkedFidFor). */
export const linkedFid = (address: string): number | null => configLink(address);

/**
 * The account this request is signed in with, as a person number (a FID, minus a wallet account, or a Lens or Bluesky
 * account's number), without following any link. Null if none.
 */
export async function signedInAccount(request: Request): Promise<{ account: number; kind: 'farcaster' | 'wallet' | 'lens' | 'bluesky'; address?: string } | null> {
  const fid = await getFid(request);
  if (fid !== null) return { account: fid, kind: 'farcaster' };
  const w = getWallet(request);
  if (w) return { account: -w.account, kind: 'wallet', address: w.address };
  const s = getSocial(request);
  return s ? { account: socialPerson(s.account), kind: s.kind } : null;
}

/**
 * getPerson while linked accounts are on (LINKED_ACCOUNTS, v2; src/lib/linked/v2.ts): the sign-in's own number, since
 * each row keeps the number of the sign-in that made it and its Snowmoon account is its owner stamp. Signing in puts the
 * sign-in in its Snowmoon account (or starts one); a sign-in in its 30-day wait gets none and is refused here. A wallet
 * the app has never seen gets the automatic link once ('verified'), only when the Farcaster account that lists it is
 * its Snowmoon account's main sign-in (owner, 2026-11-05; v2.link checks it), and only for a wallet with no history.
 */
async function getLinkedPerson(request: Request): Promise<number | null> {
  const me = await signedInAccount(request);
  if (!me) return null;
  const sql = db();
  if (!sql) return me.account;
  const d = fromPostgres(sql);
  const now = new Date();
  try {
    if (me.kind === 'wallet') {
      const known = (await sql`select 1 from studio.person_accounts where account = ${me.account} limit 1`)[0];
      if (!known) {
        const fid = await linkedFidFor(sql, -me.account, me.address!);
        if (fid !== null) await linkV2(d, { actor: fid, add: me.account, now, how: 'verified' });
      }
    }
    const r = await signInV2(d, me.account, now);
    return r.ok ? me.account : null;
  } catch (e) {
    console.error('linked accounts: sign-in failed', (e as { code?: string }).code ?? (e as Error).name);
    return null;
  }
}
