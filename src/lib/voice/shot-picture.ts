import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { IMAGES, VOICE } from '../config';
import { isAdmin } from '../admins';
import { challengeModel, modelRow, noticeProblem, reserveUsd, type ChallengeModel } from '../challenge/models';
import { chapterDefaultModel } from '../chapter-pictures/default-model';
import { designByVersion, listDesigns } from '../images/designs';
import type { Where } from '../images/countries';
import type { Made } from '../images/fal';
import type { paidPicture } from '../images/paid';
import { angleById, shotPrompt, type Shot } from './board';
import { latestBoard, ownPerformance } from './board-store';
import { signTicket } from './ticket';
import { CLOSING } from './closing';

/**
 * A picture for one shot of a storyboard (Nate, 2026-11-21): the challenge's picture code, as the admins' chapter
 * pictures use it. The model row starts on GPT Image 2.5 Sunburst where OpenAI serves, FLUX elsewhere, with FLUX and
 * Gemini offered; a closed model needs its maker's notice and the 18+ box answered; the prompt check, the daily limits
 * and the costs are paidPicture's (admins on the admins' pool). The person's own description is the prompt's first part,
 * word for word, and needs the own-words consent (it is published with the picture). Characters' sheet front views go
 * as references. At most 12 shots and 3 pictures a shot. Nothing is stored until Keep.
 *
 * No real picture before Nate's word: until VOICE.realPictures is true, a real model is refused. The tests and the
 * screenshot run pass stand-in dependencies (a placeholder card; no model, no cost).
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };
const no = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, json: { error, ...extra } });

export interface ShotDeps {
  /** True for the real models; false for the stand-in cards (tests, screenshots). */
  real: boolean;
  consented: (fid: number) => Promise<boolean>;
  reference: (url: string, sha256: string) => Promise<Buffer | null>;
  paid: typeof paidPicture;
  make: (m: ChallengeModel, prompt: string, refs: Buffer[], request: Request, worstUsd: number, shot: { no: number; attempt: number; description: string; angle: string; style: string | null; characters: string[] }) => Promise<Made>;
}

/** What the board page offers: the models for this visitor, the default, and the limits. */
export const shotModels = (where: Where) => ({ models: modelRow(where), defaultModel: chapterDefaultModel(where), real: VOICE.realPictures, limits: VOICE.board });

export async function triesMade(sql: Sql, draftId: string): Promise<Record<string, number>> {
  const rows = await sql`select shot_key, count(*)::int as n from studio.voice_board_asks where draft_id = ${draftId} group by shot_key`;
  return Object.fromEntries(rows.map((r) => [r.shot_key as string, r.n as number]));
}

