import { NextResponse } from 'next/server';
import { signInOpen } from '~/lib/config';
import { isAddress, lensChallenge, LensNotSetUp, LensRefused } from '~/lib/social/lens';
import { signTicket } from '~/lib/social/session';
import { noStore, refuse } from '~/lib/social/sign-in';

/**
 * Lens sign-in, step 1 (branch signin-lens-bluesky): a challenge from Lens for this account and the wallet that owns
 * or manages it, for our domain, plus our ticket binding the challenge to that account for ten minutes. Signed out by
 * definition: a named sign-in exemption in check:principles P4a. Writes nothing; Lens receives the two addresses.
 */
/**
 * The origin the browser is on, for Lens's message. Not request.url: `next dev` rewrites its host to "localhost" even
 * when the page is on 127.0.0.1, so Lens wrote "localhost" and the page refused the message (owner's run, 2026-11-05).
 * The Host header is what the browser asked for; on Vercel it is the site's own host, as request.url is.
 */
function browserOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(/:$/, '');
  return host && /^[a-z0-9.-]+(:\d+)?$/i.test(host) && (proto === 'http' || proto === 'https') ? `${proto}://${host}` : url.origin;
}

export async function POST(request: Request) {
  if (!signInOpen('lens')) return new NextResponse('Not found', { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { account?: unknown; signer?: unknown };
  if (!isAddress(b.account) || !isAddress(b.signer)) return refuse('Bad request', 400);
  try {
    const c = await lensChallenge(b.account, b.signer, browserOrigin(request));
    const ticket = signTicket('lens', { id: c.id, account: b.account.toLowerCase() }, 10);
    if (!ticket) return refuse('Lens sign-in is not set up on this deployment', 503);
    return NextResponse.json({ id: c.id, text: c.text, ticket }, { headers: noStore });
  } catch (e) {
    if (e instanceof LensNotSetUp) return refuse('Lens sign-in is not set up on this deployment', 503);
    if (e instanceof LensRefused) return refuse('Lens has no such account.', 404, e.why);
    console.error('lens challenge: Lens did not answer', (e as Error).name);
    return refuse('Lens isn’t answering. Try again in a moment.', 502);
  }
}
