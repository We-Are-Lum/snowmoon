import 'server-only';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { VOICE } from '../config';
import { isImprovised, takeLabel, type Spoken } from './spoken';
import { recipePassageLabel } from './passage';
import { publicUrl } from './public-store';
import { sha256Hex, verifyTicket } from './ticket';
import { TAKE_PICTURES, sceneById, scenePlaceholder, setById } from './take-pictures';
import { TAKES_WORDING as W } from './takes-wording';

/**
 * Entering a take in the Ephelion challenge (Nate, 2026-11-26; PR 6). The person's own converted take (a performance
 * draft) and the picture they chose become a publication of kind 'take' (0054_voice_takes.sql, applied): its files are
 * copied under takes/<id>/ in the public bucket, its recipe says who performed it, in which voice, the words as spoken,
 * and the picture's source, labels and credit; the raw recording is never kept or published. studio.publish_voice_take
 * checks it in the database (their own draft, a picture of Lord Ephelion, one live take per speech, replacing in the
 * same call). Taking it down is the storyboards' take-down (0046). Hiding it is #225's.
 * Picture sources: 'set' (an approved picture: TAKE_PICTURES.set), 'own' (the person's own published picture of him),
 * 'preset' (a ready-made scene: TAKE_PICTURES.scenes), 'own-scene' (the free picture they described, held on their device
 * with its signed record until they enter it; the database holds only that they made it and its sha256).
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };
const no = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, json: { error, ...extra } });
const UUID = /^[0-9a-f-]{36}$/;

export interface TakeDeps {
  name: (fid: number, proof: unknown) => Promise<string | null>;
  getPrivate: (key: string) => Promise<Uint8Array | null>;
  putPublic: (key: string, bytes: Uint8Array) => Promise<void>;
  deletePublic: (key: string) => Promise<void>;
  /** A published picture's bytes by its address (the readers' public bucket). */
  fetchPicture: (url: string) => Promise<Uint8Array | null>;
}

/** The ticket the free picture's route signs: the picture's bytes stay on the device until a take uses them. */
export interface SceneTicket { v: 1; kind: 'scene'; person: number; sha256: string; ext: 'png' | 'jpg'; recipe: Record<string, unknown>; issuedAt: number }

/** The person's published pictures of Lord Ephelion ('own'), newest first. */
export async function ownPictures(sql: Sql, fid: number) {
  return sql<{ versionId: string; url: string; sha256: string; at: string }[]>`
    select v.id::text as "versionId", v.asset_url as url, v.asset_sha256 as sha256, v.created_at::text as at
    from studio.element_versions v join studio.elements e on e.id = v.element_id
    where e.created_by_fid = ${fid} and e.element_type = 'image' and e.status = 'published' and v.asset_url is not null
      and studio.picture_is_of(v.id, 'Lord Ephelion')
    order by v.created_at desc limit 24`;
}

/** What the entry step offers: the approved set, the ready-made scenes, the person's own pictures, and the free one. */
export async function takeOptions(sql: Sql, fid: number) {
  const setRows = await sql<{ id: string; url: string | null }[]>`select id::text, asset_url as url from studio.element_versions where id::text in ${sql(TAKE_PICTURES.set.map((s) => s.versionId))}`;
  const [scene] = await sql<{ made: boolean }[]>`select made_at is not null as made from studio.ephelion_scene_pictures where person = ${fid}`;
  return {
    placeholder: TAKE_PICTURES.placeholder,
    set: TAKE_PICTURES.set.map((s) => ({ id: s.id, title: s.title, by: s.by, placeholder: s.placeholder, url: setRows.find((r) => r.id === s.versionId)?.url ?? null })),
    scenes: TAKE_PICTURES.scenes.map((s) => ({ id: s.id, title: s.title, placeholder: s.placeholder, url: `/api/voice/takes/scene-picture?id=${s.id}` })),
    own: (await ownPictures(sql, fid)).map((p) => ({ id: p.versionId, url: p.url, at: p.at })),
    freeSceneMade: Boolean(scene?.made),
  };
}

interface Picture { source: 'set' | 'own' | 'preset' | 'own-scene'; bytes: Uint8Array; ext: 'png' | 'jpg'; record: Record<string, unknown> }
const extOf = (b: Uint8Array): 'png' | 'jpg' => (b[0] === 0x89 ? 'png' : 'jpg');

