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

/**
 * The look every redo in a chapter uses: one of the site's published styles (any visible one, the remix challenge's
 * included; owner's request via Garance, 2026-11-21), or a line an admin wrote. A style records its version and its
 * maker as its page credits them (`by`: "@naaate", "FID 12" or a wallet's short address; P2); looks saved before
 * 2026-11-21 have neither.
 */
export type Look = { kind: 'style'; label: string; text: string; versionId: string; versionNo?: number; by?: string; byFid?: number } | { kind: 'line'; text: string };

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
  /**
   * For a picture an admin added: the character sheets whose pictures were sent with it (its recipe's `references`, by
   * slug, in the order sent). Which character sheets it shows on (src/lib/images/sheet-images.ts). Empty for a redo.
   */
  sheets?: string[];
  /** Whose pictures it was made after (its sheet pictures and picked references, in the order sent), for the caption. */
  credits?: RefCredit[];
}

/** What kind of published picture a reference is: a remix-challenge picture, any other reader's picture, a base, a sheet. */
export type RefKind = 'remix' | 'picture' | 'base' | 'sheet';

/** A published picture picked as a reference: what the recipe lists for it (P1, P2). */
export interface PickedRef {
  versionId: string;
  kind: RefKind;
  /** What it is, as the caption says it: "Zei remix", "picture", "Bai base", "Zei sheet". */
  what: string;
  /** Its maker as its own page credits them: "@garance", "FID 12", or a wallet's short address. */
  by: string;
  byFid: number;
  /** Its page on the site. */
  href: string;
  url: string;
  sha256: string;
}

