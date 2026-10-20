import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { agentsOn } from '~/lib/agents/core';
import { decide, draftNotesOf, piecesOf } from '~/lib/agents/pieces';
import { addRequest, openRequests } from '~/lib/agents/requests';
import { hasConsented } from '~/lib/consent';

/**
 * The review list on /you: what a person's agents drafted for them. Only the person publishes or
 * discards; nothing an agent made is public before that.
 */
const noStore = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  return NextResponse.json({ drafts: await piecesOf(person, 'draft'), notes: await draftNotesOf(person), published: await piecesOf(person, 'published'), waiting: await openRequests(person) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  // The person reacts (owner, 2026-10-20): keep (publish it), try again (discard it; the agent tries again),
  // or say more (their words, typed or spoken, become the agent's next request on it). Publish and discard
  // stay as the plain words for the same two acts.
  const b = (await request.json().catch(() => ({}))) as { what?: string; id?: string; action?: string; words?: string; spoken?: boolean };
  const action = b.action === 'keep' ? 'publish' : b.action;
  if ((b.what !== 'version' && b.what !== 'note') || typeof b.id !== 'string' || !['publish', 'discard', 'again', 'more'].includes(action ?? ''))
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: noStore });
  if ((action === 'again' || action === 'more') && b.what === 'version') {
    if (!(await hasConsented(person))) return NextResponse.json({ error: 'consent', consent: true }, { status: 403, headers: noStore });
    const words = typeof b.words === 'string' && b.words.trim() ? b.words : action === 'again' ? 'Try again.' : '';
    try {
      const id = await addRequest(person, action, words, b.spoken === true, { version: b.id });
      if (action === 'again') await decide(person, 'version', b.id, 'discard');
      return NextResponse.json({ ok: true, request: id }, { headers: noStore });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400, headers: noStore });
    }
  }
  const ok = await decide(person, b.what, b.id, action as 'publish' | 'discard');
  return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: noStore });
}
