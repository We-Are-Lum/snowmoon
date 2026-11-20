import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { CHAPTER_PICTURES, IMAGES } from '../config';
import { checkJob, type CheckJob } from '../illustration-check/jobs';
import { saveDecision as saveReview } from '../illustration-check/review';
import { chapterDefaultModel } from './default-model';
import { challengeModel, modelRow, noticeProblem, reserveUsd, type ChallengeModel } from '../challenge/models';
import { loadChapter } from '../book';
import { inPassage } from '../images/sheets';
import { designByVersion, listDesigns } from '../images/designs';
import { challengeStyles } from '../challenge/make';
import type { Where } from '../images/countries';
import { paidPicture } from '../images/paid';
import { makeEdit, makeImage, type Made } from '../images/fal';
import { makeChallengeClosed, makeChapterClosed } from '../images/closed';
import { chapterReference } from '../images/reference-picture';
import { putPublic, storageReady } from '../images/store';
import { blockedName } from '../images/rules';
import { adminSpentToday } from '../images/limits';
import { nextUtcMidnight } from '../images/paid';
import { randomBytes } from 'node:crypto';
import { saveAddition, saveDecision, saveLook, saveVersion } from './admin';
import { additionsReady, firstKeep, latestLooks, lookFor, pictureBytes, pictureVersion, picturesReady, readAddition, readReplacements } from './read';
import { addPrompt, addedJobId, isAddedId, redoPrompt, type Addition, type Look, type PictureRecipe } from './shared';

/**
 * What /you/illustrations does with the edition's chapter pictures (owner, 2026-11-18, option B): an admin redoes a
 * picture (a private draft, paid from the admins' own daily cap), keeps it (shown in the chapter at once), or shows any
 * earlier picture again (the committed file included). The routes under /api/you/illustrations answer admins only and
 * call these; ./admin.ts does the writes. Every model and storage call can be replaced in tests (`Deps`): no test and
 * no local harness calls a model or the buckets.
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };
const no = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, json: { error, ...extra } });

export interface Deps {
  reference: (url: string, sha256: string) => Promise<Buffer | null>;
  makeOpen: (prompt: string, ref: { bytes: Buffer; contentType: string; width: number; height: number }) => Promise<Made>;
  makeClosed: (m: ChallengeModel, prompt: string, ref: Buffer, request: Request, worstUsd: number) => Promise<Made>;
  putPublic: (sha256: string, bytes: Buffer, contentType: string) => Promise<string>;
  storageReady: () => boolean;
  handleFor: (fid: number) => Promise<string | null>;
  paid: typeof paidPicture;
  /** The own-words consent (principle 1): a redo's note and a written look are published with the picture once it is kept. */
  consented: (fid: number) => Promise<boolean>;
  /** An added picture (owner, 2026-11-19): from the note alone, or with sheet pictures as references. */
  makeAdded: (m: ChallengeModel, prompt: string, refs: Buffer[], request: Request, worstUsd: number) => Promise<Made>;
  /** The characters a passage names that have a published sheet with a front view (the references an admin may send). */
  sheets: (sql: Sql, chapter: number, start: number, end: number) => Promise<SheetRef[]>;
}

/** A character's sheet picture an added picture may take as a reference: the newest published sheet's front view. */
export interface SheetRef {
  slug: string;
  name: string;
  versionId: string;
  url: string;
  sha256: string;
}

