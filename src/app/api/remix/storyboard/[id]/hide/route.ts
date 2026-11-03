import { NextResponse } from 'next/server';
import { actsFor } from '~/lib/wallet/credit';
import { revalidatePath } from 'next/cache';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { tryAgain } from '~/lib/try-again';
import { isAdmin } from '~/lib/admins';
import { boardById } from '~/lib/remix/storyboards';
import { setBoardHidden } from '~/lib/remix/hide';

type Ctx = { params: Promise<{ id: string }> };

/** Hide a storyboard: its maker, or the maintainer (owner, 2026-10-18). { hide: false } brings it back, by whoever hid it. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const person = await getPerson(request);
    if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    const sql = db();
    if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
    const { id } = await params;
    const { hide } = (await request.json().catch(() => ({}))) as { hide?: unknown };
    const r = await setBoardHidden(sql, person, id, hide !== false);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    revalidatePath(`/storyboard/${id}`);
    return NextResponse.json({ hidden: r.board.hidden, by: r.board.hiddenRole });
  } catch (e) {
    return tryAgain('storyboard hide', e);
  }
}

export async function GET(request: Request, { params }: Ctx) {
  const person = await getPerson(request);
  const sql = db();
  if (person === null || !sql) return NextResponse.json({ canHide: false }, { headers: { 'Cache-Control': 'no-store' } });
  const { id } = await params;
  const b = await boardById(sql, id);
  const maker = !!b && (await actsFor(sql, person, b.person));
  const maint = isAdmin(person);
  const canUnhide = !!b && b.hidden && (b.hiddenRole === 'maintainer' ? maint : maker);
  return NextResponse.json({ canHide: !!b && (maker || maint), hidden: b?.hidden ?? false, canUnhide, as: maker ? 'maker' : maint ? 'maintainer' : null }, { headers: { 'Cache-Control': 'no-store' } });
}
