import { NextResponse } from 'next/server';
import { getPerson, signedInAs } from '~/lib/auth';
import { db } from '~/lib/db';
import { CHAT } from '~/lib/config';
import { directKey, gatewayToken, servingAllowed } from '~/lib/chat/model';
import { usedToday } from '~/lib/chat/limits';
import { mayAsk } from '~/lib/chat/gate';

/**
 * The assistant's state for the signed-in reader: available or not, the model,
 * the host its messages go to, and how many of today's messages are left.
 * 401 when signed out (screen 9d).
 */
export async function GET(request: Request) {
  // As the ask route: a Farcaster sign-in, or an account linked to a FID, asks as that FID; who else may ask is
  // src/lib/chat/gate.ts. Here the gate never asks a network (lookUp: false): only a kept decision can refuse; with none
  // yet, the question decides. A refusal is 403 with the reason and the account's kind, so the panel says who can ask.
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in to use the assistant' }, { status: 401 });
  // Who can ask comes first, as before (an unlinked wallet was answered 403 on any deployment). No network is asked.
  const gate = await mayAsk(db(), person, { lookUp: false, signedInAs: signedInAs(request) }).catch(() => null);
  if (gate && !gate.ok) return NextResponse.json({ error: gate.error, reason: gate.reason, account: gate.account }, { status: 403 });
  // host: the gateway, named only while it is the fallback route.
  const base = { model: CHAT.modelName, host: CHAT.gatewayFallback ? CHAT.host : null, provider: CHAT.providerName, route: CHAT.route, perDay: CHAT.messagesPerDay };
  if (!servingAllowed()) return NextResponse.json({ ...base, available: false, reason: 'provider-not-chosen', left: 0 });
  const sql = db();
  if (!sql || (!gatewayToken(request) && !directKey())) return NextResponse.json({ ...base, available: false, reason: 'not-configured', left: 0 });
  try {
    const used = await usedToday(sql, person);
    return NextResponse.json({ ...base, available: true, left: Math.max(0, CHAT.messagesPerDay - used) });
  } catch (e) {
    // Most likely migration 0006 is not applied yet.
    console.error('chat status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, available: false, reason: 'not-configured', left: 0 });
  }
}
