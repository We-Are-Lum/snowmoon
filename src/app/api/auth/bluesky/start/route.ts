import { NextResponse } from 'next/server';
import { signInOpen } from '~/lib/config';
import { BlueskyRefused, startBluesky } from '~/lib/social/atproto';
import { noStore, refuse } from '~/lib/social/sign-in';

/**
 * Bluesky sign-in, step 1 (branch signin-lens-bluesky; AT Protocol OAuth, src/lib/social/atproto.ts): from the handle
 * the person typed, their authorization server, a pushed authorization request, and where to send the browser. The
 * page keeps `sealed` in this tab for step 2. Signed out by definition: a named sign-in exemption in check:principles
 * P4a. Writes nothing. The handle's DNS, the person's DID document (plc.directory), their PDS and their authorization
 * server are asked.
 */
const WHY: Record<string, string> = {
  'bad-handle': 'That doesn’t look like a Bluesky handle. It looks like alice.bsky.social.',
  'no-did': 'We couldn’t find that handle on Bluesky.',
};

export async function POST(request: Request) {
  if (!signInOpen('bluesky')) return new NextResponse('Not found', { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { handle?: unknown };
  if (typeof b.handle !== 'string' || b.handle.length > 260) return refuse(WHY['bad-handle'], 400, 'bad-handle');
  try {
    const s = await startBluesky(b.handle, new URL(request.url).origin);
    return NextResponse.json(s, { headers: noStore });
  } catch (e) {
    if (e instanceof BlueskyRefused) return refuse(WHY[e.why] ?? 'Your Bluesky server isn’t answering as expected. Try again in a moment.', WHY[e.why] ? 400 : 502, e.why);
    console.error('bluesky start failed', (e as Error).name);
    return refuse('Your Bluesky server isn’t answering. Try again in a moment.', 502);
  }
}
