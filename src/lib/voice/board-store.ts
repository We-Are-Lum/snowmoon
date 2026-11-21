import 'server-only';
import type postgres from 'postgres';
import { getAudio, putAudio, deleteAudio, pictureKeyFor } from './store';
import type { Shot, Timeline } from './board';
import type { Closing } from './closing';

/**
 * Storyboards (studio.voice_boards: versions, new rows only) and kept pictures (studio.voice_board_pictures; files in
 * private storage). Only a draft's own person reads or writes them; a performance draft only.
 */
export async function ownPerformance(sql: postgres.Sql, fid: number, draftId: string) {
  if (!/^[0-9a-f-]{36}$/.test(draftId)) return null;
  const [d] = await sql`select id, recipe, made_at from studio.voice_drafts where id = ${draftId} and fid = ${fid} and kind = 'performance' and published_at is null`;
  if (!d) return null;
  const audio = await sql`select n, role, sentence, replaces_start::float8 as "replacesStart", replaces_end::float8 as "replacesEnd", seconds::float8 as seconds from studio.voice_draft_audio where draft_id = ${draftId} order by n`;
  const recipe = d.recipe as { timeline?: Timeline; preset?: { name?: string }; speech?: { id: string; title: string } };
  return { id: d.id as string, recipe, timeline: recipe.timeline ?? null, audio };
}

export async function latestBoard(sql: postgres.Sql, draftId: string) {
  const [b] = await sql`select version, cuts, shots, closing, made_at from studio.voice_boards where draft_id = ${draftId} order by version desc limit 1`;
  return b ? { version: b.version as number, cuts: b.cuts as number[], shots: b.shots as Shot[], closing: (b.closing as Closing | null) ?? null, madeAt: b.made_at } : null;
}

export async function saveBoard(sql: postgres.Sql, fid: number, draftId: string, cuts: number[], shots: Shot[], closing: Closing | null = null): Promise<number> {
  return sql.begin(async (tx) => {
    const [m] = await tx`select coalesce(max(version), 0)::int as v from studio.voice_boards where draft_id = ${draftId}`;
    const version = m.v + 1;
    await tx`insert into studio.voice_boards (draft_id, fid, version, cuts, shots, closing) values (${draftId}, ${fid}, ${version}, ${tx.json(cuts)}, ${tx.json(shots as unknown as postgres.JSONValue)}, ${closing ? tx.json(closing as unknown as postgres.JSONValue) : null})`;
    return version;
  }) as Promise<number>;
}

export async function keptPictures(sql: postgres.Sql, draftId: string) {
  return sql`select shot_key as "shotKey", sha256, recipe, kept_at as "keptAt" from studio.voice_board_pictures where draft_id = ${draftId} order by kept_at`;
}

export async function keepPicture(sql: postgres.Sql, draftId: string, shotKey: string, png: Uint8Array, sha256: string, recipe: Record<string, unknown>, ext: 'png' | 'jpg' = 'png') {
  const key = pictureKeyFor(draftId, shotKey, sha256, ext);
  await putAudio(key, png);
  try {
    await sql`insert into studio.voice_board_pictures (draft_id, shot_key, sha256, storage_key, bytes, recipe) values (${draftId}, ${shotKey}, ${sha256}, ${key}, ${png.length}, ${sql.json(recipe as postgres.JSONValue)})
      on conflict (draft_id, shot_key, sha256) do nothing`;
  } catch (e) {
    await deleteAudio(key).catch(() => {});
    throw e;
  }
}

export async function pictureBytes(sql: postgres.Sql, draftId: string, shotKey: string, sha256: string): Promise<Uint8Array | null> {
  const [p] = await sql`select storage_key from studio.voice_board_pictures where draft_id = ${draftId} and shot_key = ${shotKey} and sha256 = ${sha256}`;
  return p ? getAudio(p.storage_key) : null;
}
