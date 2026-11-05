import { NextResponse } from 'next/server';
import { domain, getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { holdsPersonBalance, payMessage, personBalanceOn, recordIntent, verifyPayIntent } from '~/lib/balance/person';
import { newNonce } from '~/lib/wallet/session';

/**
 * Paying per person (DRAFT, PERSON_BALANCE off; docs/proposals/person-balance.md). Drafted by a coding agent (Claude,
 * a closed model by Anthropic).
 * GET ?address=0x…: the message this wallet signs to pay for the signed-in Farcaster, Lens or Bluesky person.
 * POST { message, signature }: checked (ours, current, naming this session's person, signed by that address), then
 * kept as an intent; its id goes back. Wallet accounts use /api/wallet/claim instead. Off: 404, nothing kept.
 */
const off = () => NextResponse.json({ error: 'Not available' }, { status: 404 });
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!personBalanceOn()) return off();
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (!holdsPersonBalance(person)) return NextResponse.json({ error: 'A wallet account adds payments on its wallet panel' }, { status: 409 });
  const address = new URL(request.url).searchParams.get('address') ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const nonce = newNonce();
  if (!nonce) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  const host = domain(request);
  return NextResponse.json({ message: payMessage({ domain: host, uri: `https://${host}`, address: address as `0x${string}`, person, nonce }) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!personBalanceOn()) return off();
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (!holdsPersonBalance(person)) return NextResponse.json({ error: 'A wallet account adds payments on its wallet panel' }, { status: 409 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available yet' }, { status: 503 });
  const { message, signature } = (await request.json().catch(() => ({}))) as { message?: unknown; signature?: unknown };
  if (typeof message !== 'string' || message.length > 2000 || typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const address = await verifyPayIntent(message, signature as `0x${string}`, domain(request), person);
  if (!address) return NextResponse.json({ error: 'That signature is not for this account' }, { status: 403 });
  const intent = await recordIntent(sql, person, address);
  return NextResponse.json({ intent }, { headers: noStore });
}
