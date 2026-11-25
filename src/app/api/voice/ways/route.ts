import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { bylineName } from '~/lib/names';
import { getAudio } from '~/lib/voice/store';
import { fitFromBoard, reusableBoards, sharedTakes, type WaysDeps } from '~/lib/voice/three-ways-server';
import { publishOn } from '~/lib/voice/publish-deps';

/**
 * Three ways in (Nate, 2026-11-24; branch voice-three-ways; DRAFT). GET: what the second and third ways offer this
 * person: published takes (once publishing is on) and the storyboards that can be reused (team-made; published ones
 * once publishing is on). The ready-made readings come with /api/voice/status, as before. POST { draftId, source }: fit
 * the chosen storyboard to the person's own new take (src/lib/voice/three-ways-server.ts fitFromBoard).
 */
const deps = (): WaysDeps => ({ name: async (fid) => (await bylineName(fid, null).catch(() => ({ name: null }))).name, getPrivate: getAudio });

export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const [takes, boards] = await Promise.all([sharedTakes(sql), reusableBoards(sql, deps())]);
  return NextResponse.json({ publishing: publishOn(), takes: takes.filter((t) => t.fid !== who.fid), boards }, { headers: noStore });
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const r = await fitFromBoard(sql, who.fid, await request.json().catch(() => ({})), deps());
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
