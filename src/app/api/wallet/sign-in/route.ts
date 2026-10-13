import { NextResponse } from 'next/server';
import { domain } from '~/lib/auth';
import { db } from '~/lib/db';
import { verifySignIn } from '~/lib/wallet/chain';
import { accountFor } from '~/lib/wallet/credits';
import { signSession } from '~/lib/wallet/session';

/**
 * Wallet sign-in, step 2 (owner, 2026-10-13): the signed Sign-In with Ethereum message. If it is
 * for this domain and Base, carries a nonce we issued in the last ten minutes, and the wallet really
 * signed it (checked on Base, so smart wallets work), the address gets an account (made once) and a
 * session token. This route is the sign-in itself, so it can't require one (named exemption in
 * check:principles P4a); it writes only the account row, and only for a verified signature.
 */
const no = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const sql = db();
  if (!sql || !process.env.IMAGES_TICKET_SECRET) return no('Wallet sign-in is not set up on this deployment', 503);
  const body = (await request.json().catch(() => ({}))) as { message?: unknown; signature?: unknown };
  if (typeof body.message !== 'string' || body.message.length > 2000 || typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(body.signature)) return no('Bad request', 400);
  const address = await verifySignIn(body.message, body.signature as `0x${string}`, domain(request));
  if (!address) return no('That signature could not be checked. Try again.', 401);
  const account = await accountFor(sql, address);
  const token = signSession(account, address);
  if (!token) return no('Wallet sign-in is not set up on this deployment', 503);
  return NextResponse.json({ token, address }, { headers: { 'Cache-Control': 'no-store' } });
}
