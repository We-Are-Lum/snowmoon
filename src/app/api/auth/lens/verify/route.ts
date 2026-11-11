import { NextResponse } from 'next/server';
import { signInOpen } from '~/lib/config';
import { lensAuthenticate, LensRefused, lensUsername } from '~/lib/social/lens';
import { readTicket } from '~/lib/social/session';
import { refuse, signedIn } from '~/lib/social/sign-in';

/**
 * Lens sign-in, step 2 (branch signin-lens-bluesky): the wallet's signature of Lens's challenge. Lens checks it
 * (authenticate) and answers with an ID token, which we check (src/lib/social/lens.ts); the account it names must be
 * the one our ticket says the challenge was for. Then the account row and our session token. This route is the
 * sign-in itself, so it can't require one (named exemption in check:principles P4a); it writes only the account row,
 * and only for a proof Lens accepted. Lens's own tokens are dropped.
 */
export async function POST(request: Request) {
  if (!signInOpen('lens')) return new NextResponse('Not found', { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { ticket?: unknown; signature?: unknown };
  const t = readTicket<{ id: string; account: string }>('lens', b.ticket);
  if (!t) return refuse('That sign-in took too long. Try again.', 400, 'ticket');
  if (typeof b.signature !== 'string') return refuse('Bad request', 400);
  let account: `0x${string}`;
  try {
    account = await lensAuthenticate(t.id, b.signature, t.account);
  } catch (e) {
    if (e instanceof LensRefused) return refuse(e.why === 'expired' ? 'That sign-in took too long. Try again.' : 'Lens didn’t accept that signature for this account.', 401, e.why);
    console.error('lens verify: Lens did not answer', (e as Error).name);
    return refuse('Lens isn’t answering. Try again in a moment.', 502);
  }
  return signedIn('lens', account, await lensUsername(account));
}
