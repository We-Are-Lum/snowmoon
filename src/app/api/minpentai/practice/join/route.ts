import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { playFor } from '~/lib/agents/core';
import { ToolInputError } from '~/lib/agent/tools';
import { appUrl } from '~/lib/config';
import { joinFor } from '~/lib/minpentai/agent-play/act';

export const dynamic = 'force-dynamic';

/**
 * Joining a practice match on the page (owner, 2026-11-03): a private one with its invite, or a public one from the
 * open list. Only a person signed in, to whom agent play is open. Returns their live link (their side only).
 */
export async function POST(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (!playFor(person)) return NextResponse.json({ error: 'Practice matches aren’t open to your account yet.' }, { status: 403 });
  let body: { match_id?: unknown; invite?: unknown; show_name?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'match_id missing' }, { status: 400 }); }
  try {
    const { m, secret } = await joinFor(person, { matchId: body.match_id, invite: typeof body.invite === 'string' ? body.invite : undefined, showName: body.show_name === true, agent: { id: null, name: 'the live page', model: null } });
    return NextResponse.json({ ok: true, live_url: `${appUrl()}/minpentai/m/${m.id}?k=${secret}` });
  } catch (e) {
    if (e instanceof ToolInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
