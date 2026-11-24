import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { claimPictureFor } from '~/lib/review/review';
import { claimPicture } from '~/lib/review/remote-image';

/**
 * A bounty claim's picture, for /admin/bounty (owner, 2026-11-23; branch bounty-review). Admins only: everyone else
 * gets 404 before anything is read. The claim's tokenURI is read on Base (never taken from the request); the server
 * fetches it with the guards in src/lib/review/remote-image.ts and sends it on as a JPEG it drew itself, so an admin's
 * browser asks only this site (P6). Not cached anywhere shared.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const fid = await getFid(request);
  const a = await claimPictureFor(fid, new URL(request.url).searchParams.get('claim'), { picture: (uri) => claimPicture(uri) });
  if (a.status !== 200) return NextResponse.json({ error: a.error }, { status: a.status, headers: { 'Cache-Control': 'private, no-store' } });
  return new NextResponse(new Uint8Array(a.jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' } });
}
