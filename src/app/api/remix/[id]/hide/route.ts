import { NextResponse } from 'next/server';
import { actsFor } from '~/lib/wallet/credit';
import { revalidatePath } from 'next/cache';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { tryAgain } from '~/lib/try-again';
import { frameById, isMaintainer, setHidden } from '~/lib/remix/frames';

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Hide this" on a remix frame (owner, 2026-10-18: "The owner can hide their own; I can hide anything"):
 * its maker, or the maintainer. At once, no approval. Body { hide: false } brings it back, by whoever hid it.
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const person = await getPerson(request);
    if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    const sql = db();
    if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
    const { id } = await params;
    const { hide } = (await request.json().catch(() => ({}))) as { hide?: unknown };
    const r = await setHidden(sql, person, id, hide !== false);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    revalidatePath(`/remix/${id}`);
    return NextResponse.json({ hidden: r.frame.hidden, by: r.frame.hiddenRole });
  } catch (e) {
    return tryAgain('remix hide', e);
  }
}

/** May the signed-in person hide (or bring back) this frame? For the page's Hide button. */
export async function GET(request: Request, { params }: Ctx) {
  const person = await getPerson(request);
  const sql = db();
  if (person === null || !sql) return NextResponse.json({ canHide: false }, { headers: { 'Cache-Control': 'no-store' } });
  const { id } = await params;
  const f = await frameById(sql, id);
  const maker = !!f && (await actsFor(sql, person, f.person));
  const maint = isMaintainer(person);
  const canUnhide = !!f && f.hidden && (f.hiddenRole === 'maintainer' ? maint : maker);
  return NextResponse.json({ canHide: !!f && (maker || maint), hidden: f?.hidden ?? false, canUnhide, as: maker ? 'maker' : maint ? 'maintainer' : null }, { headers: { 'Cache-Control': 'no-store' } });
}
