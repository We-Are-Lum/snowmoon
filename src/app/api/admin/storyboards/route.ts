import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { hiddenStoryboards, storyboardQueue } from '~/lib/voice/moderation';

/**
 * The admins' storyboard queue (Nate, 2026-11-23): reported published storyboards (reasons and counts, how many people
 * reported, never who, and the notes) and the hidden ones (who hid them, and why). Admins only; 404 to anyone else.
 * The actions are POST /api/admin/hide, kind "storyboard".
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null || !isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ reported: [], hidden: [] });
  const [reported, hidden] = await Promise.all([storyboardQueue(sql), hiddenStoryboards(sql)]);
  return NextResponse.json({ reported, hidden }, { headers: { 'Cache-Control': 'no-store' } });
}
