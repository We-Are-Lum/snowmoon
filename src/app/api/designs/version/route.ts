import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { designByVersion, picturesOf } from '~/lib/images/designs';

/** A published design version's text and pictures (public, like its page), for My picks' comparison. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const sql = db();
  const d = sql ? await designByVersion(sql, id).catch(() => null) : null;
  if (!d) return NextResponse.json({ error: 'No such design' }, { status: 404 });
  return NextResponse.json({ text: d.shown.body.text, pictures: picturesOf(d.shown.body).map((p) => p.url), createdAt: d.shown.createdAt, versionNo: d.shown.versionNo });
}
