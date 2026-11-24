import 'server-only';
import { improvisedCredit, isImprovised, takeLabel, type Spoken } from './spoken';
import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { VOICE } from '../config';
import { boardSource, keptPictures, latestBoard, madeWithScene } from './board-store';
import { CLOSING, closingCredits, publishProblems, type Closing, type PictureModel } from './closing';
import { closingCard } from './closing-card';
import { publicUrl } from './public-store';
import { oldSceneShots, SCENE, type Shot } from './board';

/**
 * Publishing a storyboard (Ephelion slice 4, 2026-11-21; DRAFT; behind VOICE.publish, off). The person's own act, from
 * their draft: the latest saved board, every shot's kept picture, the closing card, and a performance whose every
 * sentence matches the speech (publishProblems). Public copies of the audio pieces, the pictures and the composed
 * closing card go under storyboards/<id>/; the full recipe (the voice's, each picture's, the closing card's, the credits)
 * is stored with them. The raw take is never published (the recipe holds only its sha256). A take-down deletes the
 * public files and makes it a draft again.
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export interface PublishDeps {
  /** The person's name here (the signed sign-in name, or Farcaster's for the FID); null if none. */
  name: (fid: number, proof: unknown) => Promise<string | null>;
  getPrivate: (key: string) => Promise<Uint8Array | null>;
  putPublic: (key: string, bytes: Uint8Array) => Promise<void>;
  deletePublic: (key: string) => Promise<void>;
  /** Stand-in cards may be published only on a local test copy. */
  standInsAllowed: boolean;
}

const MODEL_NAMES: Record<string, string> = {
  eleven_multilingual_sts_v2: 'Voice Changer (Multilingual v2)',
  eleven_multilingual_v2: 'text-to-speech (Multilingual v2)',
  scribe_v3: 'Scribe v3',
  scribe_v2: 'Scribe v2',
  scribe_v1: 'Scribe v1',
};
const elevenLabs = (id: string) => ({ name: `ElevenLabs ${MODEL_NAMES[id] ?? id}`, maker: 'ElevenLabs' });

interface DraftRecipe {
  model: string;
  settings?: unknown;
  transcribeModel?: string;
  preset?: { id: string; name: string };
  speech?: { id: string; title: string; version?: number; credit?: string | null; aiHelp?: boolean | null; source?: { kind: string; block?: string; by?: string }; label?: { kind?: string; writers?: string[] } };
  takes?: unknown[];
  check?: { sentences: number; matched: number; unmatched: number[]; bySound?: unknown[] };
  spoken?: Spoken | null;
}
const pictureModel = (recipe: Record<string, unknown>): PictureModel => {
  const m = (recipe.model ?? {}) as { id?: string; name?: string; maker?: string; open?: boolean };
  return { id: String(m.id ?? 'unknown'), name: String(m.name ?? m.id ?? 'a model'), maker: String(m.maker ?? 'unknown'), open: Boolean(m.open) };
};

