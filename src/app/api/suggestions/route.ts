import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { ToolInputError } from '~/lib/agent/tools';
import { agentsOn, allowed } from '~/lib/agents/core';
import { addSuggestion, allSuggestions, suggestionsOf, suggestionsReader } from '~/lib/agents/suggestions';
import { allFailures, allGaps } from '~/lib/agents/edits';
import { allDraftNotes } from '~/lib/agents/pieces';

/**
 * "Suggest an improvement" (owner, 2026-10-22), for the invited people. A person sees their own; the owner
 * also sees everyone's, with who said it and where they were, and every agent's gaps (what someone asked that
 * their agent couldn't do; owner, 2026-10-22). Never published.
 */
const noStore = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  // Only the invited people see anything here; everyone else gets the same 404 as before.
  if (!(await allowed(person))) return new NextResponse('Not found', { status: 404 });
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  return NextResponse.json({ mine: await suggestionsOf(person), ...(person === suggestionsReader() ? { all: await allSuggestions(person), gaps: await allGaps(person), failures: await allFailures(person), notes: await allDraftNotes(person) } : {}) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!agentsOn()) return new NextResponse('Not found', { status: 404 });
  const person = await getPerson(request);
  if (!(await allowed(person))) return new NextResponse('Not found', { status: 404 });
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  const b = (await request.json().catch(() => ({}))) as { words?: unknown; spoken?: unknown; page?: unknown; moment?: unknown; seconds?: unknown };
  try {
    const id = await addSuggestion(person, b.words, b.spoken === true, { page: b.page, moment: b.moment, seconds: b.seconds });
    return NextResponse.json({ id }, { headers: noStore });
  } catch (e) {
    if (e instanceof ToolInputError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    throw e;
  }
}
