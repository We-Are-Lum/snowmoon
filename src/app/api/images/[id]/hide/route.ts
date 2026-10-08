import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { elementOf } from '~/lib/images/data';
import { moveToPrivate, restorePublic } from '~/lib/images/store';

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Hide this", by the image's author only (section 6): at once, no approval. The element goes
 * hidden (dropping it, its recipe and its likes from public reads), the public file moves to the
 * private bucket, and the step is logged. "Unhide" undoes only a hide the author made themselves
 * (decision 22); a hide by a moderator or a rule is undone only by the maintainer.
 */
export async function POST(request: Request, { params }: Ctx) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const { id } = await params;
  const el = await elementOf(sql, id);
  if (!el) return NextResponse.json({ error: 'No such image' }, { status: 404 });
  if (el.byFid !== fid) return NextResponse.json({ error: 'Only the person who made this image can hide it here. Others can report it.' }, { status: 403 });
  const { hide } = (await request.json().catch(() => ({}))) as { hide?: unknown };
  if (hide !== false) {
    if (el.status === 'hidden') return NextResponse.json({ hidden: true });
    await sql.begin(async (tx) => {
      await tx`update studio.elements set status = 'hidden' where id = ${el.elementId}`;
      await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'hidden', by_fid: fid, role: 'author' })}`;
    });
    await moveToPrivate(el.sha256);
    await sql`insert into studio.removal_log ${sql({ element_id: el.elementId, step: 'moved_private', by_fid: fid, role: 'author' })}`;
  } else {
    if (el.status !== 'hidden') return NextResponse.json({ hidden: false });
    const [last] = await sql`select role from studio.removal_log where element_id = ${el.elementId} and step in ('hidden', 'unhidden') order by at desc limit 1`;
    if (last?.role !== 'author') return NextResponse.json({ error: 'This image was hidden by a moderator or a rule; only the maintainer can bring it back.' }, { status: 403 });
    await restorePublic(el.sha256);
    await sql.begin(async (tx) => {
      await tx`update studio.elements set status = 'published' where id = ${el.elementId}`;
      await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'restored_public', by_fid: fid, role: 'author' })}`;
      await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'unhidden', by_fid: fid, role: 'author' })}`;
    });
  }
  revalidatePath('/images');
  revalidatePath(`/image/${id}`);
  return NextResponse.json({ hidden: hide !== false });
}
