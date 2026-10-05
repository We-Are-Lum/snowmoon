import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { CardError, likeState, setLike } from '~/lib/cards';

type Ctx = { params: Promise<{ id: string }> };

/** Like count, and whether the signed-in reader (if any) likes it. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(await likeState(id, await getFid(request)), { headers: { 'Cache-Control': 'no-store' } });
}

/** Like or unlike. Body: { like: boolean }. */
export async function POST(request: Request, { params }: Ctx) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to like cards' }, { status: 401 });
  const { id } = await params;
  try {
    const { like } = (await request.json()) as { like?: unknown };
    return NextResponse.json(await setLike(id, fid, like !== false));
  } catch (e) {
    if (e instanceof CardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('like card', e);
    return NextResponse.json({ error: 'Could not record the like' }, { status: 500 });
  }
}
