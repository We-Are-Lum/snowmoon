import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { hasConsented } from '~/lib/consent';
import { ToolInputError } from '~/lib/agent/tools';
import { agentsOn } from '~/lib/agents/core';
import { checkPlain } from '~/lib/agents/filter';
import { addNote } from '~/lib/agents/pieces';

/**
 * A person's note on a published piece version: public at once, with their name, after the own-words
 * consent. (The moment-notes design adds the prompt check and per-person limits; see design §4.)
 */
export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (!(await hasConsented(person))) return NextResponse.json({ error: 'consent', consent: true }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { on?: string; text?: string };
  try {
    const note = await addNote(typeof b.on === 'string' ? b.on : '', person, null, checkPlain(b.text, 'note', 500));
    return NextResponse.json({ note });
  } catch (e) {
    if (e instanceof ToolInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
