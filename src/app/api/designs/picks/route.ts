import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { clearPick, myPicks, setPick } from '~/lib/images/designs';
import { IMAGES } from '~/lib/config';
import { IMAGE_WORDING } from '~/lib/images/wording';

/**
 * "Use as my style" / "Use as my {character}" and My picks (step 4). Private: every request reads or
 * writes only the signed-in person's own picks (studio.picks, one per entity). No route lists
 * anyone else's picks or how many people picked anything. Invited FIDs only, for now (2026-10-10):
 * a pick is a private row under the FID that the Privacy Policy does not yet name; the owner's words
 * for it are pending. Others get no picks and a refusal.
 */
const noStore = { 'Cache-Control': 'no-store' };
const no = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

async function who(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return { error: NextResponse.json({ error: 'Sign in with Farcaster to see your picks' }, { status: 401, headers: noStore }) };
  const sql = db();
  if (!sql) return { error: no('Not available here', 503) };
  return { fid, sql };
}

export async function GET(request: Request) {
  const w = await who(request);
  if ('error' in w) return w.error;
  if (!IMAGES.invited.includes(w.fid)) return NextResponse.json({ picks: [] }, { headers: noStore });
  return NextResponse.json({ picks: await myPicks(w.sql, w.fid) }, { headers: noStore });
}

/** Body: { versionId }. That version becomes your pick for its style or character (replacing any earlier one). */
export async function POST(request: Request) {
  const w = await who(request);
  if ('error' in w) return w.error;
  if (!IMAGES.invited.includes(w.fid)) return no(IMAGE_WORDING.designs.form.notInvited, 403);
  const { versionId } = (await request.json().catch(() => ({}))) as { versionId?: unknown };
  const done = await setPick(w.sql, w.fid, String(versionId ?? ''));
  if (!done) return no('No such design', 404);
  return NextResponse.json({ picks: await myPicks(w.sql, w.fid) }, { headers: noStore });
}

/** Body: { entityId }. Clears your pick for that style or character. */
export async function DELETE(request: Request) {
  const w = await who(request);
  if ('error' in w) return w.error;
  if (!IMAGES.invited.includes(w.fid)) return no(IMAGE_WORDING.designs.form.notInvited, 403);
  const { entityId } = (await request.json().catch(() => ({}))) as { entityId?: unknown };
  await clearPick(w.sql, w.fid, String(entityId ?? ''));
  return NextResponse.json({ picks: await myPicks(w.sql, w.fid) }, { headers: noStore });
}