/** The passage's characters with a published sheet front view, in the book's order (src/lib/images/sheets.ts inPassage). */
export async function passageSheets(sql: Sql, chapter: number, start: number, end: number): Promise<SheetRef[]> {
  const found = inPassage(chapter, start, end).characters;
  if (!found.length) return [];
  const rows = await listDesigns(sql, 'character').catch(() => []);
  const out: SheetRef[] = [];
  for (const c of found) {
    for (const r of rows.filter((x) => x.entity === c.name)) {
      const page = await designByVersion(sql, r.versionId).catch(() => null);
      const front = page?.shown.body.views.front;
      if (front?.url && front.sha256) {
        out.push({ slug: c.slug, name: c.name, versionId: r.versionId, url: front.url, sha256: front.sha256 });
        break;
      }
    }
  }
  return out;
}
export const realDeps = async (): Promise<Deps> => ({
  reference: (url, sha) => chapterReference(url, sha),
  makeOpen: (prompt, ref) => makeEdit(prompt, [ref]),
  makeClosed: (m, prompt, ref, request, worst) => makeChallengeClosed(m, prompt, ref, request, worst),
  putPublic,
  storageReady,
  handleFor: async (fid) => (await import('../adaptation-pages')).handleFor(fid),
  paid: paidPicture,
  consented: async (fid) => (await import('../consent')).hasConsented(fid),
  makeAdded: (m, prompt, refs, request, worst) =>
    m.open ? (refs.length ? makeEdit(prompt, refs.map((bytes) => ({ bytes, contentType: 'image/jpeg', width: IMAGES.viewSize.width, height: IMAGES.viewSize.height }))) : makeImage(prompt)) : makeChapterClosed(m, prompt, refs, request, worst),
  sheets: passageSheets,
});

export { chapterDefaultModel } from './default-model';

/** Lettered pictures wait for the lettering work (owner, 2026-11-18: "no words in pictures until the lettering work ships"). */
export const redoable = (job: CheckJob) => Boolean(job.image) && !job.lettering.length;

/** The picture a job shows now: a kept version, or the committed file. */
async function shownNow(sql: Sql, job: CheckJob): Promise<{ versionId: string | null; url: string; sha256: string; width: number; height: number } | null> {
  const r = (await readReplacements(sql)).get(job.id);
  if (r) return { versionId: r.versionId, url: r.url, sha256: r.sha256, width: r.width, height: r.height };
  return job.image ? { versionId: null, url: job.image.url, sha256: job.image.sha256, width: job.image.width, height: job.image.height } : null;
}

const HANDLE = /^[a-z0-9][a-z0-9._-]{0,40}$/;
const handleOf = async (deps: Deps, fid: number) => {
  const h = await deps.handleFor(fid).catch(() => null);
  return h && HANDLE.test(h) ? h : null;
};

/** The day's admin spend, the cap and when it resets (00:00 UTC; the page writes it in the admin's own time). */
export async function capState(sql: Sql) {
  return { spentUsd: Number((await adminSpentToday(sql)).toFixed(4)), capUsd: CHAPTER_PICTURES.adminDailyCapUsd, resetAt: nextUtcMidnight() };
}

/** What the review page adds to each job, and the page's own state. */
export async function adminView(sql: Sql, where: Where) {
  const ready = await picturesReady(sql).catch(() => false);
  const styles = ready ? (await challengeStyles(sql)).map((s) => ({ id: s.versionId, label: s.label, text: s.text })) : [];
  return {
    ready,
    storage: storageReady(),
    models: modelRow(where),
    defaultModel: chapterDefaultModel(where),
    adding: ready && (await additionsReady(sql).catch(() => false)),
    styles,
    looks: ready ? await latestLooks(sql) : { all: null, chapters: {} },
    cap: ready ? await capState(sql) : { spentUsd: 0, capUsd: CHAPTER_PICTURES.adminDailyCapUsd, resetAt: nextUtcMidnight() },
  };
}

