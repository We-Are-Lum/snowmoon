/**
 * The edition's chapter pictures, redone by an admin (owner, 2026-11-18, option B; branch chapter-pictures-admin).
 * Shared by the server and the review page: the shapes, the redo's prompt and the public recipe. Pure: no database,
 * no network, no server-only import, so the tests run it as it is.
 *
 * The rules a redo keeps (owner, 2026-11-18): no artist, studio or film names, no real people, no words in the picture
 * (the lettering work hasn't shipped). The whole prompt (the scene, the admin's note and the look) goes through the
 * site's prompt check (src/lib/images/paid.ts: the blocked names, then the guard model, whose rules name all three)
 * before anything is spent, and ends with the site's no-words line (IMAGES.suffix).
 */

/** The look every redo in a chapter uses: one of the site's published styles, or a line an admin wrote. */
export type Look = { kind: 'style'; label: string; text: string; versionId: string } | { kind: 'line'; text: string };

/** One picture an admin made for a chapter picture (studio.chapter_picture_versions, without its bytes). */
export interface PictureVersion {
  id: string;
  jobId: string;
  chapter: number;
  madeByFid: number;
  madeAt: string;
  model: string;
  maker: string;
  open: boolean;
  look: Look | null;
  note: string;
  prompt: string;
  sha256: string;
  width: number;
  height: number;
  costUsd: number | null;
  recipe: PictureRecipe;
}

/** Which picture a chapter picture shows (studio.chapter_picture_decisions): a version, or the committed file (null). */
export interface PictureDecision {
  id: number;
  jobId: string;
  chapter: number;
  versionId: string | null;
  action: 'keep' | 'restore';
  publicUrl: string | null;
  byFid: number;
  byHandle: string | null;
  at: string;
}

/** What the chapter shows in place of the committed file: a kept version, with who kept it and when. */
export interface ShownReplacement {
  versionId: string;
  jobId: string;
  chapter: number;
  url: string;
  sha256: string;
  width: number;
  height: number;
  model: string;
  maker: string;
  open: boolean;
  look: Look | null;
  note: string;
  prompt: string;
  byFid: number;
  byHandle: string | null;
  at: string;
}

/** The recipe stored with each version and served at /api/chapter-pictures/<id> once it has been kept. */
export interface PictureRecipe {
  v: 1;
  kind: 'chapter-picture';
  job: string;
  chapter: number;
  block: number;
  model: { id: string; name: string; maker: string; open: boolean; terms: string; host: string; endpoint: string; only?: string[] };
  prompt: string;
  /** The prompt's parts, as they were joined (every one is in `prompt`). */
  parts: { redo: string; scene: string; note: string; look: Look | null; suffix: string };
  /** The one picture a redo starts from (the picture shown before); null for a picture an admin added. */
  reference: { what: string; url: string; sha256: string } | null;
  /** An added picture (owner, 2026-11-19): where it sits and the passage it shows. */
  added?: { after: number; start: number; end: number };
  /** The characters' sheet pictures sent with an added picture, in the order sent. */
  references?: { sheet: string; name: string; versionId: string; url: string; sha256: string }[];
  settings: Record<string, unknown>;
  seed: number | null;
  requestId: string | null;
  sha256: string;
  width: number;
  height: number;
  costUsd: number | null;
  guard: { model: string; verdict: 'ok' };
  madeBy: { fid: number; role: 'admin' };
  madeAt: string;
  /** Who drafted which input (principle 3c's `assist`): the scene prompt is the edition's job prompt; the note and look are the admin's. */
  assist: { scene: string; note: string; look: string };
}

/** The line that starts a redo's prompt. DRAFT wording (coding agent, 2026-11-18). */
export const REDO_LINE = 'Redraw the reference picture as this scene, changing what the note asks and keeping the rest.';

/**
 * A job's scene prompt as a redo sends it: the job's own words, with the references to the cast sheets taken out
 * ("the man from reference image 2" becomes "the man"), since a redo sends one reference, the picture shown now.
 */
export function sceneOf(jobPrompt: string): string {
  return jobPrompt.replace(/\s+from reference image \d+/gi, '').replace(/\s+\(reference image \d+\)/gi, '').trim();
}

/** The exact prompt of a redo: the redo line and the scene, the admin's note, the look, and the no-words line. */
export function redoPrompt(jobPrompt: string, note: string, look: Look | null, suffix: string): { prompt: string; parts: PictureRecipe['parts'] } {
  const scene = sceneOf(jobPrompt);
  const parts = { redo: REDO_LINE, scene, note: note.trim(), look, suffix };
  return { prompt: [`${REDO_LINE} ${scene}`, parts.note, look?.text.trim() || null, suffix].filter(Boolean).join('\n\n'), parts };
}

