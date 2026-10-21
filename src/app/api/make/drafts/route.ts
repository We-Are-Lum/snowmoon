import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { DraftError } from '~/lib/make/draft';
import { createDraft, listDrafts } from '~/lib/make/drafts';
import { makeOn, testPerson } from '~/lib/make/flag';

/** "Make your own": your drafts (GET) and a new one (POST). Private to you. Off (404) unless MAKE_YOUR_OWN is on. */
const off = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!makeOn()) return off();
  const person = testPerson(request) ?? (await getPerson(request));
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  return NextResponse.json({ drafts: await listDrafts(sql, person) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!makeOn()) return off();
  const person = testPerson(request) ?? (await getPerson(request));
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  try {
    const r = await createDraft(sql, person, await request.json().catch(() => ({})));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json(r.draft, { headers: noStore });
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('make draft create failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again in a moment.', retry: true }, { status: 503 });
  }
}
