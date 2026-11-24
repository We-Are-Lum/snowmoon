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
import { angleById, boardLook, COVERAGE, madeWithOf, SCENE, shotPrompt, shotReferences, staleShots, type Shot } from './board';
import { boardSource, keptPictures, latestBoard, pictureBytes } from './board-store';
import { signTicket } from './ticket';
import { CLOSING } from './closing';
import { CHAT } from '../config';
import { guideRecipe, type GuideRef } from './guide';
import { guideDraftById } from './guide-server';
import { headCrop } from './head-crop';

/**
 * A picture for one shot of a storyboard (Nate, 2026-11-21): the challenge's picture code, as the admins' chapter
 * pictures use it. The model row starts on GPT Image 2.5 Sunburst where OpenAI serves, FLUX elsewhere, with FLUX and
 * Gemini offered; a closed model needs its maker's notice and the 18+ box answered; the prompt check, the daily limits
 * and the costs are paidPicture's (admins on the admins' pool). The person's own description is the prompt's first part,
 * word for word, and needs the own-words consent (it is published with the picture). Characters' sheet front views go
 * as references. At most 12 shots and 3 pictures a shot. Nothing is stored until Keep.
 *
 * Real pictures by VOICE.realPictures: 'admins' (Nate, 2026-11-21) for admins only, on the admins' pool and its daily cap;
 * anyone else is refused before any call. The tests and the
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
/** May this person make real pictures for a storyboard? (VOICE.realPictures: 'admins' lets admins only.) */
export const realPicturesFor = (fid: number) => VOICE.realPictures === true || (VOICE.realPictures === 'admins' && isAdmin(fid));
export const shotModels = (where: Where, fid: number) => ({ models: modelRow(where), defaultModel: chapterDefaultModel(where), real: realPicturesFor(fid), limits: VOICE.board });

export async function triesMade(sql: Sql, draftId: string, fid: number): Promise<Record<string, number>> {
  const rows = await sql`select shot_key, count(*)::int as n from studio.voice_board_asks where draft_id = ${draftId} and fid = ${fid} group by shot_key`;
  return Object.fromEntries(rows.map((r) => [r.shot_key as string, r.n as number]));
}