/** One credit in a caption: whose, and what; `hidden` once its maker or a moderator hid it (no name or link then). */
export interface RefCredit {
  what: string;
  by: string;
  hidden: boolean;
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
  parts: { redo: string; scene: string; note: string; look: Look | null; suffix: string; refs?: string };
  /** The one picture a redo starts from (the picture shown before); null for a picture an admin added. */
  reference: { what: string; url: string; sha256: string } | null;
  /** An added picture (owner, 2026-11-19): where it sits and the passage it shows. */
  added?: { after: number; start: number; end: number };
  /** The characters' sheet pictures sent with an added picture, in the order sent (`kind` and `by` since 2026-11-21). */
  references?: { sheet: string; name: string; versionId: string; url: string; sha256: string; kind?: 'sheet'; by?: string; byFid?: number }[];
  /**
   * Published pictures an admin picked as references (owner's request via Garance, 2026-11-21), sent after the sheet
   * pictures (an added picture) or after the picture shown before (a redo), in the order picked.
   */
  picked?: PickedRef[];
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

/** A redo's first line when picked references go with it: the picture shown before is reference picture 1. DRAFT wording (2026-11-21). */
export const REDO_LINE_WITH = 'Redraw reference picture 1 as this scene, changing what the note asks and keeping the rest.';

/**
 * The exact prompt of a redo: the redo line and the scene, the admin's note, the look, and the no-words line. With
 * picked references (2026-11-21), the first line names reference picture 1 and a line after the scene says what each
 * other picture is ("Reference picture 2 is a Zei remix."), without its maker's name: handles never go into a prompt.
 */
export function redoPrompt(jobPrompt: string, note: string, look: Look | null, suffix: string, picked: Pick<PickedRef, 'what'>[] = []): { prompt: string; parts: PictureRecipe['parts'] } {
  const scene = sceneOf(jobPrompt);
  const redo = picked.length ? REDO_LINE_WITH : REDO_LINE;
  const refs = pickedLine(1, picked.map((x) => x.what));
  const parts = { redo, scene, note: note.trim(), look, suffix, ...(refs ? { refs } : {}) };
  return { prompt: [`${redo} ${scene}`, refs || null, parts.note, look?.text.trim() || null, suffix].filter(Boolean).join('\n\n'), parts };
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

/** "a Zei remix", "an Ink sheet": the article for what a picked reference is. */
const aOrAn = (what: string) => `${/^[aeiou]/i.test(what) ? 'an' : 'a'} ${what}`;

/**
 * The line naming the published pictures an admin picked as references, numbered after the pictures before them
 * (`before`: the sheets of an added picture, or the picture shown before in a redo). DRAFT wording (coding agent,
 * 2026-11-21): "Reference picture 2 is a Zei remix; reference picture 3 is a Bai base: use them as the note says."
 */
export const pickedLine = (before: number, whats: string[]) =>
  whats.length ? `${whats.map((w, i) => `${i ? 'reference' : 'Reference'} picture ${before + i + 1} is ${aOrAn(w)}`).join('; ')}: use ${whats.length === 1 ? 'it' : 'them'} as the note says.` : '';

/** The sheets line numbered (when picked references follow it): "Reference pictures 1 and 2 are the character sheets of Zei, Bai, in that order: …". */
const sheetsNumbered = (names: string[]) =>
  names.length === 1 ? `Reference picture 1 is the character sheet of ${names[0]}: draw them as the sheet shows.` : `Reference pictures 1 to ${names.length} are the character sheets of ${names.join(', ')}, in that order: draw each as the sheet shows.`;

/**
 * The exact prompt of an added picture: the admin's note (what it shows), the sheets line, the look, the no-words line.
 * With picked references (2026-11-21) the sheets line is numbered and the picked line follows it; without them the
 * prompt is exactly as before.
 */
export function addPrompt(note: string, sheetNames: string[], look: Look | null, suffix: string, picked: Pick<PickedRef, 'what'>[] = []): { prompt: string; parts: PictureRecipe['parts'] } {
  const refs = pickedLine(sheetNames.length, picked.map((x) => x.what));
  const scene = refs ? [sheetNames.length ? sheetsNumbered(sheetNames) : '', refs].filter(Boolean).join(' ') : sheetsLine(sheetNames);
  const parts = { redo: '', scene, note: note.trim(), look, suffix, ...(refs ? { refs } : {}) };
  return { prompt: [parts.note, parts.scene || null, look?.text.trim() || null, suffix].filter(Boolean).join('\n\n'), parts };
}

/**
 * How many published pictures an admin may pick (owner's request via Garance, 2026-11-21: "up to 3 references in all,
 * counting the character sheet pictures"): the edit models take three pictures in all (IMAGES.maxReferences), so an
 * added picture takes 3 minus its sheets, and a redo 2, since the picture shown before is always its first.
 */
export const pickLimit = (max: number, mode: 'add' | 'redo', sheets: number) => Math.max(0, mode === 'redo' ? max - 1 : max - sheets);

/**
 * Neither closed model is offered here (the country rule, src/lib/images/countries.ts): the sheets' Model row then says
 * so in one line, "GPT Image and Gemini aren’t offered where you are." (owner, 2026-11-21; DRAFT).
 */
export const noClosedOffered = (list: readonly { open: boolean }[] | null | undefined) => Boolean(list?.length) && !list!.some((x) => !x.open);

/** "@garance's Zei remix and Bai sheet": a maker's possessive (a wallet's short address and "FID 12" too). */
const possessive = (by: string) => `${by}’s`;
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * The caption's credit for the pictures a chapter picture was made after (owner's request via Garance, 2026-11-21:
 * "after @name's …"). DRAFT wording (coding agent): each maker once, in the order their pictures were sent, with what
 * of theirs went in: "after @garance’s Zei remix", "after @garance’s Zei remix and Bai sheet", "after @garance’s Zei
 * remix, @naaate’s Bai base and FID 12’s picture"; with a group of two before the last, ", and" keeps the groups
 * apart ("after @garance’s Zei remix and Bai sheet, and @naaate’s Zei base"). A picture hidden since says only that:
 * "a picture since hidden", with no name (as a remix whose source was hidden, decision 16). Empty when there are none.
 */
export function creditLine(credits: RefCredit[]): string {
  if (!credits.length) return '';
  const groups: { by: string | null; whats: string[] }[] = [];
  for (const c of credits) {
    const by = c.hidden ? null : c.by;
    const g = groups.find((x) => x.by === by);
    if (g) g.whats.push(c.what);
    else groups.push({ by, whats: [c.what] });
  }
  const parts = groups.map((g) => (g.by === null ? (g.whats.length === 1 ? 'a picture since hidden' : `${g.whats.length === 2 ? 'two' : 'three'} pictures since hidden`) : `${possessive(g.by)} ${joinAnd(g.whats)}`));
  const several = groups.slice(0, -1).some((g) => g.by !== null && g.whats.length > 1);
  return `after ${parts.length > 1 && several ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : joinAnd(parts)}`;
}

/**
 * A snowmoon.party link (or path) to a published picture's page, as an admin pastes it, read to the version it names:
 * /challenge/p/<id> (a remix), /image/<id> (a reader's picture), /references/designs/<id> (a sheet or a base), and
 * /challenge/make?from=<id> (a base's or a remix's "Remix" link). Anything else, another site's address included, is
 * null. Pure; the server looks the version up and refuses it unless it is published (resolveReference).
 */
export const REF_HOSTS = ['snowmoon.party', 'www.snowmoon.party'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseRefLink(raw: unknown, hosts: readonly string[] = REF_HOSTS): { id: string; page: 'remix' | 'image' | 'design' | 'make' } | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > 500) return null;
  let u: URL;
  try {
    u = t.startsWith('/') ? new URL(t, 'https://snowmoon.party') : new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(u.protocol) || !hosts.includes(u.hostname.toLowerCase())) return null;
  const path = u.pathname.replace(/\/+$/, '');
  const m = /^\/(challenge\/p|image|references\/designs)\/([^/]+)$/.exec(path);
  if (m && UUID_RE.test(m[2])) return { id: m[2].toLowerCase(), page: m[1] === 'challenge/p' ? 'remix' : m[1] === 'image' ? 'image' : 'design' };
  const from = u.searchParams.get('from') ?? '';
  if (path === '/challenge/make' && UUID_RE.test(from)) return { id: from.toLowerCase(), page: 'make' };
  return null;
}

