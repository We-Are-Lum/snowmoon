import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { myChallengePictures } from '~/lib/challenge/mine';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * "Your challenge pictures" (owner, 2026-11-12): the signed-in person's own published challenge pictures, in two groups
 * (src/lib/challenge/mine.ts). Read-only. 401 signed out; 404 while the challenge is admin-only, as /challenge is.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const person = await getPerson(request);
  if (!challengeVisibleTo(person)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503, headers: noStore });
  return NextResponse.json(await myChallengePictures(sql, person), { headers: noStore });
}
