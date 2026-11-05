import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { claim, personBalanceOn } from '~/lib/balance/person';

/**
 * Paying per person (DRAFT, PERSON_BALANCE off; docs/proposals/person-balance.md). Drafted by a coding agent (Claude,
 * a closed model by Anthropic). POST { intent, txHash }: credits a Base payment to the signed-in person through one of
 * their intents (src/lib/balance/person.ts, claim). Off: 404. Refusals give only the reason, never whose an intent or
 * a transaction is; nothing about the transaction or the person is logged.
 */
export async function POST(request: Request) {
  if (!personBalanceOn()) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available yet' }, { status: 503 });
  const { intent, txHash } = (await request.json().catch(() => ({}))) as { intent?: unknown; txHash?: unknown };
  if (typeof intent !== 'string' || typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const r = await claim(sql, person, intent, txHash as `0x${string}`).catch((e) => {
    console.error('person claim: failed', (e as Error).name);
    return null;
  });
  if (!r) return NextResponse.json({ error: 'Try again in a moment', retry: true }, { status: 503 });
  if (!r.ok) {
    const retry = r.why === 'pending' || r.why === 'not-found';
    return NextResponse.json({ error: 'Not added', reason: r.why, retry }, { status: retry ? 409 : 422 });
  }
  return NextResponse.json({ added: r.usd, token: r.token, balanceUsd: r.balanceUsd }, { headers: { 'Cache-Control': 'no-store' } });
}