/**
 * The no-names rule for a look (owner, 2026-11-18: no artist, studio or film names), checked when a style is listed and
 * when it is saved, before the site's prompt check runs on the whole prompt at Make: the same list the published
 * styles' own check uses (scripts/lib/publish-style.ts NAMES; scripts/test-chapter-references.ts keeps the two equal).
 */
export const LOOK_NAMES = /\b(studio ghibli|ghibli|disney|pixar|dreamworks|marvel|dc comics|in the style of|kirby|lichtenstein|moebius|herg[ée]|miyazaki|blade runner|star wars)\b/i;
export const namesAWork = (text: string): string | null => LOOK_NAMES.exec(text)?.[0] ?? null;

/**
 * The public recipe with each reference hidden since taken out (P5f: hides win; decision 16): its kind and sha256
 * stay, so the record still says a picture went in, but not whose, what, its page or its address.
 */
export function withoutHidden(recipe: PictureRecipe, published: (versionId: string) => boolean): PictureRecipe {
  const picked = recipe.picked?.map((x) => (published(x.versionId) ? x : ({ kind: x.kind, hidden: true, sha256: x.sha256 } as unknown as PickedRef)));
  const references = recipe.references?.map((x) => (published(x.versionId) ? x : ({ kind: 'sheet', hidden: true, sha256: x.sha256 } as unknown as NonNullable<PictureRecipe['references']>[number])));
  return { ...recipe, ...(picked ? { picked } : {}), ...(references ? { references } : {}) };
}

/** The look as a recipe or a page says it: the style's name, or "a written line". */
export const lookName = (l: Look | null) =>
  !l ? 'none' : l.kind === 'style' ? `${l.label}${l.versionNo ? `, version ${l.versionNo}` : ''}${l.by ? `, by ${l.by}` : ''}` : 'a line written by an admin';

/** "@garance" when the handle is known, "FID 193912" otherwise. */
export const adminName = (fid: number, handle: string | null) => (handle ? `@${handle}` : `FID ${fid}`);

/**
 * A date as the pages write it ("18 Nov 2026"). day(): in UTC, the stable form the server writes and the browser's
 * first render repeats. localDay(): in the reader's own time zone (or the one given, for tests), which the browser
 * writes once it has mounted (src/components/local-date.tsx; owner, 2026-11-18).
 */
export const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const localDay = (iso: string, timeZone?: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(timeZone ? { timeZone } : {}) });

/** ", after @naaate’s Zei remix" when the picture was made after others' pictures (2026-11-21); nothing otherwise. */
const after = (r: Pick<ShownReplacement, 'credits'>) => (r.credits?.length ? `, ${creditLine(r.credits)}` : '');
/** The caption's words under a replaced picture, before its date ("Redone by @garance"). DRAFT wording. */
export const replacedBy = (r: Pick<ShownReplacement, 'byFid' | 'byHandle' | 'credits'>) => `Redone by ${adminName(r.byFid, r.byHandle)}${after(r)}`;
/** The same for a picture an admin added ("Added by @garance", "Added by @garance, after @naaate’s Zei remix"). DRAFT wording (2026-11-19/21). */
export const addedBy = (r: Pick<ShownReplacement, 'byFid' | 'byHandle' | 'credits'>) => `Added by ${adminName(r.byFid, r.byHandle)}${after(r)}`;

/**
 * The line a quote card's image carries under a redone or added picture: "IMAGE ADDED BY @GARANCE · 21 NOV 2026 · GPT
 * IMAGE 2.5 SUNBURST, A CLOSED MODEL BY OPENAI". The card is one picture for every reader, so the date is UTC's
 * (src/app/api/card/[n]/[range]/route.tsx). DRAFT wording (coding agent, 2026-11-19/21).
 */
export const cardPictureLine = (r: { by: string; at: string; model: string }) => `IMAGE ${r.by.toUpperCase()} · ${day(r.at).toUpperCase()} · ${r.model.toUpperCase()}`;

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