/** A redo: one draft, private, from the picture shown now, the admin's note, the chapter's look and the model chosen. */
export async function redoPicture(sql: Sql, fid: number, request: Request, raw: unknown, where: Where, deps: Deps): Promise<Result> {
  if (!(await picturesReady(sql))) return no(503, 'Redoing pictures needs the chapter-picture migration (0042_chapter_picture_versions) first.');
  const b = (raw ?? {}) as { jobId?: unknown; note?: unknown; model?: unknown; notice?: unknown };
  const job = typeof b.jobId === 'string' ? checkJob(b.jobId) : null;
  if (!job) return no(404, 'No such picture');
  if (!redoable(job)) return no(400, job.lettering.length ? 'This picture has lettering; it can be redone once the lettering work ships.' : 'This job has no picture to redo.');
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (!note) return no(400, 'A redo needs your note: it goes into the prompt.');
  if (!(await deps.consented(fid))) return no(403, 'Agree to how your words are published first', { reason: 'consent' });
  if (note.length > CHAPTER_PICTURES.noteMaxChars) return no(400, `A note is at most ${CHAPTER_PICTURES.noteMaxChars} characters.`);
  const m = challengeModel(b.model, where);
  if (!m) return no(400, 'That model isn’t offered here.');
  const problem = noticeProblem(m, b.notice);
  if (problem) return no(400, problem === 'notice' ? 'Read the model’s notice first.' : 'Confirm you’re 18 or older first.', { reason: problem });
  const look = lookFor(await latestLooks(sql), job.chapter);
  const shown = await shownNow(sql, job);
  if (!shown) return no(400, 'This job has no picture to redo.');
  const ref = await deps.reference(shown.url, shown.sha256);
  if (!ref) return no(503, 'The picture shown now could not be read. Try again in a moment.');
  const { prompt, parts } = redoPrompt(job.prompt, note, look, IMAGES.suffix);
  const worst = reserveUsd(m, { width: shown.width, height: shown.height });
  const paid = await deps.paid(sql, fid, request, {
    checkText: prompt,
    spend: { model: { id: m.allowlistId, host: m.call.host }, reserveUsd: worst, pool: 'admin' },
    make: () => (m.open ? deps.makeOpen(prompt, { bytes: ref, contentType: 'image/jpeg', width: shown.width, height: shown.height }) : deps.makeClosed(m, prompt, ref, request, worst)),
  });
  if (!paid.ok) return { status: paid.status, json: { error: paid.error, ...paid.extra } };
  const made = paid.made;
  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  const madeAt = new Date().toISOString();
  const recipe: PictureRecipe = {
    v: 1, kind: 'chapter-picture', job: job.id, chapter: job.chapter, block: job.idx,
    model: { id: m.allowlistId, name: m.name, maker: m.maker, open: m.open, terms: m.terms, host: m.call.host, endpoint: m.call.endpoint, ...(m.call.only ? { only: m.call.only } : {}) },
    prompt, parts,
    reference: { what: shown.versionId ? `the picture shown before (version ${shown.versionId})` : 'the picture shown before (the committed file)', url: shown.url, sha256: shown.sha256 },
    settings: made.settings, seed: made.seed, requestId: made.requestId, sha256, width: IMAGES.size.width, height: IMAGES.size.height,
    costUsd: made.costUsd, guard: { model: IMAGES.guardModel, verdict: 'ok' }, madeBy: { fid, role: 'admin' }, madeAt,
    assist: { scene: 'the edition’s job prompt, drafted by the coding agent (Claude, by Anthropic)', note: `written by FID ${fid}`, look: look?.kind === 'style' ? `the published style “${look.label}”` : look ? `written by an admin` : 'none' },
  };
  const id = await saveVersion(sql, fid, {
    jobId: job.id, chapter: job.chapter, model: m.allowlistId, maker: m.maker, open: m.open, look, note, prompt, recipe,
    sha256, width: IMAGES.size.width, height: IMAGES.size.height, jpeg: made.bytes, costUsd: made.costUsd,
  });
  // The review's own record of the decision (0028): a redo, with its note, by this admin, now.
  await saveReview(sql, { jobId: job.id, decision: 'regenerate', note, byFid: fid, imageSha256: shown.sha256, checkRun: null, draftedNote: null, draftedBy: null, noteEdited: null }).catch((e) => console.error('chapter pictures: review row not saved', (e as Error).message));
  return { status: 200, json: { versionId: id, draft: `/api/you/illustrations/draft/${id}`, left: paid.left, cap: await capState(sql) } };
}

/**
 * Show a picture in the chapter from now (owner, 2026-11-18: "A keep goes live at once"): a draft (its file goes to the
 * public bucket first), a version kept before, or the committed file (versionId null). Returns the chapter to revalidate.
 */