/** What the draft page shows before publishing: the problems, and the credits as the card would show them. */
export async function publishPreview(sql: Sql, fid: number, draftId: string, deps: Pick<PublishDeps, 'standInsAllowed'>, performer: string | null) {
  const draft = await boardSource(sql, fid, draftId);
  if (!draft) return null;
  const board = await latestBoard(sql, draft.id, fid);
  const pictures = await keptPictures(sql, draft.id, fid);
  const reading = draft.kind === 'reading';
  const invented = (draft.recipe as { speech?: { source?: { kind?: string }; label?: { kind?: string } } }).speech?.label?.kind === 'invented' || (draft.recipe as { speech?: { source?: { kind?: string } } }).speech?.source?.kind === 'edition';
  const r = draft.recipe as unknown as DraftRecipe;
  const shots: Shot[] = board?.shots ?? [];
  const closing: Closing | null = board?.closing ?? null;
  const kept = new Set(pictures.map((p) => `${p.shotKey}:${p.sha256}`));
  const used = [...shots.filter((s) => s.kept && kept.has(`${s.key}:${s.kept}`)).map((s) => pictures.find((p) => p.shotKey === s.key && p.sha256 === s.kept)!)];
  const background = closing?.kept ? (pictures.find((p) => p.shotKey === CLOSING.key && p.sha256 === closing.kept) ?? null) : null;
  if (background) used.push(background);
  // The scene picture (Nate, 2026-11-22) is published with the board: every shot in the scene was made from it.
  const scene = board?.scene ?? null;
  const scenePicture = scene?.kept ? (pictures.find((p) => p.shotKey === SCENE.key && p.sha256 === scene.kept) ?? null) : null;
  if (scenePicture) used.push(scenePicture);
  const models = used.map((p) => pictureModel(p.recipe as Record<string, unknown>));
  const standIns = models.filter((m) => m.id === 'stand-in').length;
  const problems = publishProblems({
    // A reading is ElevenLabs reading the speech's own written words, so the word-for-word rule is a performance's; a
    // reading's word check (its timings) is kept in the recipe instead.
    // An improvised take (Nate, 2026-11-24) isn't held to the speech's words: the word check only labels it.
    unmatched: reading || isImprovised(r) ? [] : (r.check?.unmatched ?? []),
    sentences: reading ? (draft.timing?.check.sentences ?? 0) : (r.check?.sentences ?? 0),
    shots,
    keptShots: kept,
    closing,
    closingKept: Boolean(background),
    standIns,
    standInsAllowed: deps.standInsAllowed,
    inventedHeld: invented && !VOICE.publishInvented,
    sceneKept: Boolean(scenePicture),
    oldScene: oldSceneShots(shots, scene, madeWithScene(shots, pictures as unknown as { shotKey: string; sha256: string; recipe: unknown }[])),
  });
  if (!board) problems.unshift('Save the storyboard first.');
  const credits = closingCredits({
    speech: {
      title: r.speech?.title ?? 'A speech',
      block: r.speech?.source?.kind === 'book' ? (r.speech.source.block ?? null) : null,
      // The team's invented speech: its version; the credit stays a DRAFT placeholder until Nate gives it (2026-11-22).
      // The credit the recording's recipe carries (from its version's aiHelp, which Nate sets).
      ...(invented ? { invented: { version: r.speech?.version ?? null, credit: r.speech?.credit ?? r.speech?.label?.writers?.[0] ?? null } } : {}),
    },
    performer,
    ...(isImprovised(r) ? { improvised: improvisedCredit(performer, { title: r.speech?.title ?? 'A speech', credit: invented ? (r.speech?.credit ?? null) : null, block: r.speech?.source?.kind === 'book' ? (r.speech.source.block ?? null) : null }) } : {}),
    preset: r.preset?.name ?? 'a preset voice',
    voiceModel: elevenLabs(r.model),
    transcribeModel: elevenLabs(reading ? (draft.timing?.model ?? VOICE.models.transcribe) : (r.transcribeModel ?? VOICE.models.transcribe)),
    pictures: models,
    shots: shots.length,
    voice: reading ? 'reading' : 'performance',
    scene: Boolean(scenePicture),
    inserts: shots.filter((s) => s.insert).length,
  });
  return { draft, board, pictures, used, background, scenePicture, problems, credits, recipe: r };
}

