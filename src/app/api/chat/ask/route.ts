import { NextResponse } from 'next/server';
import { getPerson, signedInAs } from '~/lib/auth';
import { mayAsk } from '~/lib/chat/gate';
import { db } from '~/lib/db';
import { AskError, ask, type AskInput } from '~/lib/chat/ask';
import { complete, directKey, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';

/**
 * Ask about the book (slice 1). Signed-in readers only. The question and the
 * answer pass through and are not stored; the device keeps the thread.
 * Body: { question, limit, attached?, history? }.
 */
export async function POST(request: Request) {
  // A Farcaster sign-in, or a wallet, Lens or Bluesky account linked to a FID, asks as that FID (owner, 2026-10-22: Luis,
  // signed in with his linked wallet, was asked to sign in again; 2026-11-05: Lens and Bluesky the same). Who else may ask,
  // and the network check at a question, is src/lib/chat/gate.ts (ASSISTANT). A refusal is 403 (or 503 when a check
  // can't be reached), not 401, so the browser keeps its session; it uses no question.
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in to use the assistant' }, { status: 401 });
  const sql = db();
  const token = gatewayToken(request);
  if (!sql || (!token && !directKey()) || !servingAllowed()) return NextResponse.json({ error: 'The assistant is not available on this deployment' }, { status: 503 });
  try {
    const gate = await mayAsk(sql, person, { lookUp: true, signedInAs: signedInAs(request) });
    if (!gate.ok) return NextResponse.json({ error: gate.error, reason: gate.reason, account: gate.account }, { status: gate.status });
    const input = (await request.json()) as AskInput;
    const result = await ask(
      {
        sql,
        fid: person,
        complete: (model, messages, opts) => complete(token, model, messages, opts),
        systemPrompt: promptFile('chat-ask.md'),
        guardPolicy: promptFile('chat-guard.md'),
        reminder: promptFile('chat-reminder.md'),
        searchPrompt: promptFile('chat-search-terms.md'),
        supportPolicy: promptFile('chat-support.md'),
      },
      input,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AskError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ModelUnavailable) return NextResponse.json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
    // Only the error's type: a database error carries its query parameters, and the search's parameter is the question.
    console.error('chat ask failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
