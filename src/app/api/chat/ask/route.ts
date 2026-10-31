import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { AskError } from '~/lib/chat/ask';
import { complete, directKey, gatewayToken, promptFile, servingAllowed, ModelUnavailable } from '~/lib/chat/model';
import { completeMake, makeTokensReady } from '~/lib/chat/make';
import { makeTools } from '~/lib/chat/make-tools';
import { makeSettingsOk, turn, type TurnInput } from '~/lib/chat/turn';

/** A make turn can take several model calls (CHAT.make.stepsPerTurn); it stops starting new ones after 180 s. */
export const maxDuration = 300;

/**
 * Ask about the book (slice 1). Signed-in readers only. The question and the
 * answer pass through and are not stored; the device keeps the thread.
 * Body: { question, limit, attached?, history?, make? }. `make` is the make token a make-mode reply gave
 * (routing C, src/lib/chat/turn.ts); while make mode is off it is ignored and nothing is routed.
 */
export async function POST(request: Request) {
  // A Farcaster sign-in, or a wallet linked to a FID, asks as that FID (owner, 2026-10-22: Luis, signed in with his linked
  // wallet, was asked to sign in again); the limit is still counted per Farcaster account. A wallet not linked to one is
  // answered 403, not 401, so the browser keeps its wallet session.
  const fid = await getPerson(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to use the assistant' }, { status: 401 });
  if (fid < 0) return NextResponse.json({ error: 'Sign in with Farcaster to use the assistant' }, { status: 403 });
  const sql = db();
  const token = gatewayToken(request);
  if (!sql || (!token && !directKey()) || !servingAllowed()) return NextResponse.json({ error: 'The assistant is not available on this deployment' }, { status: 503 });
  try {
    const input = (await request.json()) as TurnInput;
    // Make mode only through the gateway (pinned to Baseten), and only with the key that signs its tokens.
    const makeOn = makeSettingsOk() && makeTokensReady() && token !== null;
    const result = await turn(
      {
        ask: {
          sql,
          fid,
          complete: (model, messages, opts) => complete(token, model, messages, opts),
          systemPrompt: promptFile('chat-ask.md'),
          guardPolicy: promptFile('chat-guard.md'),
          reminder: promptFile('chat-reminder.md'),
          searchPrompt: promptFile('chat-search-terms.md'),
          supportPolicy: promptFile('chat-support.md'),
        },
        route: (model, messages, opts) => complete(token, model, messages, opts),
        make: makeOn
          ? { call: completeMake(token!), tools: makeTools(Math.min(32, Math.max(1, Number(input.limit) || 1))), systemPrompt: promptFile('chat-make.md') }
          : null,
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
