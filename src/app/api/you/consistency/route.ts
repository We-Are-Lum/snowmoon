import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { SYSTEM_FID } from '~/lib/config';
import { consistencyData } from '~/lib/consistency';

/**
 * The consistency page's data (owner, 2026-10-23): owner-only, "nothing public until I've read it". Answers only
 * for the maintainer's own sign-in (FID 6786); everyone else, signed in or not, gets the same 404. Never cached.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const person = await getPerson(request);
  if (person !== SYSTEM_FID) return new NextResponse('Not found', { status: 404, headers: noStore });
  const data = consistencyData();
  if (!data) return new NextResponse('Not found', { status: 404, headers: noStore });
  return NextResponse.json(data, { headers: noStore });
}