async function chosenPicture(sql: Sql, fid: number, raw: Record<string, unknown>, deps: TakeDeps): Promise<Picture | Result> {
  const source = String(raw.source ?? '');
  const id = String(raw.id ?? '');
  if (source === 'preset') {
    const s = sceneById(id);
    const bytes = s && (await scenePlaceholder(s.id));
    if (!s || !bytes) return no(400, W.noSuchPicture);
    return { source, bytes, ext: 'jpg', record: { source, scene: s.id, title: s.title, by: 'this edition', labels: [W.labelScene, ...(s.placeholder ? [W.labelPlaceholder] : [])], placeholder: s.placeholder, model: s.placeholder ? null : 'the images session' } };
  }
  if (source === 'set' || source === 'own') {
    const set = source === 'set' ? setById(id) : null;
    const versionId = set ? set.versionId : id;
    if ((source === 'set' && !set) || !UUID.test(versionId)) return no(400, W.noSuchPicture);
    const [v] = await sql<{ url: string | null; sha256: string | null; by: number }[]>`
      select v.asset_url as url, v.asset_sha256 as sha256, e.created_by_fid::int as by from studio.element_versions v join studio.elements e on e.id = v.element_id
      where v.id = ${versionId} and e.element_type = 'image' and e.status = 'published' and studio.picture_is_of(v.id, 'Lord Ephelion')`;
    if (!v?.url) return no(400, W.notOfHim);
    if (source === 'own' && v.by !== fid) return no(403, W.notYours);
    const bytes = await deps.fetchPicture(v.url);
    if (!bytes || (v.sha256 && sha256Hex(bytes) !== v.sha256)) return no(503, W.pictureUnread);
    const byName = set ? set.by : await deps.name(v.by, null);
    return { source, bytes, ext: extOf(bytes), record: { source, version: versionId, title: set?.title ?? W.ownTitle, by: byName, byFid: v.by, labels: [W.labelAi, ...(set ? [set.placeholder ? W.labelPlaceholderSet : W.labelApproved] : [W.labelYours])], recipe: `/challenge/p/${versionId}` } };
  }
  if (source === 'own-scene') {
    const t = verifyTicket<SceneTicket>(String(raw.ticket ?? ''));
    if (!t || t.kind !== 'scene' || t.person !== fid) return no(400, W.sceneRecord);
    const [made] = await sql<{ sha256: string | null }[]>`select picture_sha256 as sha256 from studio.ephelion_scene_pictures where person = ${fid} and made_at is not null`;
    if (!made || made.sha256 !== t.sha256) return no(400, W.sceneRecord);
    const bytes = typeof raw.image === 'string' ? Buffer.from(String(raw.image).replace(/^data:image\/(png|jpeg);base64,/, ''), 'base64') : null;
    if (!bytes || sha256Hex(bytes) !== t.sha256) return no(400, W.sceneRecord);
    return { source, bytes, ext: t.ext, record: { source, title: W.ownSceneTitle, labels: [W.labelAi, W.labelDescribed], recipe: t.recipe } };
  }
  return no(400, W.noSuchPicture);
}

export async function enterTake(sql: Sql, fid: number, raw: unknown, deps: TakeDeps): Promise<Result> {
  const b = (raw ?? {}) as { draftId?: unknown; picture?: unknown; named?: unknown; nameProof?: unknown; replace?: unknown };
  const draftId = String(b.draftId ?? '');
  if (!UUID.test(draftId)) return no(404, 'Not found');
  const [d] = await sql<{ id: string; speech_id: string; recipe: Record<string, unknown>; published_at: string | null }[]>`
    select id, speech_id, recipe, published_at from studio.voice_drafts where id = ${draftId} and fid = ${fid} and kind = 'performance'`;
  if (!d) return no(404, 'Not found');
  if (d.published_at) return no(409, W.alreadyEntered, { reason: 'published' });
  const r = d.recipe as { speech?: { id?: string; title?: string; label?: unknown; source?: unknown; version?: number; credit?: string | null }; spoken?: Spoken | null; model?: string; settings?: unknown; transcribeModel?: string; preset?: { id: string; name: string }; takes?: unknown[]; check?: unknown };
  if (!(r.check || isImprovised(r))) return no(400, W.notChecked);
  const audio = await sql<{ n: number; role: string; sentence: number | null; start: number | null; end: number | null; seconds: number; key: string; sha256: string }[]>`
    select n, role, sentence, replaces_start::float8 as start, replaces_end::float8 as end, seconds::float8 as seconds, storage_key as key, sha256
    from studio.voice_draft_audio where draft_id = ${d.id} order by n`;
  if (!audio.length) return no(400, W.notChecked);
  if (audio.length > 7) return no(400, W.tooManyRedos);
  const pic = await chosenPicture(sql, fid, (b.picture ?? {}) as Record<string, unknown>, deps);
  if ('status' in pic) return pic;
  const named = b.named !== false;
  const performer = named ? await deps.name(fid, b.nameProof) : null;

  const id = randomUUID();
  const files: { role: 'audio' | 'picture'; key: string; sha256: string; [k: string]: unknown }[] = [];
  const put: string[] = [];
  try {
    for (const a of audio) {
      const bytes = await deps.getPrivate(a.key);
      if (!bytes || sha256Hex(bytes) !== a.sha256) throw new Error('a file is missing or changed');
      const key = `takes/${id}/audio-${a.n}-${a.sha256}.mp3`;
      await deps.putPublic(key, bytes);
      put.push(key);
      files.push({ role: 'audio', key, sha256: a.sha256, n: a.n, part: a.role, sentence: a.sentence, replaces: a.role === 'redo' ? [a.start, a.end] : null, seconds: a.seconds });
    }
    const picSha = sha256Hex(pic.bytes);
    const picKey = `takes/${id}/picture-${picSha}.${pic.ext}`;
    await deps.putPublic(picKey, pic.bytes);
    put.push(picKey);
    files.push({ role: 'picture', key: picKey, sha256: picSha });
    const picture = { ...pic.record, key: picKey, sha256: picSha };
    const recipe = {
      v: 1,
      kind: 'take',
      publishedAt: new Date().toISOString(),
      performer: named ? { fid, name: performer } : { named: false },
      speech: r.speech,
      spoken: r.spoken ?? { kind: 'word-for-word' },
      // A passage's label always shows with the take (passage.ts); it is judged the same as a whole take.
      take: { label: takeLabel(r), passage: recipePassageLabel(r.speech) },
      voice: { kind: 'performance', provider: VOICE.provider, closedModel: true, model: r.model, settings: r.settings, transcribeModel: r.transcribeModel, preset: r.preset, takes: r.takes, check: r.check },
      picture,
      people: [isImprovised(r) ? 'the performance and the spoken words (improvised)' : 'the performance', 'the choice of picture', ...(pic.source === 'own-scene' ? ['the scene’s description'] : [])],
      ai: ['the voice conversion', isImprovised(r) ? 'the transcript of the spoken words' : 'the word check (transcription)', ...(pic.source === 'preset' && TAKE_PICTURES.placeholder ? [] : ['the picture'])],
    };
    const dbPicture = { source: pic.source, key: picKey, sha256: picSha, ...(pic.source === 'set' || pic.source === 'own' ? { version: pic.record.version } : {}), ...(pic.source === 'preset' ? { scene: pic.record.scene } : {}) };
    await sql`select studio.publish_voice_take(${id}::uuid, ${d.id}::uuid, ${fid}::bigint, ${named}, ${sql.json({ ...recipe, speech: { ...(r.speech ?? {}), id: d.speech_id } } as unknown as postgres.JSONValue)}, ${sql.json(dbPicture as unknown as postgres.JSONValue)}, ${sql.json(files as unknown as postgres.JSONValue)}, ${b.replace === true})`;
    return { status: 200, json: { id, url: `/ephelion/take/${id}` } };
  } catch (e) {
    for (const k of put) await deps.deletePublic(k).catch(() => {});
    const msg = e instanceof Error ? e.message : '';
    if (/already entered for this speech/.test(msg)) return no(409, W.askReplace, { reason: 'entered' });
    if (/not a published picture of Lord Ephelion/.test(msg)) return no(400, W.notOfHim);
    if (/not a picture this person made/.test(msg)) return no(403, W.notYours);
    if (/not a take this person can enter/.test(msg)) return no(409, W.alreadyEntered, { reason: 'published' });
    return no(503, W.notEntered);
  }
}

