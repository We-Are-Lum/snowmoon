import { NextResponse } from 'next/server';
import { signInOpen } from '~/lib/config';
import { BlueskyRefused, finishBluesky } from '~/lib/social/atproto';
import { refuse, signedIn } from '~/lib/social/sign-in';

/**
 * Bluesky sign-in, step 2 (branch signin-lens-bluesky): the page at /sign-in/bluesky sends what the authorization
 * server gave the browser (code, state, iss) with what it kept in this tab (sealed). The state and issuer must match,
 * the code is exchanged, and the DID must be one this issuer speaks for (src/lib/social/atproto.ts). Then the account
 * row and our session token. This route is the sign-in itself, so it can't require one (named exemption in
 * check:principles P4a); it writes only the account row, and only for a DID proven this way. The server's tokens are
 * dropped.
 */
export async function POST(request: Request) {
  if (!signInOpen('bluesky')) return new NextResponse('Not found', { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { code?: unknown; state?: unknown; iss?: unknown; sealed?: unknown };
  let who: { did: string; handle: string | null };
  try {
    who = await finishBluesky(b);
  } catch (e) {
    if (e instanceof BlueskyRefused) return refuse('That Bluesky sign-in couldn’t be checked. Try again.', 401, e.why);
    console.error('bluesky callback failed', (e as Error).name);
    return refuse('Your Bluesky server isn’t answering. Try again in a moment.', 502);
  }
  return signedIn('bluesky', who.did, who.handle);
}