const kindOf = (b: Buffer) => (b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG' ? { mime: 'image/png', ext: 'png' as const } : { mime: 'image/jpeg', ext: 'jpg' as const });

export async function makeShotPicture(sql: Sql, fid: number, request: Request, raw: unknown, where: Where, deps: ShotDeps): Promise<Result> {
  if (deps.real && !VOICE.realPictures) return no(403, 'Pictures for storyboards are not switched on yet.', { reason: 'not-yet' });
  const b = (raw ?? {}) as { draftId?: unknown; shotKey?: unknown; description?: unknown; angle?: unknown; styleId?: unknown; characterIds?: unknown; model?: unknown; notice?: unknown };
  const draft = await ownPerformance(sql, fid, String(b.draftId ?? ''));
  if (!draft) return no(404, 'Not found');
  const board = await latestBoard(sql, draft.id);
  const shots: Shot[] = board?.shots ?? [];
  // The closing card's background (slice 4) goes through the same flow under the key 'end': the person's own words for
  // its look, a style, no camera; the site draws the card's text over it.
  const closing = b.shotKey === CLOSING.key;
  if (closing && !board) return no(400, 'Save the storyboard first.');
  const shotNo = closing ? shots.length + 1 : shots.findIndex((s) => s.key === b.shotKey) + 1;
  if (!shotNo) return no(400, 'Save the cuts first: this shot is not on the saved storyboard.');
  if (shots.length > VOICE.board.maxShots) return no(400, `A storyboard has at most ${VOICE.board.maxShots} shots: remove a cut first.`);
  const description = typeof b.description === 'string' ? b.description.trim() : '';
  if (!description) return no(400, 'Write what the shot shows first: your words are the prompt.');
  if (description.length > VOICE.board.descriptionMaxChars) return no(400, `At most ${VOICE.board.descriptionMaxChars} characters.`);
  const angle = closing ? null : angleById(String(b.angle ?? ''));
  if (!closing && !angle) return no(400, 'Pick a camera angle');
  const tries = (await triesMade(sql, draft.id))[String(b.shotKey)] ?? 0;
  if (tries >= VOICE.board.maxTriesPerShot) return no(429, `${VOICE.board.maxTriesPerShot} pictures for this shot already: keep one of them.`, { reason: 'tries' });
  if (!(await deps.consented(fid))) return no(403, 'Agree to how your words are published first', { reason: 'consent' });
  const m = challengeModel(b.model ?? chapterDefaultModel(where), where);
  if (!m) return no(400, 'That model isn’t offered here.');
  const problem = noticeProblem(m, b.notice);
  if (problem) return no(400, problem === 'notice' ? 'Read the model’s notice first.' : 'Confirm you’re 18 or older first.', { reason: problem });
  const [styles, characters] = await Promise.all([listDesigns(sql, 'style').catch(() => []), listDesigns(sql, 'character').catch(() => [])]);
  const style = typeof b.styleId === 'string' && b.styleId ? (styles.find((s) => s.versionId === b.styleId) ?? null) : null;
  if (typeof b.styleId === 'string' && b.styleId && !style) return no(400, 'That style is not a published sheet');
  const wanted = closing ? [] : Array.isArray(b.characterIds) ? b.characterIds.filter((x): x is string => typeof x === 'string') : [];
  if (wanted.length > IMAGES.maxReferences) return no(400, `Up to ${IMAGES.maxReferences} characters’ sheets`);
  const chosen = wanted.map((id) => characters.find((c) => c.versionId === id));
  if (chosen.some((c) => !c)) return no(400, 'A character is not a published sheet');
  // Each character's sheet front view goes along as a reference picture, as the chapter pictures send them.
  const refs: Buffer[] = [];
  const references: { name: string; versionId: string; url: string; sha256: string }[] = [];
  for (const c of chosen) {
    const front = (await designByVersion(sql, c!.versionId).catch(() => null))?.shown.body.views.front;
    if (!front?.url || !front.sha256) continue;
    const bytes = await deps.reference(front.url, front.sha256);
    if (!bytes) return no(503, `${c!.title}’s sheet picture could not be read. Try again in a moment.`);
    refs.push(bytes);
    references.push({ name: c!.title, versionId: c!.versionId, url: front.url, sha256: front.sha256 });
  }
  const prompt = `${shotPrompt({ description, angle: angle?.id ?? '' }, style, chosen as { title: string; text: string }[])}\n\n${IMAGES.suffix}`;
  const worst = reserveUsd(m, { width: IMAGES.viewSize.width, height: IMAGES.viewSize.height * Math.max(1, refs.length) });
  const paid = await deps.paid(sql, fid, request, {
    checkText: prompt,
    spend: { model: { id: m.allowlistId, host: m.call.host }, reserveUsd: worst, ...(isAdmin(fid) ? { pool: 'admin' as const } : {}) },
    make: () => deps.make(m, prompt, refs, request, worst, { no: shotNo, attempt: tries + 1, description, angle: angle?.label ?? 'Closing card background', style: style?.title ?? null, characters: chosen.map((c) => c!.title) }),
  });
  if (!paid.ok) return { status: paid.status, json: { error: paid.error, ...paid.extra } };
  const made = paid.made;
  await sql`insert into studio.voice_board_asks (draft_id, shot_key, fid) values (${draft.id}, ${String(b.shotKey)}, ${fid})`;
  const bytes = Buffer.from(made.bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { mime, ext } = kindOf(bytes);
  const recipe = {
    v: 1,
    kind: closing ? 'storyboard-closing' : 'storyboard-shot',
    model: deps.real ? { id: m.allowlistId, name: m.name, maker: m.maker, open: m.open, terms: m.terms, host: m.call.host, endpoint: m.call.endpoint } : { id: 'stand-in', name: 'Stand-in card', maker: 'this edition (no model)', open: true },
    standIn: !deps.real,
    prompt,
    description,
    angle: angle?.id ?? null,
    style: style ? { versionId: style.versionId, title: style.title } : null,
    characters: chosen.map((c) => ({ versionId: c!.versionId, title: c!.title })),
    references,
    attempt: tries + 1,
    settings: made.settings,
    seed: made.seed,
    requestId: made.requestId,
    costUsd: made.costUsd,
    guard: { model: IMAGES.guardModel, verdict: 'ok' },
    sha256,
    ext,
    madeBy: { fid },
    madeAt: new Date().toISOString(),
    assist: closing
      ? { description: `written by FID ${fid}`, text: 'the card’s text is set by the site from the recipe and drawn over the picture; no model writes it' }
      : { description: `written by FID ${fid}`, cuts: 'proposed by a rule at sentence ends, moved by the person' },
  };
  const now = Date.now();
  const ticket = signTicket({ v: 1, kind: 'picture', fid, draftId: draft.id, shotKey: String(b.shotKey), sha256, ext, recipe, issuedAt: now, expiresAt: now + VOICE.ticketMinutes * 60_000 });
  return { status: 200, json: { image: `data:${mime};base64,${bytes.toString('base64')}`, sha256, recipe, ticket, triesLeft: VOICE.board.maxTriesPerShot - tries - 1, left: paid.left } };
}
