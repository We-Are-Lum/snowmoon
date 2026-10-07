import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { CHAT } from '~/lib/config';
import { gatewayToken, servingAllowed } from '~/lib/chat/model';
import { usedToday } from '~/lib/chat/limits';

/**
 * The assistant's state for the signed-in reader: available or not, the model,
 * the host its messages go to, and how many of today's messages are left.
 * 401 when signed out (screen 9d).
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to use the assistant' }, { status: 401 });
  const base = { model: CHAT.modelName, host: CHAT.host, provider: CHAT.providerName, perDay: CHAT.messagesPerDay };
  if (!servingAllowed()) return NextResponse.json({ ...base, available: false, reason: 'provider-not-chosen', left: 0 });
  const sql = db();
  if (!sql || !gatewayToken(request)) return NextResponse.json({ ...base, available: false, reason: 'not-configured', left: 0 });
  try {
    const used = await usedToday(sql, fid);
    return NextResponse.json({ ...base, available: true, left: Math.max(0, CHAT.messagesPerDay - used) });
  } catch (e) {
    // Most likely migration 0006 is not applied yet.
    console.error('chat status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, available: false, reason: 'not-configured', left: 0 });
  }
}
