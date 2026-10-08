import { NextResponse } from 'next/server';
import { createClient } from '@farcaster/quick-auth';
import QRCode from 'qrcode';
import { domain } from '~/lib/auth';

/**
 * Sign in with Farcaster on the plain website, step 1 (docs/proposals/web-sign-in.md).
 * Our server, not the page, talks to the outside services: a nonce from Farcaster's sign-in
 * server (auth.farcaster.xyz), then a channel on Farcaster's relay (relay.farcaster.xyz) for
 * our domain. The page gets back only the channel token, the link, and a QR code drawn here.
 * Signed out by definition, so no sign-in is required (named exemption in check:principles P4a).
 */
const RELAY = 'https://relay.farcaster.xyz';
const quickAuth = createClient();

export async function POST(request: Request) {
  const host = domain(request);
  try {
    // generateNonce resolves to { nonce }, not the string itself (it was sent whole, and the relay refused it).
    const { nonce } = await quickAuth.generateNonce();
    const res = await fetch(`${RELAY}/v1/channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: host,
        siweUri: `https://${host}/`,
        nonce,
        expirationTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    });
    if (!res.ok) {
      // The relay's status and its error label only: nothing about the person, no token.
      const why = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
      console.error('sign-in start: relay refused the channel', res.status, typeof why === 'string' ? why.slice(0, 60) : '');
      return NextResponse.json({ error: 'Farcaster sign-in is not answering. Try again in a moment.' }, { status: 502 });
    }
    const { channelToken, url } = (await res.json()) as { channelToken: string; url: string };
    const qr = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return NextResponse.json({ channelToken, url, qr }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // Only the error's type: there is nothing personal here, and no token to print.
    console.error('sign-in start failed', (e as Error).name);
    return NextResponse.json({ error: 'Farcaster sign-in is not answering. Try again in a moment.' }, { status: 502 });
  }
}
