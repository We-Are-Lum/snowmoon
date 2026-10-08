import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { chapterImages } from '~/lib/images/data';

/** Readers' published images in a chapter, for the reader (shown behind a tap, decision 4). Public. */
export async function GET(_request: Request, { params }: { params: Promise<{ n: string }> }) {
  const n = Number((await params).n);
  const sql = db();
  if (!sql || !Number.isInteger(n)) return NextResponse.json({ images: [] });
  try {
    const images = (await chapterImages(sql, n)).map(({ versionId, url, chapter, start, end, byFid, byName, likes, userPrompt }) => ({ versionId, url, chapter, start, end, byFid, byName, likes, userPrompt }));
    return NextResponse.json({ images }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (e) {
    console.error('chapter images failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ images: [] });
  }
}
