import { after, NextResponse } from 'next/server';
import { actsFor } from '~/lib/wallet/credit';
import { revalidatePath } from 'next/cache';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { tryAgain } from '~/lib/try-again';
import { alertReports } from '~/lib/images/alert';
import { workOf } from '~/lib/images/designs';
import { moveToPrivate, restorePublic } from '~/lib/images/store';

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Hide this", by the image's author only (section 6): at once, no approval. The element goes
 * hidden (dropping it, its recipe and its likes from public reads), the public file moves to the
 * private bucket, and the step is logged. "Unhide" undoes only a hide the author made themselves
 * (decision 22); a hide by a moderator or a rule is undone only by the maintainer.
 * Step 4: a style or a character sheet is hidden the same way, with all its pictures.
 * A wallet account hides its own the same way (owner, 2026-10-18, the Dashboard: "pictures, each with
 * Hide"): its person number is minus its account id, which is what its pictures record as their maker.
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const fid = await getPerson(request);
    if (fid === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    const sql = db();
    if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
    const { id } = await params;
    const el = await workOf(sql, id);
    if (!el) return NextResponse.json({ error: 'No such image' }, { status: 404 });
    // A linked wallet's earlier images are its FID's to hide (owner, 2026-10-22; src/lib/wallet/credit.ts).
    if (!(await actsFor(sql, fid, el.byFid))) return NextResponse.json({ error: `Only the person who made this ${el.type === 'image' ? 'image' : 'design'} can hide it here. Others can report it.` }, { status: 403 });
    const { hide } = (await request.json().catch(() => ({}))) as { hide?: unknown };
    if (hide !== false) {
      if (el.status === 'hidden') return NextResponse.json({ hidden: true });
      await sql.begin(async (tx) => {
        await tx`update studio.elements set status = 'hidden' where id = ${el.elementId}`;
        await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'hidden', by_fid: fid, role: 'author' })}`;
      });
      for (const sha of el.files) await moveToPrivate(sha);
      await sql`insert into studio.removal_log ${sql({ element_id: el.elementId, step: 'moved_private', by_fid: fid, role: 'author' })}`;
    } else {
      if (el.status !== 'hidden') return NextResponse.json({ hidden: false });
      const [last] = await sql`select role from studio.removal_log where element_id = ${el.elementId} and step in ('hidden', 'unhidden') order by at desc limit 1`;
      if (last?.role !== 'author') return NextResponse.json({ error: 'This was hidden by a moderator or a rule; only the maintainer can bring it back.' }, { status: 403 });
      for (const sha of el.files) await restorePublic(sha);
      await sql.begin(async (tx) => {
        await tx`update studio.elements set status = 'published' where id = ${el.elementId}`;
        await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'restored_public', by_fid: fid, role: 'author' })}`;
        await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'unhidden', by_fid: fid, role: 'author' })}`;
      });
    }
    // A hide changes what is waiting: the moderator's push, after the answer, at most one an hour.
    if (hide !== false) after(() => alertReports(sql).then(() => undefined, () => undefined));
    revalidatePath('/images');
    revalidatePath(el.type === 'image' ? `/image/${id}` : '/images/designs', el.type === 'image' ? undefined : 'layout');
    return NextResponse.json({ hidden: hide !== false });
  } catch (e) {
    return tryAgain('image hide', e);
  }
}