/** A live take, for its public page and Share card: no files when hidden (#225's notice only). */
export async function takePublication(sql: Sql, id: string) {
  if (!UUID.test(id)) return null;
  const [p] = await sql`select id, fid, named, published_at, recipe, files, hidden_at, speech_id from studio.voice_publications where id = ${id} and kind = 'take' and taken_down_at is null`;
  if (!p) return null;
  const hidden = Boolean(p.hidden_at);
  const files = hidden ? [] : (p.files as { role: string; key: string; sha256: string; n?: number; part?: string; replaces?: [number, number] | null }[]).map((f) => ({ ...f, url: publicUrl(f.key) }));
  return { id: p.id as string, fid: p.named ? Number(p.fid) : null, publishedAt: String(p.published_at), speechId: String(p.speech_id), recipe: p.recipe as Record<string, unknown>, files, hidden };
}

/**
 * The challenge cards' takes (P7: payment and popularity never order; one take per person per card, newest first): per
 * speech, each person's newest live, shown take, newest first.
 */
export async function cardTakes(sql: Sql, limitPerSpeech = 6) {
  const rows = await sql<{ id: string; speechId: string; at: string; recipe: Record<string, unknown>; files: { role: string; key: string }[] }[]>`
    select id::text, speech_id as "speechId", published_at::text as at, recipe, files from (
      select distinct on (speech_id, fid) id, speech_id, fid, published_at, recipe, files
      from studio.voice_publications where kind = 'take' and taken_down_at is null and hidden_at is null
      order by speech_id, fid, published_at desc) t
    order by published_at desc`;
  const out: Record<string, { id: string; at: string; performer: string | null; voice: string | null; label: string | null; passage: string | null; picture: string | null }[]> = {};
  for (const r of rows) {
    const list = (out[r.speechId] ??= []);
    if (list.length >= limitPerSpeech) continue;
    const rec = r.recipe as { performer?: { name?: string | null }; voice?: { preset?: { name?: string } }; take?: { label?: string }; speech?: unknown };
    const pic = r.files.find((f) => f.role === 'picture');
    list.push({ id: r.id, at: r.at, performer: rec.performer?.name ?? null, voice: rec.voice?.preset?.name ?? null, label: rec.take?.label ?? null, passage: recipePassageLabel(rec.speech), picture: pic ? publicUrl(pic.key) : null });
  }
  return out;
}
