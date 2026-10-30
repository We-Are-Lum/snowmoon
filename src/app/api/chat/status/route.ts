import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { CHAT } from '~/lib/config';
import { directKey, gatewayToken, servingAllowed } from '~/lib/chat/model';
import { usedToday } from '~/lib/chat/limits';

/**
 * The assistant's state for the signed-in reader: available or not, the model,
 * the host its messages go to, and how many of today's messages are left.
 * 401 when signed out (screen 9d).
 */
export async function GET(request: Request) {
  // A Farcaster sign-in, or a wallet linked to a FID, asks as that FID (owner, 2026-10-22: Luis, signed in with his linked
  // wallet, was asked to sign in again); the limit is still counted per Farcaster account. A wallet not linked to one is
  // answered 403, not 401, so the browser keeps its wallet session.
  const fid = await getPerson(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to use the assistant' }, { status: 401 });
  if (fid < 0) return NextResponse.json({ error: 'Sign in with Farcaster to use the assistant' }, { status: 403 });
  // host: the gateway, named only while it is the fallback route.
  const base = { model: CHAT.modelName, host: CHAT.gatewayFallback ? CHAT.host : null, provider: CHAT.providerName, route: CHAT.route, perDay: CHAT.messagesPerDay };
  if (!servingAllowed()) return NextResponse.json({ ...base, available: false, reason: 'provider-not-chosen', left: 0 });
  const sql = db();
  if (!sql || (!gatewayToken(request) && !directKey())) return NextResponse.json({ ...base, available: false, reason: 'not-configured', left: 0 });
  try {
    const used = await usedToday(sql, fid);
    return NextResponse.json({ ...base, available: true, left: Math.max(0, CHAT.messagesPerDay - used) });
  } catch (e) {
    // Most likely migration 0006 is not applied yet.
    console.error('chat status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, available: false, reason: 'not-configured', left: 0 });
  }
}