export async function showPicture(sql: Sql, fid: number, raw: unknown, deps: Deps): Promise<Result & { chapter?: number }> {
  if (!(await picturesReady(sql))) return no(503, 'Keeping pictures needs the chapter-picture migration (0042_chapter_picture_versions) first.');
  const b = (raw ?? {}) as { jobId?: unknown; versionId?: unknown };
  if (typeof b.jobId === 'string' && isAddedId(b.jobId)) return showAdded(sql, fid, b.jobId, b.versionId, deps);
  const job = typeof b.jobId === 'string' ? checkJob(b.jobId) : null;
  if (!job) return no(404, 'No such picture');
  const versionId = b.versionId === null || b.versionId === undefined || b.versionId === 'original' ? null : String(b.versionId);
  const shown = await shownNow(sql, job);
  if ((shown?.versionId ?? null) === versionId) return no(409, 'That picture is already the one shown.');
  const byHandle = await handleOf(deps, fid);
  if (versionId === null) {
    if (!job.image) return no(400, 'This job has no committed picture.');
    await saveDecision(sql, fid, { jobId: job.id, chapter: job.chapter, versionId: null, action: 'restore', publicUrl: null, byHandle });
    await saveReview(sql, { jobId: job.id, decision: 'keep', note: null, byFid: fid, imageSha256: job.image.sha256, checkRun: null, draftedNote: null, draftedBy: null, noteEdited: null }).catch(() => {});
    return { status: 200, json: { shown: 'original' }, chapter: job.chapter };
  }
  const v = await pictureVersion(sql, versionId);
  if (!v || v.jobId !== job.id) return no(404, 'No such version of this picture');
  const before = await firstKeep(sql, v.id);
  let url = before?.publicUrl ?? null;
  if (!url) {
    if (!deps.storageReady()) return no(503, 'Pictures can’t be stored on this copy of the site.');
    const bytes = await pictureBytes(sql, v.id);
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== v.sha256) return no(500, 'The draft’s file doesn’t match its record.');
    url = await deps.putPublic(v.sha256, bytes, 'image/jpeg');
  }
  await saveDecision(sql, fid, { jobId: job.id, chapter: job.chapter, versionId: v.id, action: before ? 'restore' : 'keep', publicUrl: url, byHandle });
  await saveReview(sql, { jobId: job.id, decision: 'keep', note: null, byFid: fid, imageSha256: v.sha256, checkRun: null, draftedNote: null, draftedBy: null, noteEdited: null }).catch(() => {});
  return { status: 200, json: { shown: v.id, url }, chapter: job.chapter };
}

/** Set the look every redo uses (chapter null) or one chapter's (look null clears it): a published style, or a line. */
export async function setLook(sql: Sql, fid: number, raw: unknown, consented: (fid: number) => Promise<boolean> = async () => false): Promise<Result> {
  if (!(await picturesReady(sql))) return no(503, 'Looks need the chapter-picture migration (0042_chapter_picture_versions) first.');
  const b = (raw ?? {}) as { chapter?: unknown; look?: unknown };
  const chapter = b.chapter === null || b.chapter === undefined ? null : Number(b.chapter);
  if (chapter !== null && !(Number.isInteger(chapter) && chapter >= 1 && chapter <= 32)) return no(400, 'No such chapter');
  const l = (b.look ?? null) as { kind?: unknown; id?: unknown; text?: unknown } | null;
  let look: Look | null = null;
  if (l?.kind === 'style') {
    const s = (await challengeStyles(sql)).find((x) => x.versionId === l.id);
    if (!s) return no(400, 'That style isn’t one of the site’s offered styles.');
    look = { kind: 'style', label: s.label, text: s.text, versionId: s.versionId };
  } else if (l?.kind === 'line') {
    const text = typeof l.text === 'string' ? l.text.trim() : '';
    if (!text) return no(400, 'Write the look first.');
    if (text.length > CHAPTER_PICTURES.lookMaxChars) return no(400, `A look is at most ${CHAPTER_PICTURES.lookMaxChars} characters.`);
    if (blockedName(text)) return no(400, 'No real people: the look names someone on the blocked list.');
    if (!(await consented(fid))) return no(403, 'Agree to how your words are published first', { reason: 'consent' });
    look = { kind: 'line', text };
  } else if (l !== null) return no(400, 'Choose a style or write a line');
  if (chapter === null && !look) return no(400, 'Every chapter needs a look; choose a style or write a line.');
  await saveLook(sql, fid, chapter, look);
  return { status: 200, json: { saved: true } };
}

