import 'server-only';
import type postgres from 'postgres';

/**
 * Accepted drafts (studio.voice_drafts, studio.voice_draft_audio; NEXT_ephelion_voice.sql). Private: read back only by
 * their own person. Never a raw take: the recipe holds each take's sha256, and only converted audio is stored.
 */
export interface DraftAudio {
  role: 'take' | 'redo' | 'reading';
  sentence: number | null;
  replacesStart: number | null;
  replacesEnd: number | null;
  mp3: Uint8Array;
  sha256: string;
  seconds: number | null;
}

export async function saveDraft(sql: postgres.Sql, d: { fid: number; kind: 'performance' | 'reading'; speechId: string; presetId: string; recipe: Record<string, unknown>; audio: DraftAudio[] }): Promise<string> {
  return sql.begin(async (tx) => {
    const [row] = await tx`insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (${d.fid}, ${d.kind}, ${d.speechId}, ${d.presetId}, ${tx.json(d.recipe as postgres.JSONValue)}) returning id`;
    for (const [n, a] of d.audio.entries()) {
      await tx`insert into studio.voice_draft_audio (draft_id, n, role, sentence, replaces_start, replaces_end, mp3, sha256, seconds)
        values (${row.id}, ${n}, ${a.role}, ${a.sentence}, ${a.replacesStart}, ${a.replacesEnd}, ${Buffer.from(a.mp3)}, ${a.sha256}, ${a.seconds})`;
    }
    return row.id as string;
  }) as Promise<string>;
}

export async function myDrafts(sql: postgres.Sql, fid: number) {
  return sql`
    select d.id, d.kind, d.speech_id, d.preset_id, d.made_at, d.recipe,
      coalesce(json_agg(json_build_object('n', a.n, 'role', a.role, 'sentence', a.sentence, 'replacesStart', a.replaces_start, 'replacesEnd', a.replaces_end, 'sha256', a.sha256, 'seconds', a.seconds) order by a.n) filter (where a.n is not null), '[]') as audio
    from studio.voice_drafts d left join studio.voice_draft_audio a on a.draft_id = d.id
    where d.fid = ${fid} group by d.id order by d.made_at desc limit 50`;
}

/** One of this person's drafts' audio files, or null (someone else's draft reads as missing). */
export async function draftAudio(sql: postgres.Sql, fid: number, id: string, n: number): Promise<Uint8Array | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(n)) return null;
  const [r] = await sql`select a.mp3 from studio.voice_draft_audio a join studio.voice_drafts d on d.id = a.draft_id where d.id = ${id} and d.fid = ${fid} and a.n = ${n}`;
  return r ? new Uint8Array(r.mp3) : null;
}

/** The latest ready-made reading of a speech in a preset (any admin's), if there is one. */
export async function latestReading(sql: postgres.Sql, speechId: string, presetId: string) {
  const [r] = await sql`select id, fid, made_at, recipe from studio.voice_drafts where kind = 'reading' and speech_id = ${speechId} and preset_id = ${presetId} order by made_at desc limit 1`;
  return r ?? null;
}
