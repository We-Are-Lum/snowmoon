import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { realDeps, setLook } from '~/lib/chapter-pictures/pictures';

/**
 * The look every redo uses (owner, 2026-11-18: "one saved look used for every chapter unless an admin changes it"):
 * { chapter: null, look } for every chapter, { chapter: n, look } for one chapter's own, look null to clear a chapter's
 * own. A look is one of the site's offered styles ({ kind: 'style', id: its version }) or a line ({ kind: 'line', text }).
 * It changes nothing public: it is used by the next redo. Admins only: anyone else gets 401 or 404.
 */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available on this copy of the site' }, { status: 503 });
  const r = await setLook(sql, fid, await request.json().catch(() => ({})), (await realDeps()).consented);
  return NextResponse.json(r.json, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
