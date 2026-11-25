import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { PICTURE_SOURCES, pictureChoices, picturesByVersion, type PictureSource } from '~/lib/challenge/episode/outlines';
import { episodeVisibleTo } from '~/lib/challenge/episode/visibility';

/**
 * The picture picker (owner, 2026-11-24: "attach an existing picture from the site; no generating"). GET ?from=
 * characters | challenge | mine: what may be attached (published, made here, with a recipe). GET ?ids=a,b: those
 * pictures, for a draft's cards (a picture hidden since is left out). Reads only; nothing is made or kept.
 */
export async function GET(request: Request) {
  const person = await getPerson(request);
  if (!episodeVisibleTo(person)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ pictures: [] });
  const q = new URL(request.url).searchParams;
  const ids = q.get('ids');
  if (ids !== null) return NextResponse.json({ pictures: [...(await picturesByVersion(sql, ids.split(',').slice(0, 10))).values()] }, { headers: { 'Cache-Control': 'no-store' } });
  const from = q.get('from') as PictureSource | null;
  if (!from || !PICTURE_SOURCES.includes(from)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  return NextResponse.json({ pictures: await pictureChoices(sql, from, person) }, { headers: { 'Cache-Control': 'no-store' } });
}
