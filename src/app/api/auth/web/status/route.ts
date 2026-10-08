import { NextResponse } from 'next/server';
import { createClient } from '@farcaster/quick-auth';
import { domain } from '~/lib/auth';
import { signName } from '~/lib/names';

/**
 * Sign in with Farcaster on the plain website, step 2: the page polls this with its channel
 * token. When the person has approved in their Farcaster app, our server sends the signed
 * message to Farcaster's sign-in server (auth.farcaster.xyz /verify-siwf), which checks it
 * and returns the same one-hour token Quick Auth issues in the miniapp. The message,
 * signature and addresses never reach the page and are not stored or logged here.
 */
const RELAY = 'https://relay.farcaster.xyz';
const quickAuth = createClient();

export async function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get('c') ?? '';
  if (!/^[\w-]{8,200}$/.test(channel)) return NextResponse.json({ error: 'No sign-in in progress' }, { status: 400 });
  const res = await fetch(`${RELAY}/v1/channel/status`, { headers: { Authorization: `Bearer ${channel}` }, cache: 'no-store' }).catch(() => null);
  if (!res) return NextResponse.json({ state: 'pending' });
  if (res.status === 401 || res.status === 404) return NextResponse.json({ state: 'expired' });
  if (!res.ok) {
    console.error('sign-in status: relay answered', res.status);
    return NextResponse.json({ state: 'pending' });
  }
  const s = (await res.json()) as { state: string; message?: string; signature?: `0x${string}`; username?: string };
  if (s.state !== 'completed' || !s.message || !s.signature) return NextResponse.json({ state: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const { token } = await quickAuth.verifySiwf({ domain: domain(request), message: s.message, signature: s.signature });
    // The relay's name for this person, signed by our server, so a page can't claim another name at Publish.
    const fid = Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub);
    const nameProof = signName(fid, s.username);
    return NextResponse.json({ state: 'completed', token, username: s.username ?? null, nameProof }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // The error's type only, never the message, signature or token.
    console.error('sign-in: Farcaster did not accept the signed message', (e as Error).name);
    return NextResponse.json({ state: 'failed' }, { status: 401 });
  }
}
