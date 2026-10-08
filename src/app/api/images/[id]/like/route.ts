import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { likeState } from '~/lib/cards';
import { imageByVersion } from '~/lib/images/data';

type Ctx = { params: Promise<{ id: string }> };

/** Likes on readers' images use the existing likes (studio.likes; individual likes stay private). */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await likeState(id, await getFid(request)), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: Ctx) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to like images' }, { status: 401 });
  const { id } = await params;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Likes are not available here' }, { status: 503 });
  if (!(await imageByVersion(sql, id))) return NextResponse.json({ error: 'No such image' }, { status: 404 });
  const { like } = (await request.json().catch(() => ({}))) as { like?: unknown };
  if (like === false) await sql`delete from studio.likes where version_id = ${id} and fid = ${fid}`;
  else await sql`insert into studio.likes ${sql({ version_id: id, fid })} on conflict (version_id, fid) do nothing`;
  return NextResponse.json(await likeState(id, fid));
}
