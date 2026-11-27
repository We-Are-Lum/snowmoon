import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { publishDeps, takesOn } from '~/lib/voice/publish-deps';
import { publicStoreReady } from '~/lib/voice/public-store';
import { enterTake, takeOptions } from '~/lib/voice/takes';
import { voiceTestOn } from '~/lib/voice/flag';

/**
 * Entering a take (Nate, 2026-11-26; src/lib/voice/takes.ts), for those the voice switch lets in, while VOICE.publishTakes
 * is on. GET: the pictures the entry step offers. POST {draftId, picture: {source, id | ticket+image}, named, nameProof,
 * replace}: copy the take and its picture under takes/<id>/ and publish it; 409 "entered" asks before replacing.
 */
const fetchPicture = async (url: string): Promise<Uint8Array | null> => {
  // The local tests' stand-in pictures are served by the test server itself.
  const r = await fetch(url, { cache: 'no-store' }).catch(() => null);
  return r?.ok ? new Uint8Array(await r.arrayBuffer()) : null;
};

export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  if (!takesOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  return NextResponse.json(await takeOptions(sql, who.fid), { headers: noStore });
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  if (!takesOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql || !publicStoreReady()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const d = publishDeps();
  const r = await enterTake(sql, who.fid, await request.json().catch(() => ({})), { name: d.name, getPrivate: d.getPrivate, putPublic: d.putPublic, deletePublic: d.deletePublic, fetchPicture: voiceTestOn() && process.env.VOICE_TEST_PICTURE_DIR ? (await import('~/lib/voice/test-pictures')).localPicture : fetchPicture });
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