/** The public file of a version, put on the public bucket the first time it is kept. */
async function publicUrlOf(sql: Sql, v: { id: string; sha256: string }, deps: Deps): Promise<{ url: string; before: boolean } | Result> {
  const before = await firstKeep(sql, v.id);
  if (before?.publicUrl) return { url: before.publicUrl, before: true };
  if (!deps.storageReady()) return no(503, 'Pictures can’t be stored on this copy of the site.');
  const bytes = await pictureBytes(sql, v.id);
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== v.sha256) return no(500, 'The draft’s file doesn’t match its record.');
  return { url: await deps.putPublic(v.sha256, bytes, 'image/jpeg'), before: false };
}

/**
 * Keep, show again, or take off a picture an admin added (owner, 2026-11-19: "Undo for a new picture is 'take it off the
 * chapter'; it stays stored and can be shown again. Nothing is deleted."). versionId null takes it off.
 */
async function showAdded(sql: Sql, fid: number, jobId: string, rawVersion: unknown, deps: Deps): Promise<Result & { chapter?: number }> {
  const a = await readAddition(sql, jobId);
  if (!a) return no(404, 'No such picture');
  const versionId = rawVersion === null || rawVersion === undefined || rawVersion === 'off' ? null : String(rawVersion);
  const shown = (await readReplacements(sql)).get(jobId)?.versionId ?? null;
  if (shown === versionId) return no(409, versionId ? 'That picture is already the one shown.' : 'This picture isn’t in the chapter now.');
  const byHandle = await handleOf(deps, fid);
  if (versionId === null) {
    await saveDecision(sql, fid, { jobId, chapter: a.chapter, versionId: null, action: 'restore', publicUrl: null, byHandle });
    return { status: 200, json: { shown: 'off' }, chapter: a.chapter };
  }
  const v = await pictureVersion(sql, versionId);
  if (!v || v.jobId !== jobId) return no(404, 'No such version of this picture');
  const pub = await publicUrlOf(sql, v, deps);
  if ('status' in pub) return pub;
  await saveDecision(sql, fid, { jobId, chapter: a.chapter, versionId: v.id, action: pub.before ? 'restore' : 'keep', publicUrl: pub.url, byHandle });
  return { status: 200, json: { shown: v.id, url: pub.url }, chapter: a.chapter };
}

/**
 * Add a picture at a passage, while reading (owner, 2026-11-19): a private draft from the admin's note, the chapter's
 * look and, if chosen, characters' sheet pictures (only of characters the passage names). A first draft records where
 * the picture sits (NEXT_chapter_picture_additions); { jobId } makes another draft for the same added picture. Paid from
 * the admins' daily cap, through the site's prompt check, with the no-words line, as a redo is.
 */
