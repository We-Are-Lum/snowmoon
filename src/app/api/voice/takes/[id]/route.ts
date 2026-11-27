import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { takeDown } from '~/lib/voice/publish';
import { moderationDeps, publishDeps, takesOn } from '~/lib/voice/publish-deps';
import { takePublication } from '~/lib/voice/takes';

/** DELETE: take down one's own take (0046's take-down): its public files go, its private copies too if hidden; its draft stays. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const id = (await params).id;
  const [k] = /^[0-9a-f-]{36}$/.test(id) ? await sql`select kind from studio.voice_publications where id = ${id} and fid = ${who.fid}` : [];
  if (!k || k.kind !== 'take') return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore });
  const r = await takeDown(sql, who.fid, id, { ...publishDeps(), deletePrivate: moderationDeps().deletePrivate });
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}

/** GET: a live, shown take's public recipe (principle 1: every published piece's recipe is public), signed out. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sql = db();
  if (!sql || !takesOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const t = await takePublication(sql, (await params).id);
  if (!t || t.hidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ id: t.id, publishedAt: t.publishedAt, recipe: t.recipe, files: t.files.map((f) => ({ role: f.role, url: f.url, sha256: f.sha256 })) });
}
