import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { agentsOn } from '~/lib/agents/core';
import { decide, draftNotesOf, piecesOf } from '~/lib/agents/pieces';

/**
 * The review list on /you: what a person's agents drafted for them. Only the person publishes or
 * discards; nothing an agent made is public before that.
 */
const noStore = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  return NextResponse.json({ drafts: await piecesOf(person, 'draft'), notes: await draftNotesOf(person), published: await piecesOf(person, 'published') }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  const b = (await request.json().catch(() => ({}))) as { what?: string; id?: string; action?: string };
  if ((b.what !== 'version' && b.what !== 'note') || typeof b.id !== 'string' || (b.action !== 'publish' && b.action !== 'discard'))
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: noStore });
  const ok = await decide(person, b.what, b.id, b.action);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: noStore });
}
