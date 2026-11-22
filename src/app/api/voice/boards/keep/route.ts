import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { verifyTicket } from '~/lib/voice/ticket';
import { boardSource, keepPicture } from '~/lib/voice/board-store';

/** Keep one picture for a shot: only a picture we made for this person, draft and shot (its signed record), byte for byte. */
interface PictureTicket { v: 1; kind: 'picture'; fid: number; draftId: string; shotKey: string; sha256: string; ext?: 'png' | 'jpg'; recipe: Record<string, unknown>; expiresAt: number }

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { ticket?: string; image?: string };
  const t = verifyTicket<PictureTicket>(String(b.ticket ?? ''));
  if (!t || t.kind !== 'picture' || t.fid !== who.fid || t.expiresAt < Date.now()) return NextResponse.json({ error: 'That picture is not yours, or not ours' }, { status: 400 });
  const draft = await boardSource(sql, who.fid, t.draftId);
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const m = String(b.image ?? '').match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  const bytes = m ? Buffer.from(m[2], 'base64') : null;
  if (!bytes || bytes.length > 8_000_000 || createHash('sha256').update(bytes).digest('hex') !== t.sha256) return NextResponse.json({ error: 'That is not the picture we made' }, { status: 400 });
  await keepPicture(sql, draft.id, who.fid, t.shotKey, bytes, t.sha256, t.recipe, t.ext ?? (m![1] === 'png' ? 'png' : 'jpg'));
  return NextResponse.json({ ok: true, shotKey: t.shotKey, sha256: t.sha256 }, { headers: noStore });
}
