import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { SYSTEM_FID } from '~/lib/config';
import { VOICE_TEST, VOICE_TEST_MEDIA } from '~/lib/voice-test';

/**
 * The owner's phone test (/voice-test; owner, 2026-10-22): what it downloads, for FID 6786 only.
 * Everyone else, signed in or not, gets a 404, and the page shows the site's "not found".
 * Read only: it writes nothing and sends nothing anywhere.
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid !== SYSTEM_FID) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ media: VOICE_TEST_MEDIA, ...VOICE_TEST }, { headers: { 'Cache-Control': 'no-store' } });
}
