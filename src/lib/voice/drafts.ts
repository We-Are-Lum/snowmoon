import 'server-only';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { deleteAudio, getAudio, keyFor, putAudio } from './store';
import { sharedTake } from './board-store';

/**
 * Accepted drafts (studio.voice_drafts, studio.voice_draft_audio; 0044_ephelion_voice.sql). The audio is in private
 * storage (src/lib/voice/store.ts), the rows say where. Read back only by their own person. Never a raw take: the recipe
 * holds each take's sha256, and only converted audio is stored. A person may remove their own unpublished draft: its
 * files, then its rows (studio.delete_voice_draft).
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
  const id = randomUUID();
  const keys = d.audio.map((a, n) => keyFor(id, n, a.sha256));
  try {
    for (const [n, a] of d.audio.entries()) await putAudio(keys[n], a.mp3);
    await sql.begin(async (tx) => {
      await tx`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values (${id}, ${d.fid}, ${d.kind}, ${d.speechId}, ${d.presetId}, ${tx.json(d.recipe as postgres.JSONValue)})`;
      for (const [n, a] of d.audio.entries()) {
        await tx`insert into studio.voice_draft_audio (draft_id, n, role, sentence, replaces_start, replaces_end, storage_key, bytes, sha256, seconds)
          values (${id}, ${n}, ${a.role}, ${a.sentence}, ${a.replacesStart}, ${a.replacesEnd}, ${keys[n]}, ${a.mp3.length}, ${a.sha256}, ${a.seconds})`;
      }
    });
    return id;
  } catch (e) {
    // Nothing half-kept: files written before a failure are deleted.
    await Promise.all(keys.map((k) => deleteAudio(k).catch(() => {})));
    throw e;
  }
}

export async function myDrafts(sql: postgres.Sql, fid: number) {
  return sql`
    select d.id, d.kind, d.speech_id, d.preset_id, d.made_at, d.published_at, d.recipe,
      coalesce(json_agg(json_build_object('n', a.n, 'role', a.role, 'sentence', a.sentence, 'replacesStart', a.replaces_start, 'replacesEnd', a.replaces_end, 'sha256', a.sha256, 'seconds', a.seconds, 'bytes', a.bytes) order by a.n) filter (where a.n is not null), '[]') as audio
    from studio.voice_drafts d left join studio.voice_draft_audio a on a.draft_id = d.id
    where d.fid = ${fid} group by d.id order by d.made_at desc limit 50`;
}

/** One of this person's drafts' audio files, or null (someone else's draft reads as missing). */
export async function draftAudio(sql: postgres.Sql, fid: number, id: string, n: number): Promise<Uint8Array | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(n)) return null;
  // A performance is its person's alone; a ready-made reading is shared (anyone let in can storyboard it, 2026-11-21);
  // and, once publishing is on, a take its performer published, named (three ways in, 2026-11-24: sharedTake).
  const [r] = await sql`select a.storage_key, d.fid, d.kind from studio.voice_draft_audio a join studio.voice_drafts d on d.id = a.draft_id where d.id = ${id} and a.n = ${n}`;
  if (!r) return null;
  if (Number(r.fid) !== fid && r.kind !== 'reading' && !(await sharedTake(sql, id, Number(r.fid)))) return null;
  return getAudio(r.storage_key);
}

/** A reading's audio (any reading: they are project content, playable by anyone let in). */
export async function readingAudio(sql: postgres.Sql, id: string): Promise<Uint8Array | null> {
  const [r] = await sql`select a.storage_key from studio.voice_draft_audio a join studio.voice_drafts d on d.id = a.draft_id where d.id = ${id} and d.kind = 'reading' and a.n = 0`;
  return r ? getAudio(r.storage_key) : null;
}

/**
 * Remove one of this person's own unpublished drafts: its files first, then its rows. Returns false if there is no such
 * draft (someone else's, published, or gone). If deleting a file fails, the rows stay, so trying again finishes it.
 */
export async function removeDraft(sql: postgres.Sql, fid: number, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  const files = await sql`
    select a.storage_key from studio.voice_draft_audio a join studio.voice_drafts d on d.id = a.draft_id where d.id = ${id} and d.fid = ${fid} and d.published_at is null
    union all
    select p.storage_key from studio.voice_board_pictures p join studio.voice_drafts d on d.id = p.draft_id where d.id = ${id} and d.fid = ${fid} and d.published_at is null`;
  const [own] = await sql`select 1 from studio.voice_drafts where id = ${id} and fid = ${fid} and published_at is null`;
  if (!own) return false;
  // The database's own refusals, checked before any file is deleted (studio.delete_voice_draft): not while a board on it
  // is published, and not while anyone else has a board on it (a shared reading). Otherwise their files would go first.
  const [blocked] = await sql`select 1 where exists (select 1 from studio.voice_publications where draft_id = ${id} and taken_down_at is null)
    or exists (select 1 from studio.voice_boards where draft_id = ${id} and fid <> ${fid})
    or exists (select 1 from studio.voice_board_pictures where draft_id = ${id} and fid <> ${fid})`;
  if (blocked) return false;
  for (const f of files) await deleteAudio(f.storage_key);
  const gone = await sql`select storage_key from studio.delete_voice_draft(${id}, ${fid}) as storage_key`;
  // A file added between the two reads (none can be: drafts are never added to) would be deleted here too.
  for (const g of gone) if (!files.some((f) => f.storage_key === g.storage_key)) await deleteAudio(g.storage_key);
  return true;
}

/** The latest ready-made reading of a speech in a preset (any admin's), if there is one. */
export async function latestReading(sql: postgres.Sql, speechId: string, presetId: string) {
  const [r] = await sql`select id, fid, made_at, recipe from studio.voice_drafts where kind = 'reading' and speech_id = ${speechId} and preset_id = ${presetId} order by made_at desc limit 1`;
  return r ?? null;
}
