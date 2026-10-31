import { NextResponse } from 'next/server';
import { signInOpen } from '~/lib/config';
import { clientMetadata } from '~/lib/social/atproto';

/**
 * The site's AT Protocol OAuth client metadata (branch signin-lens-bluesky): its URL is the client_id that Bluesky
 * authorization servers fetch. A public client (no secret), DPoP-bound tokens, scope "atproto". 404 while Bluesky
 * sign-in is off, and on a plain-http origin (local testing uses the loopback client instead).
 */
export async function GET(request: Request) {
  if (!signInOpen('bluesky')) return new NextResponse('Not found', { status: 404 });
  const m = clientMetadata(new URL(request.url).origin);
  if (!m) return new NextResponse('Not found', { status: 404 });
  return NextResponse.json(m, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
