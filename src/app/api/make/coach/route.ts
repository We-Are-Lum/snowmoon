import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { complete, directKey, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';
import { coach, CoachError } from '~/lib/make/coach';
import { makeOn, testPerson } from '~/lib/make/flag';
import { fakeComplete } from '~/lib/make/test-model';

/**
 * "Make your own": one message to the coach (src/lib/make/coach.ts). Off (404) unless MAKE_YOUR_OWN is on.
 * Signed in with Farcaster or a wallet (getPerson; owner, 2026-10-19). The reading assistant's models, guard and spend
 * cap; its own daily count (MAKE.coachPerDay). The message, the draft text sent with it and the reply pass through
 * and are not stored.
 */
export async function POST(request: Request) {
  if (!makeOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const person = testPerson(request) ?? (await getPerson(request));
  if (person === null) return NextResponse.json({ error: 'Sign in to use the coach' }, { status: 401 });
  const sql = db();
  const token = gatewayToken(request);
  const fake = fakeComplete();
  if (!sql || (!fake && ((!token && !directKey()) || !servingAllowed()))) return NextResponse.json({ error: 'The coach is not available on this deployment' }, { status: 503 });
  try {
    const result = await coach(
      {
        sql,
        person,
        complete: fake ?? ((model, messages, opts) => complete(token, model, messages, opts)),
        systemPrompt: promptFile('make-coach.md'),
        guardPolicy: promptFile('make-guard.md'),
        reminder: promptFile('make-reminder.md'),
      },
      await request.json().catch(() => ({})),
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof CoachError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ModelUnavailable) return NextResponse.json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
    console.error('make coach failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again in a moment.' }, { status: 503 });
  }
}
