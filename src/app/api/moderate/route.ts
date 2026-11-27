import { NextResponse } from 'next/server';
import { hideReachesTakes } from '~/lib/voice/take-hide';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { MODERATOR_FIDS } from '~/lib/config';
import { fullQueue, workOf } from '~/lib/images/designs';
import { moveToPrivate } from '~/lib/images/store';
import { recheckMaker } from '~/lib/checks/decisions';
import { hideReachesChapterPictures } from '~/lib/chapter-pictures/after-hide';
import { dismissStoryboard, hiddenStoryboards, hideStoryboard, storyboardQueue, unhideStoryboard } from '~/lib/voice/moderation';
import { moderationDeps } from '~/lib/voice/publish-deps';

/**
 * The moderator queue (section 6; P5b: moderators only hide). For each reported image: the image,
 * the exact prompt and style, the passage, the model, the date, the checks, the creator's public
 * FID, each reason with its count and the reporters' notes. Never who reported. Two actions only:
 * Hide, or Dismiss the reports. Nothing here can publish, order or label, and an image can't be unhidden here.
 * Step 4: reported styles and character sheets come in the same queue, with the same two actions.
 * Published storyboards (Nate, 2026-11-23: one queue, which the ntfy alert's count covers): reported ones with Hide or
 * Dismiss, and the hidden ones with Unhide. Principle 5 (reread by Nate 2026-11-23): "A moderator may unhide what was
 * hidden; it puts back exactly what its maker published, and never publishes anything else." Unhide puts back the
 * publication's own files, byte for byte, from their private copies (src/lib/voice/moderation.ts).
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!MODERATOR_FIDS.includes(fid)) return NextResponse.json({ error: 'Moderators only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ items: [], storyboards: [], hiddenStoryboards: [] });
  const [rows, storyboards, hidden] = await Promise.all([fullQueue(sql), storyboardQueue(sql), hiddenStoryboards(sql)]);
  return NextResponse.json({ items: rows, storyboards, hiddenStoryboards: hidden }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!MODERATOR_FIDS.includes(fid)) return NextResponse.json({ error: 'Moderators only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const { versionId, publicationId, action } = (await request.json().catch(() => ({}))) as { versionId?: unknown; publicationId?: unknown; action?: unknown };
  if (typeof publicationId === 'string') {
    const deps = moderationDeps();
    if (action === 'hide') {
      const r = await hideStoryboard(sql, publicationId, fid, 'moderator', null, null, deps);
      return r.hidden ? NextResponse.json({ done: 'hide', moved: r.moved, failed: r.failed }) : NextResponse.json({ error: 'Not shown, or no such storyboard' }, { status: 404 });
    }
    if (action === 'unhide') {
      const r = await unhideStoryboard(sql, publicationId, fid, 'moderator', deps);
      return r.shown ? NextResponse.json({ done: 'unhide', restored: r.restored, failed: r.failed }) : NextResponse.json({ error: 'Not hidden, or no such storyboard' }, { status: 404 });
    }
    if (action === 'dismiss') return (await dismissStoryboard(sql, publicationId, fid)) ? NextResponse.json({ done: 'dismiss' }) : NextResponse.json({ error: 'No such storyboard' }, { status: 404 });
    return NextResponse.json({ error: 'Hide, unhide or dismiss only' }, { status: 400 });
  }
  const el = typeof versionId === 'string' ? await workOf(sql, versionId) : null;
  if (!el) return NextResponse.json({ error: 'No such image' }, { status: 404 });
  if (action === 'hide') {
    await sql.begin(async (tx) => {
      await tx`update studio.elements set status = 'hidden' where id = ${el.elementId}`;
      await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'hidden', by_fid: fid, role: 'moderator' })}`;
    });
    for (const sha of el.files) await moveToPrivate(sha).catch((e) => console.error('moderate: moving the hidden file failed', (e as Error).name));
    // The maker is checked again at their next Generate or publish (owner, 2026-11-04).
    await recheckMaker(sql, el.byFid);
    await hideReachesChapterPictures(sql, el.elementId);
    // The takes that copied this picture are hidden with it (NEXT_voice_takes.sql; Nate, 2026-11-26).
    await hideReachesTakes(sql, el.elementId, fid, 'moderator').catch((e) => console.error('moderate: hiding the takes failed', (e as Error).name));
  } else if (action === 'dismiss') {
    await sql`insert into studio.removal_log ${sql({ element_id: el.elementId, step: 'dismissed', by_fid: fid, role: 'moderator' })}`;
  } else return NextResponse.json({ error: 'Hide or dismiss only' }, { status: 400 });
  revalidatePath('/references');
  if (el.type === 'design') revalidatePath('/references/designs', 'layout');
  return NextResponse.json({ done: action });
}
