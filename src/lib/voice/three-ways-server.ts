import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { VOICE } from '../config';
import type { Timeline, Shot, Scene } from './board';
import { SCENE } from './board';
import { CLOSING, type Closing } from './closing';
import { boardSource, keepPicture, latestBoard, saveBoard } from './board-store';
import { publishOn } from './publish-deps';
import { voiceTestOn } from './flag';
import { fitShots, type BoardSource } from './three-ways';

/**
 * Three ways in, the server side (Nate, 2026-11-24; branch voice-three-ways; DRAFT). waysList: what each way offers this
 * person (ready-made readings; published takes, once publishing is on; team-made storyboards, and published ones once
 * publishing is on). fitFromBoard: "your voice over an existing storyboard": the chosen storyboard's shots, scene and
 * closing card, with their kept pictures copied as they are (each picture's recipe kept, with where it came from), on
 * the person's own new take, each shot's timing fitted to it by a rule (fitShots). No model is called.
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export interface WaysDeps {
  /** A person's name here (their Farcaster name for the FID), or null. */
  name: (fid: number) => Promise<string | null>;
  getPrivate: (key: string) => Promise<Uint8Array | null>;
}

/** A source draft's word timings: a reading's timing, or a performance's own timeline. */
async function timelineOf(sql: Sql, draftId: string): Promise<{ timeline: Timeline | null; speechId: string | null; kind: string | null }> {
  const [d] = await sql`select kind, speech_id, recipe from studio.voice_drafts where id = ${draftId}`;
  if (!d) return { timeline: null, speechId: null, kind: null };
  if (d.kind === 'reading') {
    const [t] = await sql`select timeline from studio.voice_reading_timings where draft_id = ${draftId}`;
    return { timeline: (t?.timeline as Timeline | undefined) ?? null, speechId: d.speech_id as string, kind: 'reading' };
  }
  return { timeline: ((d.recipe as { timeline?: Timeline }).timeline ?? null) as Timeline | null, speechId: d.speech_id as string, kind: d.kind as string };
}

/**
 * The team's storyboards: VOICE.teamBoards (Nate's list); on a local test copy only (VOICE_TEST_ON, never on Vercel), also
 * VOICE_TEST_TEAM_BOARDS (JSON, the same shape), for the tests and screenshots.
 */
export function teamBoards(): readonly { draftId: string; fid: number; title: string }[] {
  if (!voiceTestOn() || !process.env.VOICE_TEST_TEAM_BOARDS) return VOICE.teamBoards;
  try {
    const extra = JSON.parse(process.env.VOICE_TEST_TEAM_BOARDS) as { draftId: string; fid: number; title: string }[];
    return [...VOICE.teamBoards, ...extra.filter((x) => /^[0-9a-f-]{36}$/.test(x.draftId) && Number.isInteger(x.fid) && typeof x.title === 'string')];
  } catch {
    return VOICE.teamBoards;
  }
}

/** The team-made storyboards Nate chose (VOICE.teamBoards), and published ones once publishing is on: what can be reused. */
export async function reusableBoards(sql: Sql, deps: Pick<WaysDeps, 'name'>) {
  const out: { kind: 'team' | 'published'; draftId: string; fid: number; version: number; publicationId: string | null; title: string; speechId: string; by: string | null; shots: number; seconds: number }[] = [];
  for (const t of teamBoards()) {
    const b = await latestBoard(sql, t.draftId, t.fid);
    const src = await timelineOf(sql, t.draftId);
    if (!b || !src.timeline || !src.speechId || !b.shots.length || !b.shots.every((s) => s.kept)) continue;
    out.push({ kind: 'team', draftId: t.draftId, fid: t.fid, version: b.version, publicationId: null, title: t.title, speechId: src.speechId, by: await deps.name(t.fid), shots: b.shots.length, seconds: src.timeline.seconds });
  }
  if (publishOn()) {
    const pubs = await sql`select p.id, p.draft_id, p.fid, p.board_version, p.recipe, d.speech_id from studio.voice_publications p join studio.voice_drafts d on d.id = p.draft_id where p.taken_down_at is null and p.named order by p.published_at desc limit 50`;
    for (const p of pubs) {
      const r = p.recipe as { speech?: { title?: string }; performer?: { name?: string | null }; shots?: unknown[]; timeline?: Timeline };
      out.push({ kind: 'published', draftId: p.draft_id as string, fid: Number(p.fid), version: p.board_version as number, publicationId: p.id as string, title: r.speech?.title ?? 'A storyboard', speechId: p.speech_id as string, by: r.performer?.name ?? null, shots: r.shots?.length ?? 0, seconds: r.timeline?.seconds ?? 0 });
    }
  }
  return out;
}

