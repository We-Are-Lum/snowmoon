import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { agentsOn } from '~/lib/agents/core';
import { approve, checkAuthorize, deniedRedirect, OAuthError } from '~/lib/agents/oauth';

/**
 * The person's answer on /oauth/authorize. Only a person signed in (Farcaster or wallet) can make an
 * agent of themselves; never an agent's token (getPerson never takes one). Answers the address to send
 * the browser back to: with a code, or with access_denied.
 */
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { query?: string; allow?: boolean };
  try {
    const ask = await checkAuthorize(new URLSearchParams(body.query ?? ''));
    const to = body.allow ? await approve(ask, person) : deniedRedirect(ask);
    return NextResponse.json({ to }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json({ error: e.message }, { status: e.status === 409 ? 409 : 400 });
    throw e;
  }
}
