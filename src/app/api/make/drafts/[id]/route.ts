import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { DraftError } from '~/lib/make/draft';
import { deleteDraft, getDraft, updateDraft } from '~/lib/make/drafts';
import { makeOn, testPerson } from '~/lib/make/flag';

/** "Make your own": one of your drafts. Someone else's reads as not found. Off (404) unless MAKE_YOUR_OWN is on. */
type Ctx = { params: Promise<{ id: string }> };
const noStore = { 'Cache-Control': 'no-store' };
const missing = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

async function who(request: Request) {
  if (!makeOn()) return { res: missing() };
  const person = testPerson(request) ?? (await getPerson(request));
  if (person === null) return { res: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) };
  const sql = db();
  if (!sql) return { res: NextResponse.json({ error: 'Not available here' }, { status: 503 }) };
  return { person, sql };
}

export async function GET(request: Request, { params }: Ctx) {
  const w = await who(request);
  if ('res' in w) return w.res;
  const d = await getDraft(w.sql, w.person, (await params).id);
  return d ? NextResponse.json(d, { headers: noStore }) : missing();
}

export async function PUT(request: Request, { params }: Ctx) {
  const w = await who(request);
  if ('res' in w) return w.res;
  try {
    const d = await updateDraft(w.sql, w.person, (await params).id, await request.json().catch(() => ({})));
    return d ? NextResponse.json(d, { headers: noStore }) : missing();
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('make draft save failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Something went wrong on our side. Try again in a moment.', retry: true }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const w = await who(request);
  if ('res' in w) return w.res;
  return (await deleteDraft(w.sql, w.person, (await params).id)) ? NextResponse.json({ deleted: true }) : missing();
}