/**
 * A picture an admin added to a chapter (owner, 2026-11-19; 0043_chapter_picture_additions): an id of its own in the
 * job ids' pattern, c<chapter>-b<block>-added-<8 hex>, so 0042's versions and decisions hold its pictures as they hold
 * the committed ones'. It sits after block `after` and shows the passage start..end.
 */
export interface Addition {
  jobId: string;
  chapter: number;
  after: number;
  start: number;
  end: number;
  byFid: number;
  at: string;
}
export const ADDED_ID = /^c(\d{1,2})-b(\d{1,4})-added-[0-9a-f]{8}$/;
export const isAddedId = (id: string) => ADDED_ID.test(id);
export const addedJobId = (chapter: number, after: number, hex8: string) => `c${chapter}-b${String(after).padStart(3, '0')}-added-${hex8}`;

/** The line naming the sheet pictures sent with an added picture. DRAFT wording (coding agent, 2026-11-19). */
export const sheetsLine = (names: string[]) =>
  names.length ? `The reference ${names.length === 1 ? 'picture is the character sheet' : 'pictures are the character sheets'} of ${names.join(', ')}, in that order: draw ${names.length === 1 ? 'them' : 'each'} as the sheet shows.` : '';

/** The exact prompt of an added picture: the admin's note (what it shows), the sheets line, the look, the no-words line. */
export function addPrompt(note: string, sheetNames: string[], look: Look | null, suffix: string): { prompt: string; parts: PictureRecipe['parts'] } {
  const parts = { redo: '', scene: sheetsLine(sheetNames), note: note.trim(), look, suffix };
  return { prompt: [parts.note, parts.scene || null, look?.text.trim() || null, suffix].filter(Boolean).join('\n\n'), parts };
}

/** The look as a recipe or a page says it: the style's name, or "a written line". */
export const lookName = (l: Look | null) => (!l ? 'none' : l.kind === 'style' ? l.label : 'a line written by an admin');

/** "@garance" when the handle is known, "FID 193912" otherwise. */
export const adminName = (fid: number, handle: string | null) => (handle ? `@${handle}` : `FID ${fid}`);

/**
 * A date as the pages write it ("18 Nov 2026"). day(): in UTC, the stable form the server writes and the browser's
 * first render repeats. localDay(): in the reader's own time zone (or the one given, for tests), which the browser
 * writes once it has mounted (src/components/local-date.tsx; owner, 2026-11-18).
 */
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const localDay = (iso: string, timeZone?: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(timeZone ? { timeZone } : {}) });

/** The caption's words under a replaced picture, before its date ("Redone by @garance"). DRAFT wording. */
export const replacedBy = (r: Pick<ShownReplacement, 'byFid' | 'byHandle'>) => `Redone by ${adminName(r.byFid, r.byHandle)}`;
/** The same for a picture an admin added ("Added by @garance"). DRAFT wording (2026-11-19). */
export const addedBy = (r: Pick<ShownReplacement, 'byFid' | 'byHandle'>) => `Added by ${adminName(r.byFid, r.byHandle)}`;

/** The model as a caption names it: "GPT Image 2.5 Sunburst, a closed model by OpenAI". */
export const modelLine = (name: string, maker: string, open: boolean) => `${name}, ${open ? 'an open-weight model' : 'a closed model'} by ${maker}`;

/** The public recipe's path for a version (served only once the version has been kept). */
export const recipePath = (versionId: string) => `/api/chapter-pictures/${versionId}`;

/** Every point the public recipe must state (principle 1, P1d; principle 4, P4b). Empty: complete. */
export function recipeProblems(r: { recipe?: Partial<PictureRecipe>; publishedBy?: { fid?: unknown; action?: unknown; at?: unknown } | null } | null): string[] {
  if (!r?.recipe) return ['no recipe'];
  const p: string[] = [];
  const x = r.recipe;
  if (!x.prompt?.trim()) p.push('no prompt');
  if (!x.model?.id || !x.model?.maker || typeof x.model.open !== 'boolean') p.push('no model, maker or open/closed');
  if (!x.parts || !('look' in x.parts)) p.push('no style (look)');
  if (!x.parts?.note?.trim()) p.push('no note');
  if (x.parts?.note && x.prompt && !x.prompt.includes(x.parts.note)) p.push('the note is not in the prompt');
  if (!/^[0-9a-f]{64}$/.test(String(x.sha256 ?? ''))) p.push('no sha256');
  if (!r.publishedBy || typeof r.publishedBy.fid !== 'number' || !r.publishedBy.action || !r.publishedBy.at) p.push('no published_by (the admin who kept it, and when)');
  return p;
}
