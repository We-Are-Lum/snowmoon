import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { MODERATOR_FIDS } from '~/lib/config';
import { elementOf, reportQueue } from '~/lib/images/data';
import { moveToPrivate } from '~/lib/images/store';

/**
 * The moderator queue (section 6; P5b: moderators only hide). For each reported image: the image,
 * the exact prompt and style, the passage, the model, the date, the checks, the creator's public
 * FID, each reason with its count and the reporters' notes. Never who reported. Two actions only:
 * Hide, or Dismiss the reports. Nothing here can publish, order, label or unhide.
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!MODERATOR_FIDS.includes(fid)) return NextResponse.json({ error: 'Moderators only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ items: [] });
  const rows = await reportQueue(sql);
  return NextResponse.json({ items: rows }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!MODERATOR_FIDS.includes(fid)) return NextResponse.json({ error: 'Moderators only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const { versionId, action } = (await request.json().catch(() => ({}))) as { versionId?: unknown; action?: unknown };
  const el = typeof versionId === 'string' ? await elementOf(sql, versionId) : null;
  if (!el) return NextResponse.json({ error: 'No such image' }, { status: 404 });
  if (action === 'hide') {
    await sql.begin(async (tx) => {
      await tx`update studio.elements set status = 'hidden' where id = ${el.elementId}`;
      await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'hidden', by_fid: fid, role: 'moderator' })}`;
    });
    await moveToPrivate(el.sha256).catch((e) => console.error('moderate: moving the hidden file failed', (e as Error).name));
  } else if (action === 'dismiss') {
    await sql`insert into studio.removal_log ${sql({ element_id: el.elementId, step: 'dismissed', by_fid: fid, role: 'moderator' })}`;
  } else return NextResponse.json({ error: 'Hide or dismiss only' }, { status: 400 });
  revalidatePath('/images');
  return NextResponse.json({ done: action });
}
