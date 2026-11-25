import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { correctWords } from '~/lib/voice/correct-words';

/**
 * POST { sentences: string[] }: correct the transcript of one's own improvised words, one text per sentence
 * (src/lib/voice/correct-words.ts). No model is called. The draft is kept again under a new id, with the correction in
 * its history; the old one is removed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  try {
    const r = await correctWords(sql, who.fid, (await params).id, await request.json().catch(() => null));
    return NextResponse.json(r.json, { status: r.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'The corrected words could not be kept just now. Try again.' }, { status: 503 });
  }
}
