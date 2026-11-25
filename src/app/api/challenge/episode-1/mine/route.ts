import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { EPISODE } from '~/lib/config';
import { myOutlines } from '~/lib/challenge/episode/outlines';
import { episodeVisibleTo } from '~/lib/challenge/episode/visibility';
import { submissionsOpen } from '~/lib/challenge/episode/rules';

/** The signed-in person's live outlines and how many more they may submit; and whether Submit is open now. Their own only. */
export async function GET(request: Request) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  const open = submissionsOpen();
  if (person === null || !sql) return NextResponse.json({ person: null, left: EPISODE.livePerPerson, ids: [], open }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ person, ...(await myOutlines(sql, person)), open }, { headers: { 'Cache-Control': 'no-store' } });
}
