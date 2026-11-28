import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { isAdmin } from '~/lib/admins';
import { readMedia } from '~/lib/review/media';
import { claimPicture } from '~/lib/review/remote-image';

/**
 * A picture from a post or profile on /admin/bounty (owner, 2026-11-27; branch bounty-inline). Admins only: everyone
 * else gets 404 before anything is read. It fetches only an address our server signed after reading the post
 * (src/lib/review/media.ts; never one a browser chose), through the guarded fetch (src/lib/review/remote-image.ts:
 * public https hosts only, private addresses refused at the connection, JPEG, PNG, WebP, GIF or AVIF only), and sends a
 * JPEG it drew itself, so an admin's browser asks only this site (P6).
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  const url = readMedia(new URL(request.url).searchParams.get('m'));
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  const pic = await claimPicture(url, 900);
  if (!pic) return NextResponse.json({ error: 'Picture not readable' }, { status: 502, headers: NO_STORE });
  return new NextResponse(new Uint8Array(pic.jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' } });
}
