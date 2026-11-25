import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { getOutline, hideOutline } from '~/lib/challenge/episode/outlines';
import { isModerator } from '~/lib/challenge/moderators';
import { episodeVisibleTo } from '~/lib/challenge/episode/visibility';

/**
 * One outline (owner, 2026-11-24). GET: the outline, for the admins' view while Episode 1 is off (a withdrawn or
 * hidden one is "not found", as on its public page). POST { hide: true }: a moderator (MODERATOR_FIDS) hides it; it
 * stays on record, marked hidden, with who and when.
 */
type Ctx = { params: Promise<{ id: string }> };
const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function GET(request: Request, { params }: Ctx) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NOT_FOUND();
  const sql = db();
  const o = sql ? await getOutline(sql, (await params).id) : null;
  if (!o || o.withdrawn || o.hidden) return NOT_FOUND();
  return NextResponse.json(o, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: Ctx) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NOT_FOUND();
  if (person === null || !isModerator(person)) return NextResponse.json({ error: 'Moderators only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { hide?: unknown };
  if (body.hide !== true) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { id } = await params;
  const r = await hideOutline(sql, person, id);
  if (!r.ok) return NextResponse.json({ error: r.why }, { status: r.status });
  revalidatePath('/challenge/episode-1/outlines');
  revalidatePath(`/challenge/episode-1/o/${id}`);
  return NextResponse.json({ hidden: id });
}
