import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { xEnv } from '~/lib/x-posts/apis';
import { registerFor } from '~/lib/x-posts/admin';

/**
 * Registers the /xpost command in the Snowmoon Discord server (owner, 2026-11-25). The owner only: it uses the bot
 * token, which stays in Vercel and no agent handles. Signed out, 401; anyone else, 404.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ ok: false, error: 'Sign in' }, { status: 401, headers: NO_STORE });
  const a = await registerFor(fid, xEnv());
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
