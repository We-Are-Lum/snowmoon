import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { consentWording, hasConsented, recordConsent } from '~/lib/consent';

const noStore = { 'Cache-Control': 'no-store' };

/** The current wording, and whether the signed-in person has agreed to it. */
export async function GET(request: Request) {
  const wording = consentWording();
  const fid = await getFid(request);
  const agreed = fid === null ? false : await hasConsented(fid);
  return NextResponse.json({ wording, signedIn: fid !== null, agreed }, { headers: noStore });
}

/** Agree to the wording shown. Body: { sha256 } of the wording the person saw. */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster first' }, { status: 401 });
  const { sha256 } = (await request.json().catch(() => ({}))) as { sha256?: unknown };
  try {
    await recordConsent(fid, String(sha256 ?? ''));
    return NextResponse.json({ agreed: true }, { headers: noStore });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not record your agreement';
    return NextResponse.json({ error: message }, { status: message.startsWith('the wording') ? 409 : 500 });
  }
}
