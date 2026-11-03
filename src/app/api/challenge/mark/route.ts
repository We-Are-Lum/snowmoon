import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { markEntry } from '~/lib/challenge/entries';

/**
 * "Mark as my entry" (the remix challenge, owner 2026-10-31): a signed-in person marks one of their own versions made
 * during the challenge as their entry for its character. Their latest version counts unless they mark another. Off
 * (503) while CHALLENGE.entries is off; "not available yet" without studio.challenge_marks.
 */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to mark your entry' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  let body: { versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const versionId = typeof body.versionId === 'string' && /^[0-9a-f-]{36}$/.test(body.versionId) ? body.versionId : null;
  if (!versionId) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const r = await markEntry(sql, fid, versionId);
  if (!r.ok) return NextResponse.json({ error: r.why }, { status: r.status });
  revalidatePath('/challenge');
  revalidatePath(`/references/designs/${versionId}`);
  return NextResponse.json({ marked: versionId });
}
