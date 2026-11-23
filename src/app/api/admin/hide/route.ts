import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { workOf } from '~/lib/images/designs';
import { moveToPrivate } from '~/lib/images/store';
import { loadIllustrationById } from '~/lib/illustrations';
import { forgetHidden } from '~/lib/admin-hidden';
import { recheckMaker } from '~/lib/checks/decisions';
import { readAddition } from '~/lib/chapter-pictures/read';
import { isAddedId } from '~/lib/chapter-pictures/shared';
import { pathsFor } from '~/lib/chapter-pictures/where';
import { hideReachesChapterPictures } from '~/lib/chapter-pictures/after-hide';
import { dismissStoryboard, hideStoryboard, unhideStoryboard } from '~/lib/voice/moderation';
import { moderationDeps } from '~/lib/voice/publish-deps';

/**
 * An admin's Hide in the reader (owner, 2026-10-29: "an admin Hide in the reader for seeded and readers' images").
 * Hide only (principle 5: admins hide and pick, nothing else). A reader's image is hidden as the moderator queue
 * hides it (its status, the removal log, its file moved to the private bucket). A seeded image is a file in the
 * repository: its hide is a row in studio.seeded_hidden, read before the reader shows it.
 */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { kind?: unknown; id?: unknown; action?: unknown };
  // A published storyboard (Nate, 2026-11-23): Hide, Unhide (reversible, its files back from private storage) or Dismiss
  // its reports. Each step is logged in studio.voice_publication_log (src/lib/voice/moderation.ts).
  if (b.kind === 'storyboard' && typeof b.id === 'string') {
    const deps = moderationDeps();
    if (b.action === 'hide' || b.action === undefined) {
      const r = await hideStoryboard(sql, b.id, fid, 'moderator', null, null, deps);
      return NextResponse.json(r.hidden ? { done: 'hidden', moved: r.moved, failed: r.failed } : { error: 'Not shown, or no such storyboard' }, { status: r.hidden ? 200 : 404 });
    }
    if (b.action === 'unhide') {
      const r = await unhideStoryboard(sql, b.id, fid, 'moderator', deps);
      return NextResponse.json(r.shown ? { done: 'shown', restored: r.restored, failed: r.failed } : { error: 'Not hidden, or no such storyboard' }, { status: r.shown ? 200 : 404 });
    }
    if (b.action === 'dismiss') return (await dismissStoryboard(sql, b.id, fid)) ? NextResponse.json({ done: 'dismissed' }) : NextResponse.json({ error: 'No such storyboard' }, { status: 404 });
    return NextResponse.json({ error: 'Hide, unhide or dismiss' }, { status: 400 });
  }
  if (b.kind === 'seeded' && typeof b.id === 'string') {
    // A picture an admin added (owner, 2026-11-19) is hidden the same way: a row in studio.seeded_hidden by its id.
    const added = isAddedId(b.id) ? await readAddition(sql, b.id).catch(() => null) : null;
    const im = added ? { id: added.jobId } : loadIllustrationById(b.id);
    if (!im) return NextResponse.json({ error: 'No such image' }, { status: 404 });
    try {
      await sql`insert into studio.seeded_hidden ${sql({ image_id: im.id, by_fid: fid })} on conflict (image_id) do nothing`;
    } catch (e) {
      console.error('admin hide: seeded_hidden not ready', (e as Error).name);
      return NextResponse.json({ error: 'Hiding seeded images needs the owner’s admin migration (NEXT_admin) first.' }, { status: 503 });
    }
    // Everywhere a seeded image can show (owner, 2026-10-30): the chapter and its player, References and the sheets,
    // the introduction (home, About and every page's "What is this?"), and quote cards and their share pages.
    forgetHidden();
    if (added) for (const p of pathsFor(added.jobId, added.chapter)) revalidatePath(p.path, p.type);
    else revalidatePath('/', 'layout');
    return NextResponse.json({ done: 'hidden' });
  }
  if (b.kind === 'reader' && typeof b.id === 'string') {
    const el = await workOf(sql, b.id);
    if (!el || el.type !== 'image') return NextResponse.json({ error: 'No such image' }, { status: 404 });
    await sql.begin(async (tx) => {
      await tx`update studio.elements set status = 'hidden' where id = ${el.elementId}`;
      await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'hidden', by_fid: fid, role: 'moderator' })}`;
    });
    for (const sha of el.files) await moveToPrivate(sha).catch((e) => console.error('admin hide: moving the hidden file failed', (e as Error).name));
    // The maker is checked again at their next Generate or publish (owner, 2026-11-04).
    await recheckMaker(sql, el.byFid);
    await hideReachesChapterPictures(sql, el.elementId);
    revalidatePath('/references', 'layout');
    revalidatePath(`/image/${b.id}`);
    return NextResponse.json({ done: 'hidden' });
  }
  return NextResponse.json({ error: 'Hide a seeded image (kind "seeded", id), a reader\'s image (kind "reader", its version id) or a published storyboard (kind "storyboard", its id)' }, { status: 400 });
}