/** Takes others may make new pictures for (only once publishing is on): published, named, each credited to its performer. */
export async function sharedTakes(sql: Sql) {
  if (!publishOn()) return [];
  const rows = await sql`select distinct on (p.draft_id) p.draft_id, p.fid, p.recipe, d.speech_id, d.preset_id from studio.voice_publications p join studio.voice_drafts d on d.id = p.draft_id
    where d.kind = 'performance' and p.fid = d.fid and p.taken_down_at is null and p.named order by p.draft_id, p.published_at desc limit 50`;
  return rows.map((r) => {
    const rec = r.recipe as { speech?: { title?: string }; performer?: { name?: string | null }; voice?: { preset?: { name?: string } } };
    return { draftId: r.draft_id as string, performer: rec.performer?.name ?? null, fid: Number(r.fid), speechId: r.speech_id as string, title: rec.speech?.title ?? 'A speech', preset: rec.voice?.preset?.name ?? null };
  });
}

/** "Your voice over an existing storyboard": make this person's board on their own new take from the chosen storyboard. */
export async function fitFromBoard(sql: Sql, fid: number, raw: unknown, deps: WaysDeps): Promise<Result> {
  const b = (raw ?? {}) as { draftId?: unknown; source?: { kind?: unknown; draftId?: unknown; fid?: unknown; publicationId?: unknown } };
  const target = await boardSource(sql, fid, String(b.draftId ?? ''));
  if (!target || target.kind !== 'performance' || target.owner !== fid) return { status: 404, json: { error: 'Not found: record and keep your own take first.' } };
  if (!target.timeline) return { status: 409, json: { error: 'This take has no word timings yet.' } };
  if (await latestBoard(sql, target.id, fid)) return { status: 409, json: { error: 'This take already has a storyboard. Remove it first, or record another take.', reason: 'has-board' } };
  const s = b.source ?? {};
  const choices = await reusableBoards(sql, deps);
  const pick = choices.find((c) => (s.kind === 'published' ? c.kind === 'published' && c.publicationId === s.publicationId : c.kind === 'team' && c.draftId === s.draftId && c.fid === Number(s.fid)));
  if (!pick) return { status: 404, json: { error: 'That storyboard is not one you can use.' } };
  if (pick.draftId === target.id) return { status: 400, json: { error: 'Pick another storyboard than this take’s own.' } };
  const src = await timelineOf(sql, pick.draftId);
  if (!src.timeline) return { status: 409, json: { error: 'That storyboard has no word timings.' } };
  if (src.speechId !== (target.recipe.speech?.id ?? null)) return { status: 400, json: { error: 'Record the same speech as that storyboard’s: its pictures follow its words.', reason: 'other-speech' } };
  const [row] = await sql`select shots, closing, scene from studio.voice_boards where draft_id = ${pick.draftId} and fid = ${pick.fid} and version = ${pick.version}`;
  if (!row) return { status: 404, json: { error: 'That storyboard is gone.' } };
  const srcShots = row.shots as Shot[];
  const closing = (row.closing as Closing | null) ?? null;
  const scene = (row.scene as Scene | null) ?? null;
  const pics = await sql`select shot_key as "shotKey", sha256, storage_key as key, recipe from studio.voice_board_pictures where draft_id = ${pick.draftId} and fid = ${pick.fid}`;
  const wanted = [...srcShots.map((x) => ({ key: x.key, sha: x.kept })), { key: SCENE.key, sha: scene?.kept ?? null }, { key: CLOSING.key, sha: closing?.kept ?? null }].filter((w): w is { key: string; sha: string } => Boolean(w.sha));
  const source: BoardSource = { kind: pick.kind, draftId: pick.draftId, fid: pick.fid, version: pick.version, publicationId: pick.publicationId, by: pick.by, title: pick.title };
  // Every picture is copied as it is (its bytes checked against its sha256), with its recipe and where it came from.
  for (const w of wanted) {
    const p = pics.find((x) => x.shotKey === w.key && x.sha256 === w.sha);
    if (!p) return { status: 409, json: { error: 'A picture of that storyboard is missing.' } };
    const bytes = await deps.getPrivate(p.key as string);
    if (!bytes || sha(bytes) !== w.sha) return { status: 409, json: { error: 'A picture of that storyboard is missing or changed.' } };
    const recipe = { ...(p.recipe as Record<string, unknown>), reusedFrom: { ...source, shotKey: w.key, sha256: w.sha } };
    await keepPicture(sql, target.id, fid, w.key, bytes, w.sha, recipe, String(p.key).endsWith('.jpg') ? 'jpg' : 'png');
  }
  const fit = fitShots(srcShots, src.timeline, target.timeline);
  const version = await saveBoard(sql, fid, target.id, fit.cuts, fit.shots, closing, scene, source);
  return { status: 200, json: { ok: true, version, fittedBy: fit.by, source, url: `/storyboard/board/${target.id}` } };
}
