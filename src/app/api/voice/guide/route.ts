import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { boardSource } from '~/lib/voice/board-store';
import { askGuide, guideDeps, guideMessages } from '~/lib/voice/guide-server';
import { CHAT } from '~/lib/config';
import { voiceTestOn } from '~/lib/voice/flag';

export const maxDuration = 60;

/**
 * The storyboard guide (src/lib/voice/guide-server.ts). GET ?draft=<id>: this person's dialogue on that draft's
 * storyboard. POST { draftId, step, text, shotKey?, look? }: the person's message, kept word for word, and the guide's
 * reply with its draft (on the assistant's model and provider; a stand-in on a local test copy).
 */
export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const draft = await boardSource(sql, who.fid, String(new URL(request.url).searchParams.get('draft') ?? ''));
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ messages: await guideMessages(sql, draft.id, who.fid), model: voiceTestOn() ? 'stand-in guide (no model)' : CHAT.model, open: true, host: CHAT.route }, { headers: noStore });
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const r = await askGuide(sql, who.fid, body, await guideDeps(request));
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