export async function publishBoard(sql: Sql, fid: number, raw: unknown, deps: PublishDeps): Promise<Result> {
  const b = (raw ?? {}) as { draftId?: unknown; version?: unknown; named?: unknown; nameProof?: unknown };
  const named = b.named !== false;
  const performer = named ? await deps.name(fid, b.nameProof) : null;
  const p = await publishPreview(sql, fid, String(b.draftId ?? ''), deps, performer);
  if (!p) return { status: 404, json: { error: 'Not found' } };
  if (!p.board || Number(b.version) !== p.board.version) return { status: 409, json: { error: 'The storyboard changed: look again, then publish.', reason: 'version' } };
  if (p.problems.length) return { status: 400, json: { error: 'Not ready to publish', problems: p.problems } };

  const id = randomUUID();
  const audioRows = await sql`select n, role, sentence, replaces_start::float8 as "replacesStart", replaces_end::float8 as "replacesEnd", seconds::float8 as seconds, storage_key as key, sha256 from studio.voice_draft_audio where draft_id = ${p.draft.id} order by n`;
  const files: { role: 'audio' | 'shot' | 'closing' | 'background' | 'scene'; key: string; sha256: string; [k: string]: unknown }[] = [];
  const put: string[] = [];
  const copy = async (from: string, to: string, role: (typeof files)[number]['role'], extra: Record<string, unknown>, sha256: string) => {
    const bytes = await deps.getPrivate(from);
    if (!bytes || sha(bytes) !== sha256) throw new Error(`a file is missing or changed (${role})`);
    await deps.putPublic(to, bytes);
    put.push(to);
    files.push({ role, key: to, sha256, ...extra });
  };
  try {
    for (const a of audioRows) await copy(a.key, `storyboards/${id}/audio-${a.n}-${a.sha256}.mp3`, 'audio', { n: a.n, part: a.role, sentence: a.sentence, replaces: a.role === 'redo' ? [a.replacesStart, a.replacesEnd] : null, seconds: a.seconds }, a.sha256);
    const pictureRows = await sql`select shot_key as "shotKey", sha256, storage_key as key from studio.voice_board_pictures where draft_id = ${p.draft.id} and fid = ${fid}`;
    const keyOf = (shotKey: string, sha256: string) => pictureRows.find((x) => x.shotKey === shotKey && x.sha256 === sha256)!.key as string;
    for (const s of p.board.shots) {
      const from = keyOf(s.key, s.kept!);
      await copy(from, `storyboards/${id}/${s.key}-${s.kept}.${from.endsWith('.png') ? 'png' : 'jpg'}`, 'shot', { shotKey: s.key, start: s.start, end: s.end }, s.kept!);
    }
    if (p.scenePicture) {
      const scFrom = keyOf(SCENE.key, p.scenePicture.sha256);
      await copy(scFrom, `storyboards/${id}/scene-${p.scenePicture.sha256}.${scFrom.endsWith('.png') ? 'png' : 'jpg'}`, 'scene', {}, p.scenePicture.sha256);
    }
    const bg = p.background!;
    const bgFrom = keyOf(CLOSING.key, bg.sha256);
    await copy(bgFrom, `storyboards/${id}/background-${bg.sha256}.${bgFrom.endsWith('.png') ? 'png' : 'jpg'}`, 'background', {}, bg.sha256);
    const bgBytes = await deps.getPrivate(bgFrom);
    const card = await closingCard(bgBytes, p.recipe.speech?.title ?? 'A speech', p.credits);
    const cardSha = sha(card);
    const cardKey = `storyboards/${id}/closing-${cardSha}.png`;
    await deps.putPublic(cardKey, card);
    put.push(cardKey);
    files.push({ role: 'closing', key: cardKey, sha256: cardSha, seconds: CLOSING.seconds });

    const pictureRecipe = (shotKey: string, s: string) => (p.pictures.find((x) => x.shotKey === shotKey && x.sha256 === s)?.recipe ?? null) as Record<string, unknown> | null;
    const strip = (r: Record<string, unknown> | null) => (r && !named ? { ...r, madeBy: { named: false } } : r);
    const recipe = {
      v: 1,
      kind: 'storyboard',
      publishedAt: new Date().toISOString(),
      // Who made the storyboard (and, for a performance, performed it); a reading has no performer.
      performer: named ? { fid, name: performer } : { named: false },
      storyboardBy: named ? { fid, name: performer } : { named: false },
      speech: p.recipe.speech,
      // The spoken words (Nate, 2026-11-24): word for word, or improvised with the performer's words (as transcribed and
      // as they corrected them, with each correction), credited to them.
      spoken: p.recipe.spoken ?? { kind: 'word-for-word' },
      take: { label: takeLabel(p.recipe) },
      voice:
        p.draft.kind === 'reading'
          ? {
              // The ready-made reading: ElevenLabs' text-to-speech of the speech's written words; no performer.
              kind: 'reading',
              provider: VOICE.provider,
              closedModel: true,
              model: p.recipe.model,
              preset: p.recipe.preset,
              textSha256: (p.recipe as unknown as { textSha256?: string }).textSha256 ?? null,
              timings: p.draft.timing && { model: p.draft.timing.model, check: p.draft.timing.check, credits: p.draft.timing.credits, transcriptDeleted: p.draft.timing.transcriptDeleted },
            }
          : {
              kind: 'performance',
              provider: VOICE.provider,
              closedModel: true,
              model: p.recipe.model,
              settings: p.recipe.settings,
              transcribeModel: p.recipe.transcribeModel,
              preset: p.recipe.preset,
              // Each raw take by its sha256 only: the take itself is never kept or published.
              takes: p.recipe.takes,
              check: p.recipe.check,
            },
      timeline: p.draft.timeline,
      cuts: p.board.cuts,
      boardVersion: p.board.version,
      // The scene: the person's own words for the setting and the establishing picture every shot in the scene was made from.
      scene: p.scenePicture ? { setting: p.board.scene!.setting, settingBy: 'the storyboard’s maker', picture: strip(pictureRecipe(SCENE.key, p.scenePicture.sha256)) } : null,
      shots: p.board.shots.map((s, i) => ({ n: i + 1, key: s.key, start: s.start, end: s.end, description: s.description, angle: s.angle, angleBy: s.angleBy ?? 'person', insert: s.insert === true, styleId: s.styleId, characterIds: s.characterIds, picture: strip(pictureRecipe(s.key, s.kept!)) })),
      closing: { description: p.board.closing!.description, styleId: p.board.closing!.styleId, background: strip(pictureRecipe(CLOSING.key, bg.sha256)), credits: p.credits, cardSha256: cardSha, seconds: CLOSING.seconds, text: 'set by the site from this recipe and drawn over the picture' },
      people: [...(p.draft.kind === 'reading' ? [] : isImprovised(p.recipe) ? ['the performance', 'the spoken words (improvised), and any corrections to their transcript'] : ['the performance']), ...(p.scenePicture ? ['the scene’s setting', 'which shots are inserts'] : []), 'each shot’s description and camera', 'the cuts (moved from a rule’s proposal)', 'the closing card’s look', 'which pictures were kept'],
      ai: p.draft.kind === 'reading' ? ['the reading (text-to-speech)', 'the word timings (transcription)', 'the pictures'] : isImprovised(p.recipe) ? ['the voice conversion', 'the transcript of the spoken words (transcription)', 'the pictures'] : ['the voice conversion', 'the word check (transcription)', 'the pictures'],
      noAiVideo: true,
    };
    await sql`select studio.publish_voice_board(${id}::uuid, ${p.draft.id}::uuid, ${fid}::bigint, ${p.board.version}::int, ${named}, ${sql.json(recipe as unknown as postgres.JSONValue)}, ${sql.json(files as unknown as postgres.JSONValue)})`;
    return { status: 200, json: { id, url: `/storyboard/spoken/${id}` } };
  } catch (e) {
    for (const k of put) await deps.deletePublic(k).catch(() => {});
    const msg = e instanceof Error ? e.message : '';
    if (/not the latest storyboard|unpublished performance/.test(msg)) return { status: 409, json: { error: 'The storyboard changed or is already published: look again.' } };
    return { status: 503, json: { error: 'It could not be published; nothing was made public. Try again in a moment.' } };
  }
}

