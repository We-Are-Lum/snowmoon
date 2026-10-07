import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { AskError, ask, type AskInput } from '~/lib/chat/ask';
import { complete, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';

/**
 * Ask about the book (slice 1). Signed-in readers only. The question and the
 * answer pass through and are not stored; the device keeps the thread.
 * Body: { question, limit, attached?, history? }.
 */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to use the assistant' }, { status: 401 });
  const sql = db();
  const token = gatewayToken(request);
  if (!sql || !token || !servingAllowed()) return NextResponse.json({ error: 'The assistant is not available on this deployment' }, { status: 503 });
  try {
    const input = (await request.json()) as AskInput;
    const result = await ask(
      {
        sql,
        fid,
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
