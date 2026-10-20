import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { clearPick, myPicks, setPick } from '~/lib/images/designs';

/**
 * "Use as my style" / "Use as my {character}" and My picks (step 4). Private: every request reads or
 * writes only the signed-in person's own picks (studio.picks, one per entity). No route lists
 * anyone else's picks or how many people picked anything. Open to everyone signed in, with Farcaster
 * or a wallet (owner, 2026-10-19: "anyone can apply published styles"); a wallet account's picks are
 * kept under minus its account number, as everywhere getPerson is used. Making styles stays invited-only
 * (/api/designs, /api/designs/sample). Privacy names picks in the same merge (docs/legal/picks-draft.md).
 */
const noStore = { 'Cache-Control': 'no-store' };
const no = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

async function who(request: Request) {
  const fid = await getPerson(request);
  if (fid === null) return { error: NextResponse.json({ error: 'Sign in to see your picks' }, { status: 401, headers: noStore }) };
  const sql = db();
  if (!sql) return { error: no('Not available here', 503) };
  return { fid, sql };
}

export async function GET(request: Request) {
  const w = await who(request);
  if ('error' in w) return w.error;
  return NextResponse.json({ picks: await myPicks(w.sql, w.fid) }, { headers: noStore });
}

/** Body: { versionId }. That version becomes your pick for its style or character (replacing any earlier one). */
export async function POST(request: Request) {
  const w = await who(request);
  if ('error' in w) return w.error;
  const { versionId } = (await request.json().catch(() => ({}))) as { versionId?: unknown };
  const done = await setPick(w.sql, w.fid, String(versionId ?? ''));
  if (!done) return no('No such design', 404);
  return NextResponse.json({ picks: await myPicks(w.sql, w.fid) }, { headers: noStore });
}

/** Body: { entityId }. Clears your pick for that style or character. */
export async function DELETE(request: Request) {
  const w = await who(request);
  if ('error' in w) return w.error;
  const { entityId } = (await request.json().catch(() => ({}))) as { entityId?: unknown };
  await clearPick(w.sql, w.fid, String(entityId ?? ''));
  return NextResponse.json({ picks: await myPicks(w.sql, w.fid) }, { headers: noStore });
}
