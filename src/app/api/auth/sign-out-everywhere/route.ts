import { NextResponse } from 'next/server';
import { getPerson, getSocial, getWallet } from '~/lib/auth';
import { db } from '~/lib/db';
import { socialPerson } from '~/lib/people';
import { endEverywhere } from '~/lib/session-ends';

/**
 * "Sign out on every device" (owner, 2026-11-23; branch session-30d), from the You page. Ends every website session of
 * the person signed in here, issued before now, on every device: for the person they sign in as, and for the wallet or
 * Lens/Bluesky account this sign-in is (src/lib/session-ends.ts). Kept: the person and when (studio.session_ends).
 * Farcaster's own sign-in inside the Farcaster app isn't affected. Signed out: 401.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: NO_STORE });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503, headers: NO_STORE });
  const w = await getWallet(request);
  const s = await getSocial(request);
  const r = await endEverywhere(sql, [person, w ? -w.account : null, s ? socialPerson(s.account) : null]);
  if (!r.ok) return NextResponse.json({ error: 'Not available yet' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ ok: true, endedAt: r.at }, { headers: NO_STORE });
}
