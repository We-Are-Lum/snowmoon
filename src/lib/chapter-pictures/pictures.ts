import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { CHAPTER_PICTURES, IMAGES } from '../config';
import { checkJob, type CheckJob } from '../illustration-check/jobs';
import { saveDecision as saveReview } from '../illustration-check/review';
import { challengeModel, modelRow, noticeProblem, reserveUsd, type ChallengeModel } from '../challenge/models';
import { challengeStyles } from '../challenge/make';
import type { Where } from '../images/countries';
import { paidPicture } from '../images/paid';
import { makeEdit, type Made } from '../images/fal';
import { makeChallengeClosed } from '../images/closed';
import { chapterReference } from '../images/reference-picture';
import { putPublic, storageReady } from '../images/store';
import { blockedName } from '../images/rules';
import { adminSpentToday } from '../images/limits';
import { nextUtcMidnight } from '../images/paid';
import { saveDecision, saveLook, saveVersion } from './admin';
import { firstKeep, latestLooks, lookFor, pictureBytes, pictureVersion, picturesReady, readReplacements } from './read';
import { redoPrompt, type Look, type PictureRecipe } from './shared';

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
});

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
    styles,
    looks: ready ? await latestLooks(sql) : { all: null, chapters: {} },
    cap: ready ? await capState(sql) : { spentUsd: 0, capUsd: CHAPTER_PICTURES.adminDailyCapUsd, resetAt: nextUtcMidnight() },
  };
}

/** A redo: one draft, private, from the picture shown now, the admin's note, the chapter's look and the model chosen. */
export async function redoPicture(sql: Sql, fid: number, request: Request, raw: unknown, where: Where, deps: Deps): Promise<Result> {
  if (!(await picturesReady(sql))) return no(503, 'Redoing pictures needs the chapter-picture migration (NEXT_chapter_picture_versions) first.');
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
  if (!(await picturesReady(sql))) return no(503, 'Keeping pictures needs the chapter-picture migration (NEXT_chapter_picture_versions) first.');
  const b = (raw ?? {}) as { jobId?: unknown; versionId?: unknown };
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
  if (!(await picturesReady(sql))) return no(503, 'Looks need the chapter-picture migration (NEXT_chapter_picture_versions) first.');
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
