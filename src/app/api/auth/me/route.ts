import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';

/** Who is signed in, from the Quick Auth bearer token. */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ fid: null }, { status: 401 });
  return NextResponse.json({ fid });
}
