import 'server-only';
import { NextResponse } from 'next/server';
import { db } from '../db';
import { socialAccountFor } from './accounts';
import { signSocialSession, type SocialKind } from './session';

/**
 * The last step of a Lens or Bluesky sign-in, after the proof was checked: the account row (made once; its handle
 * refreshed) and our session token. Shared by src/app/api/auth/lens/verify and src/app/api/auth/bluesky/callback.
 * Writes only studio.social_accounts.
 */
export const noStore = { 'Cache-Control': 'no-store' };
export const refuse = (error: string, status: number, reason?: string) => NextResponse.json({ error, reason }, { status, headers: noStore });

export async function signedIn(kind: SocialKind, subject: string, handle: string | null) {
  const sql = db();
  if (!sql || !process.env.IMAGES_TICKET_SECRET) return refuse('Signing in this way is not set up on this deployment', 503);
  let account: number;
  try {
    account = await socialAccountFor(sql, kind, subject, handle);
  } catch (e) {
    // The table isn't there yet (the migration isn't applied), or the database didn't answer: no session.
    console.error(`${kind} sign-in: account not kept`, (e as { code?: string }).code ?? (e as Error).name);
    return refuse('Signing in this way isn’t available yet.', 503, 'not-yet');
  }
  const token = signSocialSession({ account, kind, subject, handle });
  if (!token) return refuse('Signing in this way is not set up on this deployment', 503);
  return NextResponse.json({ token, kind, handle }, { headers: noStore });
}
