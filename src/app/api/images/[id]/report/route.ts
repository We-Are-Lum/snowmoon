import { after, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { alertReports } from '~/lib/images/alert';
import { IMAGES } from '~/lib/config';
import { elementOf } from '~/lib/images/data';
import { REASONS } from '~/lib/images/reasons';
import { moveToPrivate } from '~/lib/images/store';

type Ctx = { params: Promise<{ id: string }> };


/**
 * Report an image (section 6), by any signed-in reader: one reason and an optional private note.
 * One report per person per image, 20 a day. Stated rules (decision 17): a "minor" report hides it
 * at once; three different reporters hide it until a moderator looks. Otherwise it waits in the
 * moderator queue and stays up. Who reported stays in the private log; moderators never see it.
 */
export async function POST(request: Request, { params }: Ctx) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to report' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const { id } = await params;
  const el = await elementOf(sql, id);
  if (!el || el.status !== 'published') return NextResponse.json({ error: 'No such image' }, { status: 404 });
  const { reason: r, note } = (await request.json().catch(() => ({}))) as { reason?: unknown; note?: unknown };
  const reason = String(r);
  if (!(REASONS as readonly string[]).includes(reason)) return NextResponse.json({ error: 'Choose a reason' }, { status: 400 });
  const text = typeof note === 'string' ? note.trim().slice(0, 280) : '';
  const [mine] = await sql`select 1 from studio.removal_log where element_id = ${el.elementId} and by_fid = ${fid} and step = 'reported' limit 1`;
  if (mine) return NextResponse.json({ reported: true });
  const [day] = await sql`select count(*)::int as n from studio.removal_log where by_fid = ${fid} and step = 'reported' and at > now() - interval '1 day'`;
  if (day.n >= IMAGES.reportsPerDay) return NextResponse.json({ error: `You can report ${IMAGES.reportsPerDay} images a day` }, { status: 429 });
  await sql`insert into studio.removal_log ${sql({ element_id: el.elementId, step: 'reported', by_fid: fid, role: 'reader', reason, note: text || null })}`;
  const [n] = await sql`select count(distinct by_fid)::int as n from studio.removal_log where element_id = ${el.elementId} and step = 'reported'`;
  const rule = IMAGES.hideAtOnce.includes(reason) ? `one "${reason}" report` : n.n >= IMAGES.hideAfterReporters ? `${n.n} reporters` : null;
  if (rule) {
    await sql.begin(async (tx) => {
      await tx`update studio.elements set status = 'hidden' where id = ${el.elementId} and status = 'published'`;
      await tx`insert into studio.removal_log ${tx({ element_id: el.elementId, step: 'hidden', by_fid: 0, role: 'rule', reason, note: rule })}`;
    });
    await moveToPrivate(el.sha256).catch((e) => console.error('report: moving the hidden file failed', (e as Error).name));
    revalidatePath('/images');
    revalidatePath(`/image/${id}`);
  }
  // The moderator's push ("Snowmoon: N reports waiting", nothing else), after the answer; never fails the report.
  after(() => alertReports(sql).then(() => undefined, () => undefined));
  return NextResponse.json({ reported: true, hidden: Boolean(rule) });
}
