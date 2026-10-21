import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { hasConsented } from '~/lib/consent';
import { ToolInputError } from '~/lib/agent/tools';
import { agentsOn, allowed } from '~/lib/agents/core';
import { addRequest, openRequests } from '~/lib/agents/requests';

/**
 * What a person tells their agent: an idea, or a note on a frame, a moment or one of their drafts; typed,
 * or spoken and transcribed (the person checks the words before sending). Their own words: the own-words
 * consent first, since they become public with whatever answers them once it is kept.
 */
const noStore = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  // Only the allowlisted people (the owner) see anything here; everyone else gets the same 404 as before.
  if (!(await allowed(person))) return new NextResponse('Not found', { status: 404 });
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  return NextResponse.json({ requests: await openRequests(person) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  // Only the allowlisted people (the owner) see anything here; everyone else gets the same 404 as before.
  if (!(await allowed(person))) return new NextResponse('Not found', { status: 404 });
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  if (!(await hasConsented(person))) return NextResponse.json({ error: 'consent', consent: true }, { status: 403, headers: noStore });
  const b = (await request.json().catch(() => ({}))) as { kind?: string; words?: string; spoken?: boolean; version?: string; moment?: string };
  const kind = b.kind === 'note' ? 'note' : 'idea';
  try {
    const id = await addRequest(person, kind, typeof b.words === 'string' ? b.words : '', b.spoken === true, {
      ...(typeof b.version === 'string' && /^[0-9a-f-]{36}$/.test(b.version) ? { version: b.version } : {}),
      ...(typeof b.moment === 'string' ? { moment: b.moment } : {}),
    });
    return NextResponse.json({ id }, { headers: noStore });
  } catch (e) {
    if (e instanceof ToolInputError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    throw e;
  }
}
