import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { removeDraft } from '~/lib/voice/drafts';

/**
 * DELETE: remove one of this person's own unpublished drafts, audio and all (Nate, 2026-11-20 morning). Anyone else's
 * draft, or a published one, reads as missing. Nothing of it is kept; the day's cost totals (no person in them) stay.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const { id } = await ctx.params;
  try {
    if (!(await removeDraft(sql, who.fid, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'It could not be removed just now. Try again.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
