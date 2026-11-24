import 'server-only';
import type postgres from 'postgres';
import { getAudio, putAudio, deleteAudio, pictureKeyFor } from './store';
import type { Scene, Shot, Timeline } from './board';
import type { Closing } from './closing';

/**
 * Storyboards (studio.voice_boards: versions, new rows only) and kept pictures (studio.voice_board_pictures; files in
 * private storage). A board has its own owner (Nate, 2026-11-21): on a person's own performance, only that person; on a
 * ready-made reading, which is shared, anyone the voice switch lets in makes their own board, and reads and writes only
 * their own versions, pictures and tries.
 */
export interface ReadingTiming { model: string; timeline: Timeline; check: { sentences: number; matched: number; unmatched: number[] }; credits: number | null; transcriptDeleted: boolean }

export async function boardSource(sql: postgres.Sql, fid: number, draftId: string) {
  if (!/^[0-9a-f-]{36}$/.test(draftId)) return null;
  const [d] = await sql`select id, fid, kind, preset_id, recipe, made_at, published_at from studio.voice_drafts where id = ${draftId}`;
  if (!d) return null;
  const kind = d.kind as 'performance' | 'reading';
  // A performance is its person's alone, and only while unpublished; a reading is shared.
  if (kind === 'performance' && (Number(d.fid) !== fid || d.published_at)) return null;
  const audio = await sql`select n, role, sentence, replaces_start::float8 as "replacesStart", replaces_end::float8 as "replacesEnd", seconds::float8 as seconds, bytes from studio.voice_draft_audio where draft_id = ${draftId} order by n`;
  const recipe = d.recipe as { timeline?: Timeline; preset?: { name?: string }; speech?: { id: string; title: string } };
  let timing: ReadingTiming | null = null;
  if (kind === 'reading') {
    const [t] = await sql`select model, timeline, check_result, credits, transcript_deleted from studio.voice_reading_timings where draft_id = ${draftId}`;
    if (t) timing = { model: t.model as string, timeline: t.timeline as Timeline, check: t.check_result as ReadingTiming['check'], credits: (t.credits as number | null) ?? null, transcriptDeleted: Boolean(t.transcript_deleted) };
  }
  return { id: d.id as string, kind, owner: Number(d.fid), presetId: d.preset_id as string, recipe, timeline: kind === 'reading' ? (timing?.timeline ?? null) : (recipe.timeline ?? null), timing, audio };
}

/** This person's live publication of a board on this draft, if any. */
export async function livePublication(sql: postgres.Sql, fid: number, draftId: string) {
  const [p] = await sql`select id from studio.voice_publications where draft_id = ${draftId} and fid = ${fid} and taken_down_at is null`;
  return p ? (p.id as string) : null;
}

export async function latestBoard(sql: postgres.Sql, draftId: string, fid: number) {
  const [b] = await sql`select version, cuts, shots, closing, scene, made_at from studio.voice_boards where draft_id = ${draftId} and fid = ${fid} order by version desc limit 1`;
  return b ? { version: b.version as number, cuts: b.cuts as number[], shots: b.shots as Shot[], closing: (b.closing as Closing | null) ?? null, scene: (b.scene as Scene | null) ?? null, madeAt: b.made_at } : null;
}

export async function saveBoard(sql: postgres.Sql, fid: number, draftId: string, cuts: number[], shots: Shot[], closing: Closing | null = null, scene: Scene | null = null): Promise<number> {
  return sql.begin(async (tx) => {
    const [m] = await tx`select coalesce(max(version), 0)::int as v from studio.voice_boards where draft_id = ${draftId} and fid = ${fid}`;
    const version = m.v + 1;
    await tx`insert into studio.voice_boards (draft_id, fid, version, cuts, shots, closing, scene) values (${draftId}, ${fid}, ${version}, ${tx.json(cuts)}, ${tx.json(shots as unknown as postgres.JSONValue)}, ${closing ? tx.json(closing as unknown as postgres.JSONValue) : null}, ${scene ? tx.json(scene as unknown as postgres.JSONValue) : null})`;
    return version;
  }) as Promise<number>;
}

/** Each kept picture's scene sha256 (its recipe's scene.sha256), by shot key, for the kept shot: the old-scene notes. */
export function madeWithScene(shots: Shot[], pictures: { shotKey: string; sha256: string; recipe: unknown }[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const s of shots) {
    const p = s.kept ? pictures.find((x) => x.shotKey === s.key && x.sha256 === s.kept) : undefined;
    out[s.key] = ((p?.recipe as { scene?: { sha256?: string } } | undefined)?.scene?.sha256) ?? null;
  }
  return out;
}

export async function keptPictures(sql: postgres.Sql, draftId: string, fid: number) {
  return sql`select shot_key as "shotKey", sha256, recipe, storage_key as key, kept_at as "keptAt" from studio.voice_board_pictures where draft_id = ${draftId} and fid = ${fid} order by kept_at`;
}

export async function keepPicture(sql: postgres.Sql, draftId: string, fid: number, shotKey: string, png: Uint8Array, sha256: string, recipe: Record<string, unknown>, ext: 'png' | 'jpg' = 'png') {
  const key = pictureKeyFor(draftId, fid, shotKey, sha256, ext);
  await putAudio(key, png);
  try {
    await sql`insert into studio.voice_board_pictures (draft_id, fid, shot_key, sha256, storage_key, bytes, recipe) values (${draftId}, ${fid}, ${shotKey}, ${sha256}, ${key}, ${png.length}, ${sql.json(recipe as postgres.JSONValue)})
      on conflict (draft_id, fid, shot_key, sha256) do nothing`;
  } catch (e) {
    await deleteAudio(key).catch(() => {});
    throw e;
  }
}

export async function pictureBytes(sql: postgres.Sql, draftId: string, fid: number, shotKey: string, sha256: string): Promise<Uint8Array | null> {
  const [p] = await sql`select storage_key from studio.voice_board_pictures where draft_id = ${draftId} and fid = ${fid} and shot_key = ${shotKey} and sha256 = ${sha256}`;
  return p ? getAudio(p.storage_key) : null;
}