export async function takeDown(sql: Sql, fid: number, id: string, deps: Pick<PublishDeps, 'deletePublic'>): Promise<Result> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { status: 404, json: { error: 'Not found' } };
  const keys = (await sql`select k from studio.take_down_voice_publication(${id}::uuid, ${fid}::bigint) as k`).map((r) => r.k as string);
  if (!keys.length) return { status: 404, json: { error: 'Not found' } };
  const failed: string[] = [];
  for (const k of keys) await deps.deletePublic(k).catch(() => failed.push(k));
  return { status: 200, json: { ok: true, removed: keys.length - failed.length, failed: failed.length } };
}

/** A live publication, for its public page: the recipe and the files' public addresses. */
export async function publication(sql: Sql, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [r] = await sql`select id, fid, named, published_at, recipe, files from studio.voice_publications where id = ${id} and taken_down_at is null`;
  if (!r) return null;
  const files = (r.files as { role: string; key: string; sha256: string }[]).map((f) => ({ ...f, url: publicUrl(f.key) }));
  return { id: r.id as string, fid: r.named ? (r.fid as number) : null, publishedAt: r.published_at, recipe: r.recipe as Record<string, unknown>, files };
}

/** A person's own live publication of a draft, if any (the draft page links to it). */
export async function ownPublications(sql: Sql, fid: number) {
  return sql`select id, draft_id as "draftId", published_at as "publishedAt" from studio.voice_publications where fid = ${fid} and taken_down_at is null order by published_at desc limit 50`;
}
