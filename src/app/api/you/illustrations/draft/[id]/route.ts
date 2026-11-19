import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { pictureBytes } from '~/lib/chapter-pictures/read';

/**
 * A redo's picture for the admins' review page (owner, 2026-11-18: "a redo is private until the admin presses keep").
 * A draft's only copy is in studio.chapter_picture_versions; it has no public address until it is kept. Admins only,
 * signed in with the token in the Authorization header (the page fetches it and shows it as a blob), never cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const bytes = await pictureBytes(sql, (await params).id).catch(() => null);
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