const kindOf = (b: Buffer) => (b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG' ? { mime: 'image/png', ext: 'png' as const } : { mime: 'image/jpeg', ext: 'jpg' as const });

export async function makeShotPicture(sql: Sql, fid: number, request: Request, raw: unknown, where: Where, deps: ShotDeps): Promise<Result> {
  if (deps.real && !realPicturesFor(fid)) return no(403, 'Pictures for storyboards are not switched on yet.', { reason: 'not-yet' });
  const b = (raw ?? {}) as { draftId?: unknown; shotKey?: unknown; description?: unknown; angle?: unknown; styleId?: unknown; characterIds?: unknown; model?: unknown; notice?: unknown; guide?: unknown };
  const draft = await boardSource(sql, fid, String(b.draftId ?? ''));
  if (!draft) return no(404, 'Not found');
  const board = await latestBoard(sql, draft.id, fid);
  const shots: Shot[] = board?.shots ?? [];
  // The closing card's background (slice 4) goes through the same flow under the key 'end': the person's own words for
  // its look, a style, no camera; the site draws the card's text over it.
  const closing = b.shotKey === CLOSING.key;
  // The scene (Nate, 2026-11-22): one establishing picture, made and kept first, under the key 'scene': the person's own
  // words for the setting, a wide eye-level camera, the look. Every shot in the scene then sends it as a reference.
  const sceneShot = b.shotKey === SCENE.key;
  if ((closing || sceneShot) && !board) return no(400, 'Save the storyboard first.');
  const shotNo = closing ? shots.length + 1 : sceneShot ? 0 : shots.findIndex((s) => s.key === b.shotKey) + 1;
  if (!closing && !sceneShot && !shotNo) return no(400, 'Save the cuts first: this shot is not on the saved storyboard.');
  const shot = shots.find((s) => s.key === b.shotKey) ?? null;
  const insert = shot?.insert === true;
  const inScene = !closing && !sceneShot && !insert;
  if (shots.length > VOICE.board.maxShots) return no(400, `A storyboard has at most ${VOICE.board.maxShots} shots: remove a cut first.`);
  const description = typeof b.description === 'string' ? b.description.trim() : '';
  if (!description) return no(400, 'Write what the shot shows first: your words are the prompt.');
  if (description.length > VOICE.board.descriptionMaxChars) return no(400, `At most ${VOICE.board.descriptionMaxChars} characters.`);
  // The scene is always the wide master; an insert's camera is optional (it has no default); every other shot needs one.
  const angle = closing ? null : sceneShot ? angleById(SCENE.angle) : angleById(String(b.angle ?? ''));
  if (!closing && !insert && !angle) return no(400, 'Pick a camera angle');
  const tries = (await triesMade(sql, draft.id, fid))[String(b.shotKey)] ?? 0;
  if (tries >= VOICE.board.maxTriesPerShot) return no(429, `${VOICE.board.maxTriesPerShot} pictures for this shot already: keep one of them.`, { reason: 'tries' });
  if (!(await deps.consented(fid))) return no(403, 'Agree to how your words are published first', { reason: 'consent' });
  const m = challengeModel(b.model ?? chapterDefaultModel(where), where);
  if (!m) return no(400, 'That model isn’t offered here.');
  const problem = noticeProblem(m, b.notice);
  if (problem) return no(400, problem === 'notice' ? 'Read the model’s notice first.' : 'Confirm you’re 18 or older first.', { reason: problem });
  const [styles, characters] = await Promise.all([listDesigns(sql, 'style').catch(() => []), listDesigns(sql, 'character').catch(() => [])]);
  const style = typeof b.styleId === 'string' && b.styleId ? (styles.find((s) => s.versionId === b.styleId) ?? null) : null;
  if (typeof b.styleId === 'string' && b.styleId && !style) return no(400, 'That style is not a published sheet');
  // The scene and every shot in it are made with the board's one look, as saved (Nate, 2026-11-24: "make every shot use
  // the chosen look and the kept scene"), whatever an older page state sends; an insert keeps its own.
  const lookOfBoard = boardLook(shots);
  const asked = closing ? [] : Array.isArray(b.characterIds) ? b.characterIds.filter((x): x is string => typeof x === 'string') : [];
  const wanted = (sceneShot || inScene) && lookOfBoard ? [lookOfBoard] : asked;
  // One look a picture (the scene, a shot, an insert): the scene and the previous shot take the other two references.
  if (wanted.length > 1) return no(400, 'One character’s look a picture');
  const chosen = wanted.map((id) => characters.find((c) => c.versionId === id));
  if (chosen.some((c) => !c)) return no(400, 'A character is not a published sheet');
  // The references, in order (proposal v2): a shot in the scene sends the kept scene and the look (the anchors, every
  // time), then the last kept shot in the scene before it (continuity; never an insert). The scene sends the look only;
  // an insert, the look only if one is chosen; the closing background, none.
  const refs: Buffer[] = [];
  const references: { role: GuideRef['role']; name: string; versionId?: string; shotKey?: string; url?: string; sha256: string; crop?: { kind: 'head'; from: string; box: { left: number; top: number; width: number; height: number } } }[] = [];
  // Clothes described for the scene (fix 2, Nate 2026-11-24): the scene and its shots send the look's face only, a head
  // crop of the sheet's front view, recorded with the box and the sheet picture it came from; the clothes lead the prompt.
  const clothes = sceneShot || inScene ? (board?.scene?.clothing ?? '').trim() : '';
  const lookPicture = async (c: { versionId: string; title: string }, front: { url: string; sha256: string }, bytes: Buffer, role: GuideRef['role']): Promise<string | null> => {
    if (!clothes || c.versionId !== chosen[0]?.versionId) {
      refs.push(bytes);
      references.push({ role, name: c.title, versionId: c.versionId, url: front.url, sha256: front.sha256 });
      return null;
    }
    const h = await headCrop(bytes).catch(() => null);
    if (!h) return `${c.title}’s sheet picture could not be cut to his face. Try again in a moment.`;
    refs.push(h.bytes);
    references.push({ role, name: `${c.title} (the face only)`, versionId: c.versionId, url: front.url, sha256: h.sha256, crop: { kind: 'head', from: front.sha256, box: h.box } });
    return null;
  };
  const sceneKept = board?.scene?.kept ?? null;
  // Kept shots made with another scene (or none) or another look are not this scene's: never a reference.
  const keptRows = board ? ((await keptPictures(sql, draft.id, fid)) as unknown as { shotKey: string; sha256: string; recipe: unknown }[]) : [];
  const made = Object.fromEntries(shots.map((s) => [s.key, s.kept ? keptRows.find((p) => p.shotKey === s.key && p.sha256 === s.kept) : undefined]).map(([k, p]) => [k, p ? madeWithOf((p as { recipe: unknown }).recipe) : undefined]));
  const stale = staleShots(shots, board?.scene ?? null, lookOfBoard, made);
  const fresh = shots.map((s) => (stale.includes(s.key) ? { ...s, kept: null } : s));
  const plan = inScene ? shotReferences(fresh, String(b.shotKey)) : null;
  if (inScene && !sceneKept) return no(400, 'Make and keep the scene first: every shot in the scene uses it.', { reason: 'no-scene' });
  // The guide's draft this picture answers (P2's ruling, Nate 2026-11-22): its stored message, the person's request
  // before it, and the references as sent (the guide's, or the person's change to them).
  const g = b.guide && typeof b.guide === 'object' ? (b.guide as { messageId?: unknown; clothingId?: unknown; references?: unknown }) : null;
  const gd = g ? await guideDraftById(sql, draft.id, fid, String(g.messageId ?? '')) : null;
  if (g && !gd) return no(400, 'That draft of the guide is not on this storyboard.');
  const clothing = g && g.clothingId ? await guideDraftById(sql, draft.id, fid, String(g.clothingId)) : null;
  let drafted: { prompt: string; references: GuideRef[] } | null = null;
  if (gd) {
    const d = gd.guide.draft as Record<string, unknown> | null;
    if (sceneShot) {
      const setting = typeof d?.setting === 'string' ? d.setting : null;
      if (!setting) return no(400, 'That draft is not a setting.');
      const wear = (clothing?.guide.draft as { clothing?: string } | null)?.clothing;
      // The scene's one reference (his look) is the site's, not the guide's choice: filled in below, as sent.
      drafted = { prompt: [setting, wear].filter(Boolean).join(' '), references: [] };
    } else {
      if (d?.shotKey !== b.shotKey || typeof d?.prompt !== 'string') return no(400, 'That draft is for another shot.');
      drafted = { prompt: d.prompt, references: Array.isArray(d.references) ? (d.references as GuideRef[]) : [] };
    }
  }
  let sentRefs: { role: GuideRef['role']; ref: string }[] | null = g && !sceneShot
    ? (Array.isArray(g.references) ? g.references : []).slice(0, IMAGES.maxReferences + 1).map((r) => ({ role: String((r as { role?: unknown }).role ?? '') as GuideRef['role'], ref: String((r as { ref?: unknown }).ref ?? '') }))
    : null;
  // A shot in the scene always sends the kept scene and the board's look first (the anchors), whatever the guide's draft
  // chose; a stale kept shot or another look is left out. What the site added is recorded as the site's choice.
  const siteAdded: { role: GuideRef['role']; ref: string; why: string }[] = [];
  if (sentRefs && inScene) {
    const lookId = chosen[0]?.versionId ?? null;
    const isLook = (ref: string) => characters.some((c) => c.versionId === ref);
    let list = sentRefs.filter((r) => !stale.includes(r.ref) && !(isLook(r.ref) && r.ref !== lookId));
    if (!list.some((r) => r.ref === SCENE.key)) {
      list = [{ role: 'anchor-scene', ref: SCENE.key }, ...list];
      siteAdded.push({ role: 'anchor-scene', ref: SCENE.key, why: 'the kept scene: every shot in the scene is made with it' });
    }
    if (lookId && !list.some((r) => r.ref === lookId)) {
      list = [list[0], { role: 'anchor-look', ref: lookId }, ...list.slice(1)];
      siteAdded.push({ role: 'anchor-look', ref: lookId, why: 'the look chosen for the scene' });
    }
    sentRefs = list.slice(0, IMAGES.maxReferences);
  }
  if (sentRefs) {
    if (sentRefs.length > IMAGES.maxReferences) return no(400, `At most ${IMAGES.maxReferences} reference pictures`);
    // An insert never takes the scene or a shot of the scene (proposal v2, section 3b).
    if (insert && sentRefs.some((r) => r.ref === 'scene' || r.role === 'continuity')) return no(400, 'An insert takes neither the scene nor a previous shot.');
    for (const r of sentRefs) {
      if (r.ref === SCENE.key) {
        if (!sceneKept) return no(400, 'No scene is kept yet.');
        const bytes = await pictureBytes(sql, draft.id, fid, SCENE.key, sceneKept);
        if (!bytes) return no(503, 'The scene picture could not be read. Try again in a moment.');
        refs.push(Buffer.from(bytes));
        references.push({ role: r.role, name: 'the scene', shotKey: SCENE.key, sha256: sceneKept });
        continue;
      }
      const shotRef = fresh.find((s) => s.key === r.ref && s.kept);
      if (shotRef) {
        if (shotRef.key === b.shotKey) return no(400, 'A shot can\u2019t be its own reference.');
        const bytes = await pictureBytes(sql, draft.id, fid, shotRef.key, shotRef.kept!);
        if (!bytes) return no(503, 'A kept shot could not be read. Try again in a moment.');
        refs.push(Buffer.from(bytes));
        references.push({ role: r.role, name: `shot ${shots.indexOf(shotRef) + 1} as kept`, shotKey: shotRef.key, sha256: shotRef.kept! });
        continue;
      }
      const c = characters.find((x) => x.versionId === r.ref);
      const front = c ? (await designByVersion(sql, c.versionId).catch(() => null))?.shown.body.views.front : null;
      if (!c || !front?.url || !front.sha256) return no(400, `A reference isn\u2019t a picture of this storyboard (${r.ref}).`);
      const bytes = await deps.reference(front.url, front.sha256);
      if (!bytes) return no(503, `${c.title}\u2019s sheet picture could not be read. Try again in a moment.`);
      const cropProblem = await lookPicture(c, { url: front.url, sha256: front.sha256 }, bytes, r.role);
      if (cropProblem) return no(503, cropProblem);
    }
  } else {
    if (inScene && sceneKept) {
      const bytes = await pictureBytes(sql, draft.id, fid, SCENE.key, sceneKept);
      if (!bytes) return no(503, 'The scene picture could not be read. Try again in a moment.');
      refs.push(Buffer.from(bytes));
      references.push({ role: 'anchor-scene', name: 'the scene', shotKey: SCENE.key, sha256: sceneKept });
    }
    for (const c of chosen) {
      const front = (await designByVersion(sql, c!.versionId).catch(() => null))?.shown.body.views.front;
      if (!front?.url || !front.sha256) continue;
      const bytes = await deps.reference(front.url, front.sha256);
      if (!bytes) return no(503, `${c!.title}’s sheet picture could not be read. Try again in a moment.`);
      const cropProblem = await lookPicture(c!, { url: front.url, sha256: front.sha256 }, bytes, 'anchor-look');
      if (cropProblem) return no(503, cropProblem);
    }
    if (plan?.continuity) {
      const prev = shots.find((s) => s.key === plan.continuity)!;
      const bytes = await pictureBytes(sql, draft.id, fid, prev.key, prev.kept!);
      if (!bytes) return no(503, 'The previous shot’s picture could not be read. Try again in a moment.');
      refs.push(Buffer.from(bytes));
      references.push({ role: 'continuity', name: `shot ${shots.indexOf(prev) + 1} as kept`, shotKey: prev.key, sha256: prev.kept! });
    }
  }
  if (refs.length > IMAGES.maxReferences) return no(400, `At most ${IMAGES.maxReferences} reference pictures`);
  if (sceneShot && drafted) drafted.references = references.map((r) => ({ role: r.role, ref: r.shotKey ?? r.versionId ?? '', why: 'his look, the scene picture’s one reference' }));
  // The scene's description is the setting and the clothes (sceneWords); with the clothes first, they aren't repeated.
  const promptWords = clothes && sceneShot && description.endsWith(clothes) ? description.slice(0, -clothes.length).trim() || description : description;
  const prompt = `${shotPrompt({ description: promptWords, angle: angle?.id ?? '' }, style, chosen as { title: string; text: string }[], inScene, clothes)}\n\n${IMAGES.suffix}`;
  const worst = reserveUsd(m, { width: IMAGES.viewSize.width, height: IMAGES.viewSize.height * Math.max(1, refs.length) });
  const paid = await deps.paid(sql, fid, request, {
    checkText: prompt,
    spend: { model: { id: m.allowlistId, host: m.call.host }, reserveUsd: worst, ...(isAdmin(fid) ? { pool: 'admin' as const } : {}) },
    // A closed model's maker (OpenAI, Google): a refusal by its own check names it (branch refusal-reasons, owner
    // 2026-11-18; wording reread by the owner 2026-11-22).
    ...(m.open ? {} : { maker: m.maker }),
    make: () => deps.make(m, prompt, refs, request, worst, { no: shotNo, attempt: tries + 1, description, angle: angle?.label ?? (insert ? 'Insert' : 'Closing card background'), style: style?.title ?? null, characters: chosen.map((c) => c!.title) }),
  });
  if (!paid.ok) return { status: paid.status, json: { error: paid.error, ...paid.extra } };
  const made = paid.made;
  await sql`insert into studio.voice_board_asks (draft_id, shot_key, fid) values (${draft.id}, ${String(b.shotKey)}, ${fid})`;
  const bytes = Buffer.from(made.bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { mime, ext } = kindOf(bytes);
  const recipe = {
    v: 1,
    kind: closing ? 'storyboard-closing' : sceneShot ? 'storyboard-scene' : 'storyboard-shot',
    model: deps.real ? { id: m.allowlistId, name: m.name, maker: m.maker, open: m.open, terms: m.terms, host: m.call.host, endpoint: m.call.endpoint } : { id: 'stand-in', name: 'Stand-in card', maker: 'this edition (no model)', open: true },
    standIn: !deps.real,
    prompt,
    description,
    angle: angle?.id ?? null,
    style: style ? { versionId: style.versionId, title: style.title } : null,
    characters: chosen.map((c) => ({ versionId: c!.versionId, title: c!.title })),
    references,
    // P2's ruling (Nate, 2026-11-22): the person's request word for word, the guide's model, the prompt it wrote and the
    // one sent, each reference with who chose it and why, and every edit. A picture the person wrote alone says so.
    guided: guideRecipe({
      guide: gd ? { model: gd.guide.model ?? 'unknown', host: CHAT.route, open: !/stand-in/.test(gd.guide.model ?? '') } : null,
      request: gd?.request ? { text: gd.request.text, id: gd.request.id, madeAt: gd.request.madeAt } : null,
      drafted,
      sent: { prompt: description, references: references.map((r) => ({ role: r.role, ref: r.shotKey ?? r.versionId ?? '' })) },
      siteAdded,
    }),
    // The scene this picture belongs to (a shot in the scene), the camera and who set it, and whether it is an insert.
    ...(sceneShot ? { setting: { text: description, by: `written by FID ${fid}` } } : {}),
    ...(inScene ? { scene: { sha256: sceneKept, setting: board?.scene?.setting ?? null, by: `written by FID ${fid}` }, continuity: plan?.continuity ?? null } : {}),
    ...(closing ? {} : { camera: { angle: angle?.id ?? null, by: sceneShot ? 'the scene (always the wide master)' : (shot?.angleBy ?? 'person') }, coverage: { name: COVERAGE.name, version: COVERAGE.version }, insert }),
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
