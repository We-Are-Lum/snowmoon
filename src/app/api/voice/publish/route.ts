import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { publishBoard, publishPreview, ownPublications } from '~/lib/voice/publish';
import { publishDeps, publishOn } from '~/lib/voice/publish-deps';
import { publicStoreReady } from '~/lib/voice/public-store';

/**
 * Publishing a storyboard (slice 4, DRAFT). GET ?draft=<id>: what stands in the way, and the closing card's credits as
 * they would be shown. POST {draftId, version, named, nameProof}: publish the latest saved board (src/lib/voice/publish.ts).
 * Off until VOICE.publish (Nate's word); the local tests only, with stand-ins, before that.
 */
export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const draftId = String(q.get('draft') ?? '');
  const deps = publishDeps();
  const performer = q.get('named') === 'no' ? null : await deps.name(who.fid, request.headers.get('x-name-proof'));
  // A live publication of this person's board on this draft comes first (rehearsal, 2026-11-23): a board on a shared
  // ready-made reading still finds its draft after it is published, so the preview alone never said "published" and
  // the board page showed "not found", with no way to take it down.
  const live = (await ownPublications(sql, who.fid)).find((x) => x.draftId === draftId);
  if (live) return NextResponse.json({ published: { id: live.id, url: `/storyboard/spoken/${live.id}` } }, { headers: noStore });
  const p = await publishPreview(sql, who.fid, draftId, deps, performer);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ on: publishOn(), problems: p.problems, credits: p.credits, version: p.board?.version ?? 0, performer }, { headers: noStore });
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  if (!publishOn()) return NextResponse.json({ error: 'Publishing storyboards is not switched on yet.', reason: 'not-yet' }, { status: 403, headers: noStore });
  const sql = db();
  if (!sql || !publicStoreReady()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const r = await publishBoard(sql, who.fid, await request.json().catch(() => ({})), publishDeps());
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