export async function addPicture(sql: Sql, fid: number, request: Request, raw: unknown, where: Where, deps: Deps): Promise<Result> {
  if (!(await picturesReady(sql)) || !(await additionsReady(sql))) return no(503, 'Adding pictures needs the migration NEXT_chapter_picture_additions first.', { reason: 'not-ready' });
  const b = (raw ?? {}) as { jobId?: unknown; chapter?: unknown; after?: unknown; start?: unknown; end?: unknown; note?: unknown; model?: unknown; notice?: unknown; characters?: unknown };
  let place: Omit<Addition, 'byFid' | 'at'> | null = null;
  let isNew = false;
  if (typeof b.jobId === 'string') {
    const a = isAddedId(b.jobId) ? await readAddition(sql, b.jobId) : null;
    if (!a) return no(404, 'No such added picture');
    place = a;
  } else {
    const chapter = Number(b.chapter), after = Number(b.after), start = Number(b.start), end = Number(b.end);
    const ch = Number.isInteger(chapter) ? loadChapter(chapter) : null;
    if (!ch) return no(400, 'No such chapter');
    const idx = new Set(ch.blocks.map((x) => x.idx));
    if (![after, start, end].every((i) => Number.isInteger(i) && idx.has(i))) return no(400, 'Choose blocks in this chapter');
    if (start > end) return no(400, 'The passage starts after it ends');
    if (ch.blocks.filter((x) => x.idx >= start && x.idx <= end).length > IMAGES.admin.maxBlocks) return no(400, `A passage can be up to ${IMAGES.admin.maxBlocks} blocks`);
    place = { jobId: addedJobId(chapter, after, randomBytes(4).toString('hex')), chapter, after, start, end };
    isNew = true;
  }
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (!note) return no(400, 'Write what the picture shows: your note is the prompt.');
  if (note.length > CHAPTER_PICTURES.noteMaxChars) return no(400, `A note is at most ${CHAPTER_PICTURES.noteMaxChars} characters.`);
  if (!(await deps.consented(fid))) return no(403, 'Agree to how your words are published first', { reason: 'consent' });
  const m = challengeModel(b.model ?? chapterDefaultModel(where), where);
  if (!m) return no(400, 'That model isn’t offered here.');
  const problem = noticeProblem(m, b.notice);
  if (problem) return no(400, problem === 'notice' ? 'Read the model’s notice first.' : 'Confirm you’re 18 or older first.', { reason: problem });
  const wanted = Array.isArray(b.characters) ? b.characters.filter((x): x is string => typeof x === 'string') : [];
  if (wanted.length > IMAGES.maxReferences) return no(400, `Up to ${IMAGES.maxReferences} characters’ sheets`);
  const offered = wanted.length ? await deps.sheets(sql, place.chapter, place.start, place.end) : [];
  const chosen = wanted.map((slug) => offered.find((o) => o.slug === slug));
  if (chosen.some((c) => !c)) return no(400, 'Only characters this passage names, with a published sheet, can go along.');
  const refs: Buffer[] = [];
  for (const c of chosen as SheetRef[]) {
    const bytes = await deps.reference(c.url, c.sha256);
    if (!bytes) return no(503, `${c.name}’s sheet picture could not be read. Try again in a moment.`);
    refs.push(bytes);
  }
  const look = lookFor(await latestLooks(sql), place.chapter);
  const { prompt, parts } = addPrompt(note, (chosen as SheetRef[]).map((c) => c.name), look, IMAGES.suffix);
  const worst = reserveUsd(m, { width: IMAGES.viewSize.width, height: IMAGES.viewSize.height * Math.max(1, refs.length) });
  const paid = await deps.paid(sql, fid, request, {
    checkText: prompt,
    spend: { model: { id: m.allowlistId, host: m.call.host }, reserveUsd: worst, pool: 'admin' },
    make: () => deps.makeAdded(m, prompt, refs, request, worst),
  });
  if (!paid.ok) return { status: paid.status, json: { error: paid.error, ...paid.extra } };
  const made = paid.made;
  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  const recipe: PictureRecipe = {
    v: 1, kind: 'chapter-picture', job: place.jobId, chapter: place.chapter, block: place.after,
    model: { id: m.allowlistId, name: m.name, maker: m.maker, open: m.open, terms: m.terms, host: m.call.host, endpoint: m.call.endpoint, ...(m.call.only ? { only: m.call.only } : {}) },
    prompt, parts, reference: null,
    added: { after: place.after, start: place.start, end: place.end },
    references: (chosen as SheetRef[]).map((c) => ({ sheet: c.slug, name: c.name, versionId: c.versionId, url: c.url, sha256: c.sha256 })),
    settings: made.settings, seed: made.seed, requestId: made.requestId, sha256, width: IMAGES.size.width, height: IMAGES.size.height,
    costUsd: made.costUsd, guard: { model: IMAGES.guardModel, verdict: 'ok' }, madeBy: { fid, role: 'admin' }, madeAt: new Date().toISOString(),
    assist: { scene: 'none: the admin’s note is the picture’s description', note: `written by FID ${fid}`, look: look?.kind === 'style' ? `the published style “${look.label}”` : look ? 'written by an admin' : 'none' },
  };
  if (isNew) await saveAddition(sql, fid, { jobId: place.jobId, chapter: place.chapter, after: place.after, start: place.start, end: place.end });
  const id = await saveVersion(sql, fid, {
    jobId: place.jobId, chapter: place.chapter, model: m.allowlistId, maker: m.maker, open: m.open, look, note, prompt, recipe,
    sha256, width: IMAGES.size.width, height: IMAGES.size.height, jpeg: made.bytes, costUsd: made.costUsd,
  });
  return { status: 200, json: { jobId: place.jobId, versionId: id, draft: `/api/you/illustrations/draft/${id}`, left: paid.left, cap: await capState(sql) } };
}
