import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { ILLUSTRATION_CHECK } from '~/lib/config';
import { driftGrids } from '~/lib/illustration-check/review';

/**
 * The owner's drift grids (owner, 2026-10-25), behind /you/illustrations/characters. Owner only
 * (ILLUSTRATION_CHECK.owners), as /api/you/illustrations: per style and character, every published image of them with
 * the latest decision. A flag is saved through POST /api/you/illustrations (Regenerate with the owner's note).
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!ILLUSTRATION_CHECK.owners.includes(fid)) return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  return NextResponse.json(await driftGrids(db()), { headers: { 'Cache-Control': 'no-store' } });
}
