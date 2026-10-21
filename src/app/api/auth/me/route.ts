import { NextResponse } from 'next/server';
import { rememberName } from '~/lib/adaptation-pages';
import { getFid } from '~/lib/auth';

/** Who is signed in, from the Quick Auth bearer token. */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ fid: null }, { status: 401 });
  // Signing in (in a Farcaster app this is the sign-in check): remember their name for rename redirects.
  void rememberName(fid);
  return NextResponse.json({ fid });
}
