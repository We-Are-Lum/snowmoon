import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { listDesigns } from '~/lib/images/designs';
import { CAMERA_ANGLES, SHOT, boardNotes, proposeCuts, shotsFromCuts, type Shot } from '~/lib/voice/board';
import { boardSource, keptPictures, latestBoard, livePublication, saveBoard } from '~/lib/voice/board-store';
import { readingEstimate } from '~/lib/voice/reading-timing';
import { deleteAudio } from '~/lib/voice/store';
import { shotModels, triesMade } from '~/lib/voice/shot-picture';
import { whereFrom } from '~/lib/images/countries';
import { VOICE } from '~/lib/config';
import { speechById } from '~/lib/voice/speech';
import { voiceTestOn } from '~/lib/voice/flag';
import { CLOSING, emptyClosing, type Closing } from '~/lib/voice/closing';

/**
 * A performance's storyboard (slice 2, DRAFT). GET ?draft=<id>: the strip (timeline), the latest saved board (or the
 * automatic cuts at sentence ends), kept pictures, the sheets to choose from, the camera angles and the notes. POST:
 * save a new version (cuts and shots; each shot's description is the person's own words, stored as given).
 */
const sheet = (d: { versionId: string; title: string; text: string; entity: string; thumb: string | null }) => ({ id: d.versionId, title: d.title, entity: d.entity, text: d.text, thumb: d.thumb });

export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const draft = await boardSource(sql, who.fid, String(new URL(request.url).searchParams.get('draft') ?? ''));
  // Not found, or this person's board on it is published (the page then shows where, and the take-down).
  if (!draft || (await livePublication(sql, who.fid, draft.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!draft.timeline && draft.kind === 'reading')
    return NextResponse.json({ error: 'This reading has no word timings yet.', reason: 'needs-timing', estimateCredits: readingEstimate(draft.audio).credits, seconds: readingEstimate(draft.audio).seconds }, { status: 409, headers: noStore });
  if (!draft.timeline) return NextResponse.json({ error: 'This draft was kept before storyboards: record and accept it again to make one.' }, { status: 409 });
  const saved = await latestBoard(sql, draft.id, who.fid);
  const cuts = saved?.cuts ?? proposeCuts(draft.timeline);
  const shots = saved?.shots ?? shotsFromCuts(draft.timeline, cuts);
  const [styles, characters, pictures] = await Promise.all([listDesigns(sql, 'style').catch(() => []), listDesigns(sql, 'character').catch(() => []), keptPictures(sql, draft.id, who.fid)]);
  return NextResponse.json(
    {
      draft: {
        id: draft.id,
        kind: draft.kind,
        preset: draft.recipe.preset?.name ?? null,
        speech: draft.recipe.speech ?? null,
        // The speech's own sentences (its text, never the transcription): shown under each shot and in the play-through.
        sentences: (draft.recipe.speech ? (speechById(draft.recipe.speech.id)?.sentences ?? []) : []).map((x) => ({ n: x.n, text: x.text })),
        audio: draft.audio,
        timeline: draft.timeline,
      },
      board: { version: saved?.version ?? 0, cuts, shots, closing: saved?.closing ?? emptyClosing(), proposed: proposeCuts(draft.timeline), fromProposal: !saved },
      pictures,
      notes: boardNotes(shots),
      sheets: { styles: styles.map(sheet), characters: characters.map(sheet) },
      angles: CAMERA_ANGLES,
      limits: SHOT,
      // The challenge's models for this visitor (the country decides; it isn't kept), the default, and the limits.
      making: { ...shotModels(whereFrom(request.headers), who.fid), standIn: voiceTestOn(), tries: await triesMade(sql, draft.id, who.fid) },
    },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { draftId?: string; cuts?: unknown; shots?: unknown; closing?: Partial<Closing> };
  const draft = await boardSource(sql, who.fid, String(body.draftId ?? ''));
  if (!draft?.timeline) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const cuts = Array.isArray(body.cuts) ? body.cuts.filter((c): c is number => typeof c === 'number' && c > 0 && c < draft.timeline!.seconds).slice(0, 200) : null;
  if (!cuts || !Array.isArray(body.shots) || body.shots.length > 201) return NextResponse.json({ error: 'Send the cuts and the shots' }, { status: 400 });
  if (new Set(cuts).size + 1 > VOICE.board.maxShots) return NextResponse.json({ error: `A storyboard has at most ${VOICE.board.maxShots} shots: remove a cut.` }, { status: 400 });
  const kept = new Set((await keptPictures(sql, draft.id, who.fid)).map((p) => `${p.shotKey}:${p.sha256}`));
  const angles = new Set<string>(CAMERA_ANGLES.map((a) => a.id));
  const given = body.shots as Partial<Shot>[];
  // The shots are rebuilt from the cuts (so their spans always match), carrying what the person set for each key.
  const shots = shotsFromCuts(draft.timeline, cuts, given.filter((s) => typeof s?.key === 'string' && /^[a-z0-9]{1,16}$/.test(s.key)).map((s) => ({
    key: s.key!,
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    description: String(s.description ?? '').slice(0, VOICE.board.descriptionMaxChars),
    angle: (angles.has(String(s.angle)) ? s.angle : '') as Shot['angle'],
    styleId: typeof s.styleId === 'string' ? s.styleId : null,
    characterIds: Array.isArray(s.characterIds) ? s.characterIds.filter((c): c is string => typeof c === 'string').slice(0, 6) : [],
    kept: typeof s.kept === 'string' && kept.has(`${s.key}:${s.kept}`) ? s.kept : null,
  })));
  // The closing card's choices (slice 4): the person's own words for its look, a style, the kept background.
  const c = body.closing ?? {};
  const closing: Closing = {
    description: String(c.description ?? '').slice(0, VOICE.board.descriptionMaxChars),
    styleId: typeof c.styleId === 'string' ? c.styleId : null,
    kept: typeof c.kept === 'string' && kept.has(`${CLOSING.key}:${c.kept}`) ? c.kept : null,
  };
  const version = await saveBoard(sql, who.fid, draft.id, cuts, shots, closing);
  return NextResponse.json({ version, cuts, shots, closing, notes: boardNotes(shots) }, { headers: noStore });
}

/**
 * DELETE ?draft=<id>: remove one's own storyboard on a draft (a shared reading's, say): its versions, kept pictures and
 * tries (studio.delete_voice_board), then the pictures' files. Not while it is published.
 */
export async function DELETE(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const draftId = String(new URL(request.url).searchParams.get('draft') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(draftId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (await livePublication(sql, who.fid, draftId)) return NextResponse.json({ error: 'Take it down first: it is published.' }, { status: 409, headers: noStore });
  const [had] = await sql`select 1 from studio.voice_boards where draft_id = ${draftId} and fid = ${who.fid} limit 1`;
  if (!had) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const keys = (await sql`select k from studio.delete_voice_board(${draftId}::uuid, ${who.fid}::bigint) as k`).map((r) => r.k as string);
  for (const k of keys) await deleteAudio(k).catch(() => {});
  return NextResponse.json({ ok: true, removed: keys.length }, { headers: noStore });
}
