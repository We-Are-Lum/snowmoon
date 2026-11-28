import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { takeDown } from '~/lib/voice/publish';
import { moderationDeps, publishDeps } from '~/lib/voice/publish-deps';

/** DELETE: take down one's own published storyboard: its public files go, and it is a draft again. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const r = await takeDown(sql, who.fid, (await params).id, { ...publishDeps(), deletePrivate: moderationDeps().deletePrivate });
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
