import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { setVersionHidden } from '~/lib/version-hide';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Hide a published scene version (owner, 2026-10-18, the You page): its maker, or the maintainer, at
 * once, no approval (src/lib/version-hide.ts). { hide: false } brings it back, by whoever hid it, once
 * the DRAFT migration 0015 records who that was. Checked here, server side, against the signed-in
 * person (a Farcaster FID or a wallet account): nobody can hide someone else's scene.
 */
export async function POST(request: Request, { params }: Ctx) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No such scene' }, { status: 404 });
  const { hide } = (await request.json().catch(() => ({}))) as { hide?: unknown };
  try {
    const r = await setVersionHidden(sql, person, id, hide !== false);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ hidden: r.hidden, by: r.by, canUnhide: r.canUnhide });
  } catch (e) {
    // 42P01: the adaptation tables aren't there (0012 not applied on this database).
    if ((e as { code?: string }).code === '42P01') return NextResponse.json({ error: 'Not available here' }, { status: 503 });
    throw e;
  }
}
