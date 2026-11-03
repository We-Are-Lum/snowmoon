import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { currentPicks, TERM } from '~/lib/picks';
import { momentOptions, termOptions } from '~/lib/pick-options';
import { loadChapter } from '~/lib/book';

/**
 * The admins' review (owner, 2026-10-29: "a review page per chapter and per glossary term (everything submitted, with
 * hide and pick)"). Admins only. A chapter: every moment with images, each image (seeded, hidden ones marked, and
 * readers' published images) and the moment's current pick. A term: its sheets' images and its current pick.
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const sql = db();
  const q = new URL(request.url).searchParams;
  const chapter = Number(q.get('chapter'));
  const term = q.get('term');
  if (Number.isInteger(chapter) && loadChapter(chapter)) {
    const [options, picks] = await Promise.all([momentOptions(chapter, { withHidden: true }), sql ? currentPicks(sql, { chapter }) : []]);
    // In the book's order: the chapter's blocks, each with its images.
    const moments = loadChapter(chapter)!.blocks.filter((b) => options.has(b.idx)).map((b) => ({ target: `c${chapter}-b${b.idx}`, idx: b.idx, images: options.get(b.idx)!, pick: picks.find((p) => p.target === `c${chapter}-b${b.idx}`) ?? null }));
    return NextResponse.json({ chapter, moments }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (term && TERM.test(term)) {
    const [images, picks] = await Promise.all([termOptions(term), sql ? currentPicks(sql, { term }) : []]);
    return NextResponse.json({ term, images, pick: picks[0] ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ error: 'Ask for ?chapter=n or ?term=slug' }, { status: 400 });
}
