import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import type postgres from 'postgres';
import { db } from '../db';
import { withoutHidden, type Addition, type Look, type PickedRef, type PictureDecision, type PictureRecipe, type PictureVersion, type RefCredit, type ShownReplacement } from './shared';

/**
 * Reading the edition's chapter pictures as admins left them (owner, 2026-11-18, option B; 0042_chapter_picture_versions):
 * which version each chapter picture shows, every version and decision for the review page, the looks, and the public
 * recipe of a kept version. Reads only; the writes are in ./admin.ts. Until the migration is applied (the tables
 * missing, 42P01) every chapter shows its committed file, as before.
 *
 * Caching: the chapter pages are built ahead of time (generateStaticParams, no time-based revalidation), so during a
 * build the replacements are read once per build worker, and a read that takes over 5 seconds fails the build (as the
 * seeded hides, src/lib/admin-hidden.ts). At run time a chapter page is rendered again only after a Keep or a Restore
 * revalidates it (src/app/api/you/illustrations/show/route.ts), and that render reads the database fresh: no copy is
 * kept between requests, so a page rebuilt on another server instance can't bake in an older answer.
 */
type Sql = postgres.Sql;
const BUILDING = process.env.NEXT_PHASE === 'phase-production-build';
let duringBuild: Promise<Map<string, ShownReplacement>> | null = null;
let missingUntil = 0;
const missing = (e: unknown) => (e as { code?: string })?.code === '42P01' || /does not exist/.test(String((e as Error)?.message ?? e));

/** Whether the tables exist on this database (the migration applied). */
export async function picturesReady(sql: Sql): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select to_regclass('studio.chapter_picture_decisions') is not null and to_regclass('studio.chapter_picture_looks') is not null as ok`;
  return Boolean(r?.ok);
}

type ShownRow = {
  job_id: string; chapter: number; version_id: string | null; public_url: string | null; by_fid: string; by_handle: string | null; decided_at: Date;
  sha256: string | null; width: number | null; height: number | null; model: string | null; maker: string | null; open_weights: boolean | null; look: Look | null; note: string | null; prompt: string | null; refs: unknown; picked: unknown; hidden_refs: string[] | null;
};

type SheetEntry = { sheet?: unknown; name?: unknown; versionId?: unknown; by?: unknown };
/**
 * Whose pictures a kept version was made after, for its caption (2026-11-21): its sheet pictures that record their
 * maker, then its picked references, in the order sent; `hidden` for any whose design or picture is no longer published
 * (hides win, P5f). Sheets sent before 2026-11-21 record no maker and are not credited by name here (their recipe
 * still names the sheet).
 */
function creditsOf(refs: unknown, picked: unknown, published: (id: string) => boolean): RefCredit[] {
  const sheets = (Array.isArray(refs) ? refs : []) as SheetEntry[];
  const picks = (Array.isArray(picked) ? picked : []) as Partial<PickedRef>[];
  return [
    ...sheets.filter((x) => typeof x.by === 'string' && typeof x.versionId === 'string').map((x) => ({ what: `${String(x.name)} sheet`, by: String(x.by), hidden: !published(String(x.versionId)) })),
    ...picks.filter((x) => typeof x.by === 'string' && typeof x.versionId === 'string' && typeof x.what === 'string').map((x) => ({ what: String(x.what), by: String(x.by), hidden: !published(String(x.versionId)) })),
  ];
}

/**
 * Which of these element versions are hidden or unpublished now (one read for every kept picture's references). A
 * version with no row is not counted as hidden: elements are never deleted (a removal hides), so that is only ever a
 * test's stand-in id.
 */
async function hiddenAmong(sql: Sql, ids: string[]): Promise<Set<string>> {
  const want = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).map((x) => x.toLowerCase()))];
  if (!want.length) return new Set();
  const rows = await sql<{ id: string }[]>`select v.id::text as id from studio.element_versions v join studio.elements e on e.id = v.element_id where v.id in ${sql(want)} and e.status <> 'published'`;
  return new Set(rows.map((r) => r.id));
}
/**
 * In the same read (no second query): the ids among a version's sheet references and picked references whose picture
 * or sheet is hidden or unpublished now. A version with no row is not counted (only ever a test's stand-in id).
 */
const HIDDEN_REFS = (sql: Sql) => sql`(
  select coalesce(array_agg(x->>'versionId'), '{}') from (
    select jsonb_array_elements(case when jsonb_typeof(v.recipe->'references') = 'array' then v.recipe->'references' else '[]'::jsonb end) x
    union all select jsonb_array_elements(case when jsonb_typeof(v.recipe->'picked') = 'array' then v.recipe->'picked' else '[]'::jsonb end)
  ) r(x)
  join studio.element_versions ev on ev.id::text = lower(x->>'versionId') join studio.elements e on e.id = ev.element_id
  where e.status <> 'published')`;
const idsIn = (...lists: unknown[]) => lists.flatMap((l) => (Array.isArray(l) ? l : [])).map((x) => String((x as { versionId?: unknown })?.versionId ?? '')).filter(Boolean);

/** The latest decision per job, joined to its version: a version shown in place of the committed file, or nothing. */
export async function readReplacements(sql: Sql): Promise<Map<string, ShownReplacement>> {
  const rows = await sql<ShownRow[]>`
    select distinct on (d.job_id) d.job_id, d.chapter, d.version_id, d.public_url, d.by_fid, d.by_handle, d.decided_at,
      v.sha256, v.width, v.height, v.model, v.maker, v.open_weights, v.look, v.note, v.prompt, v.recipe->'references' as refs, v.recipe->'picked' as picked,
      ${HIDDEN_REFS(sql)} as hidden_refs
    from studio.chapter_picture_decisions d left join studio.chapter_picture_versions v on v.id = d.version_id
    order by d.job_id, d.decided_at desc, d.id desc`;
  const out = new Map<string, ShownReplacement>();
  for (const r of rows) {
    if (!r.version_id || !r.public_url || !r.sha256) continue;
    const hidden = new Set((r.hidden_refs ?? []).map((x) => x.toLowerCase()));
    const credits = creditsOf(r.refs, r.picked, (id) => !hidden.has(id.toLowerCase()));
    out.set(r.job_id, {
      versionId: r.version_id, jobId: r.job_id, chapter: r.chapter, url: r.public_url, sha256: r.sha256, width: r.width ?? 1024, height: r.height ?? 576,
      model: r.model ?? '', maker: r.maker ?? '', open: Boolean(r.open_weights), look: r.look, note: r.note ?? '', prompt: r.prompt ?? '',
      byFid: Number(r.by_fid), byHandle: r.by_handle, at: new Date(r.decided_at).toISOString(),
      ...(Array.isArray(r.refs) ? { sheets: r.refs.map((x) => String((x as { sheet?: unknown })?.sheet ?? '')).filter(Boolean) } : {}),
      ...(credits.length ? { credits } : {}),
    });
  }
  return out;
}

async function read(): Promise<Map<string, ShownReplacement>> {
  const sql = db();
  if (!sql || Date.now() < missingUntil) return new Map();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error('chapter pictures: the read took over 5 s')), 5000)));
  try {
    return await Promise.race([readReplacements(sql), slow]);
  } catch (e) {
    if (missing(e)) {
      if (!BUILDING) missingUntil = Date.now() + 60_000;
      return new Map();
    }
    if (BUILDING) throw e;
    console.error('chapter pictures: not read', (e as Error).message);
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

/** The kept replacements, by job id (the committed file shows where there is none). Read once per render. */
export const shownReplacements = cache(async (): Promise<Map<string, ShownReplacement>> => {
  if (BUILDING) return (duringBuild ??= read());
  return read();
});
/** After a Keep or a Restore: a missing-table note (before the migration) is forgotten, so the next render reads again. */
export const forgetReplacements = () => {
  missingUntil = 0;
  failedUntil = 0;
  additionsFailedUntil = 0;
};

/**
 * The same answer for every other place a chapter picture shows (owner, 2026-11-18/19: a kept redo reaches the
 * introduction's cards, quote cards and their share pages, References and the design sheets, and the pick switch).
 * Those are read on almost every request (the introduction is in every page's shell), so at run time the answer is
 * kept in Next's data cache under one tag, shared by every server instance, until a Keep or a Restore revalidates the
 * tag (src/app/api/you/illustrations/show/route.ts). There is no time limit on it: nothing changes the answer except
 * those two. A failed read is never kept: it throws inside the cached function, the page shows the committed files,
 * and the database isn't asked again for 30 seconds on this instance. During a build it is the chapter pages' own
 * read (once per build worker). Outside Next (the tests) it is read directly.
 */
export const PICTURES_TAG = 'chapter-pictures';
let failedUntil = 0;
async function readOrThrow(): Promise<[string, ShownReplacement][]> {
  const sql = db();
  if (!sql) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error('chapter pictures: the read took over 5 s')), 5000)));
  try {
    return [...(await Promise.race([readReplacements(sql), slow]))];
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
const keptRead = unstable_cache(readOrThrow, ['chapter-pictures-shown-v1'], { tags: [PICTURES_TAG] });

export const replacementsEverywhere = cache(async (): Promise<Map<string, ShownReplacement>> => {
  if (BUILDING) return shownReplacements();
  if (Date.now() < failedUntil) return new Map();
  try {
    return new Map(await keptRead().catch((e) => (/incrementalCache missing/.test(String((e as Error)?.message ?? e)) ? readOrThrow() : Promise.reject(e))));
  } catch (e) {
    failedUntil = Date.now() + 30_000;
    console.error('chapter pictures: not read', (e as Error).message);
    return new Map();
  }
});

type VersionRow = {
  id: string; job_id: string; chapter: number; made_by_fid: string; made_at: Date; model: string; maker: string; open_weights: boolean;
  look: Look | null; note: string; prompt: string; sha256: string; width: number; height: number; cost_usd: string | null; recipe: PictureRecipe;
};
const asVersion = (r: VersionRow): PictureVersion => ({
  id: r.id, jobId: r.job_id, chapter: r.chapter, madeByFid: Number(r.made_by_fid), madeAt: new Date(r.made_at).toISOString(), model: r.model, maker: r.maker,
  open: r.open_weights, look: r.look, note: r.note, prompt: r.prompt, sha256: r.sha256, width: r.width, height: r.height,
  costUsd: r.cost_usd === null ? null : Number(r.cost_usd), recipe: r.recipe,
});
type DecisionRow = { id: string; job_id: string; chapter: number; version_id: string | null; action: 'keep' | 'restore'; public_url: string | null; by_fid: string; by_handle: string | null; decided_at: Date };
const asDecision = (r: DecisionRow): PictureDecision => ({
  id: Number(r.id), jobId: r.job_id, chapter: r.chapter, versionId: r.version_id, action: r.action, publicUrl: r.public_url, byFid: Number(r.by_fid), byHandle: r.by_handle, at: new Date(r.decided_at).toISOString(),
});
const VERSION_COLUMNS = (sql: Sql) => sql`id, job_id, chapter, made_by_fid, made_at, model, maker, open_weights, look, note, prompt, sha256, width, height, cost_usd, recipe`;

/** For the review page: every version (newest first) and every decision (newest first), by job. */
export async function pictureHistory(sql: Sql): Promise<{ versions: Map<string, PictureVersion[]>; decisions: Map<string, PictureDecision[]> }> {
  const versions = new Map<string, PictureVersion[]>();
  const decisions = new Map<string, PictureDecision[]>();
  const vs = await sql<VersionRow[]>`select ${VERSION_COLUMNS(sql)} from studio.chapter_picture_versions order by made_at desc`;
  for (const v of vs) versions.set(v.job_id, [...(versions.get(v.job_id) ?? []), asVersion(v)]);
  const ds = await sql<DecisionRow[]>`select id, job_id, chapter, version_id, action, public_url, by_fid, by_handle, decided_at from studio.chapter_picture_decisions order by decided_at desc, id desc`;
  for (const d of ds) decisions.set(d.job_id, [...(decisions.get(d.job_id) ?? []), asDecision(d)]);
  return { versions, decisions };
}

/** One version, without its bytes; null when there is none. */
export async function pictureVersion(sql: Sql, id: string): Promise<PictureVersion | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [r] = await sql<VersionRow[]>`select ${VERSION_COLUMNS(sql)} from studio.chapter_picture_versions where id = ${id}`;
  return r ? asVersion(r) : null;
}

/** A version's JPEG (a draft's only copy), for the admins' draft route. */
export async function pictureBytes(sql: Sql, id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [r] = await sql<{ jpeg: Buffer }[]>`select jpeg from studio.chapter_picture_versions where id = ${id}`;
  return r ? Buffer.from(r.jpeg) : null;
}

/** The first time a version was kept, with who and where; null while it has never been kept (a draft). */
export async function firstKeep(sql: Sql, versionId: string): Promise<PictureDecision | null> {
  const [r] = await sql<DecisionRow[]>`select id, job_id, chapter, version_id, action, public_url, by_fid, by_handle, decided_at from studio.chapter_picture_decisions
    where version_id = ${versionId} order by decided_at, id limit 1`;
  return r ? asDecision(r) : null;
}

/**
 * The public recipe of a version, only once an admin has kept it (a draft answers nothing, so its existence isn't
 * public either). Every decision about its chapter picture comes with it, so anyone can see who showed what and when.
 */
export async function publicRecipe(sql: Sql, versionId: string) {
  const v = await pictureVersion(sql, versionId);
  if (!v) return null;
  const first = await firstKeep(sql, versionId);
  if (!first) return null;
  const ds = await sql<DecisionRow[]>`select id, job_id, chapter, version_id, action, public_url, by_fid, by_handle, decided_at from studio.chapter_picture_decisions
    where job_id = ${v.jobId} order by decided_at, id`;
  // A reference hidden since is named nowhere public (P5f; decision 16): only its kind and sha256 stay.
  const hidden = await hiddenAmong(sql, idsIn(v.recipe?.references, v.recipe?.picked));
  return {
    id: v.id,
    job: v.jobId,
    chapter: v.chapter,
    url: first.publicUrl,
    recipe: withoutHidden(v.recipe, (id) => !hidden.has(id.toLowerCase())),
    model: { id: v.model, maker: v.maker, open: v.open },
    look: v.look,
    note: v.note,
    published_by: { fid: first.byFid, handle: first.byHandle, role: 'admin', action: 'keep', at: first.at },
    history: ds.map(asDecision).map((d) => ({ action: d.action, version: d.versionId ?? 'the committed file', by_fid: d.byFid, by_handle: d.byHandle, at: d.at })),
    licence: 'GPL-3.0',
    note_on_ai: 'AI-generated; not by the author of Snowmoon.',
  };
}

type LookRow = { chapter: number | null; look: Look | null; by_fid: string; set_at: Date };
export interface Looks {
  all: { look: Look; byFid: number; at: string } | null;
  chapters: Record<number, { look: Look | null; byFid: number; at: string }>;
}
/** The latest look for every chapter (chapter null) and each chapter's own, if it has one. */
export async function latestLooks(sql: Sql): Promise<Looks> {
  const rows = await sql<LookRow[]>`select distinct on (coalesce(chapter, 0)) chapter, look, by_fid, set_at from studio.chapter_picture_looks order by coalesce(chapter, 0), set_at desc, id desc`;
  const out: Looks = { all: null, chapters: {} };
  for (const r of rows) {
    const x = { byFid: Number(r.by_fid), at: new Date(r.set_at).toISOString() };
    if (r.chapter === null) out.all = r.look ? { look: r.look, ...x } : null;
    else out.chapters[r.chapter] = { look: r.look, ...x };
  }
  return out;
}

/** The look a redo in this chapter uses: the chapter's own, else every chapter's, else none. */
export const lookFor = (looks: Looks, chapter: number): Look | null => (looks.chapters[chapter] ? looks.chapters[chapter].look : null) ?? looks.all?.look ?? null;

/**
 * Pictures an admin added to the edition's chapters (owner, 2026-11-19; 0043_chapter_picture_additions): where each sits.
 * Whether one shows, and which picture, is the latest decision for its id, read with the replacements above. Until the
 * migration is applied (the table missing) there are none, and the chapter pages show what they showed before.
 */
export async function additionsReady(sql: Sql): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select to_regclass('studio.chapter_picture_additions') is not null as ok`;
  return Boolean(r?.ok);
}

type AdditionRow = { job_id: string; chapter: number; after_idx: number; start_idx: number; end_idx: number; by_fid: string; added_at: Date };
export async function readAdditions(sql: Sql, chapter?: number): Promise<Addition[]> {
  if (!(await additionsReady(sql))) return [];
  const rows = chapter === undefined
    ? await sql<AdditionRow[]>`select job_id, chapter, after_idx, start_idx, end_idx, by_fid, added_at from studio.chapter_picture_additions order by chapter, after_idx, added_at`
    : await sql<AdditionRow[]>`select job_id, chapter, after_idx, start_idx, end_idx, by_fid, added_at from studio.chapter_picture_additions where chapter = ${chapter} order by after_idx, added_at`;
  return rows.map((r) => ({ jobId: r.job_id, chapter: r.chapter, after: r.after_idx, start: r.start_idx, end: r.end_idx, byFid: Number(r.by_fid), at: new Date(r.added_at).toISOString() }));
}

export async function readAddition(sql: Sql, jobId: string): Promise<Addition | null> {
  if (!(await additionsReady(sql))) return null;
  const [r] = await sql<AdditionRow[]>`select job_id, chapter, after_idx, start_idx, end_idx, by_fid, added_at from studio.chapter_picture_additions where job_id = ${jobId}`;
  return r ? { jobId: r.job_id, chapter: r.chapter, after: r.after_idx, start: r.start_idx, end: r.end_idx, byFid: Number(r.by_fid), at: new Date(r.added_at).toISOString() } : null;
}

let additionsDuringBuild: Promise<Addition[]> | null = null;
async function additionsOrNone(): Promise<Addition[]> {
  const sql = db();
  if (!sql) return [];
  try {
    return await readAdditions(sql);
  } catch (e) {
    if (missing(e)) return [];
    if (BUILDING) throw e;
    console.error('chapter pictures: additions not read', (e as Error).message);
    return [];
  }
}
/** Every added picture's place, for the chapter pages: once per build worker at build, fresh on each render after. */
export const shownAdditions = cache(async (): Promise<Addition[]> => (BUILDING ? (additionsDuringBuild ??= additionsOrNone()) : additionsOrNone()));

/**
 * Every added picture's place, for the other places a kept one now shows (owner, 2026-11-21: quote cards, References and
 * the sheets, the pick switch): read through the same tag as replacementsEverywhere, so a Keep, a take-off or a
 * show-again (all decisions, src/app/api/you/illustrations/show/route.ts) reaches them at once. Where an addition sits
 * never changes once written (0043 is insert-only, written at the first draft, which shows nowhere), so the decisions'
 * revalidation is the only one these need. A failed read is never kept: the pages show no added picture for 30 seconds
 * on this instance, and the edition's committed pictures as before. During a build it is the chapter pages' own read.
 */
let additionsFailedUntil = 0;
async function additionsOrThrow(): Promise<Addition[]> {
  const sql = db();
  if (!sql) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error('chapter pictures: the additions read took over 5 s')), 5000)));
  try {
    return await Promise.race([readAdditions(sql), slow]);
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
const keptAdditions = unstable_cache(additionsOrThrow, ['chapter-pictures-additions-v1'], { tags: [PICTURES_TAG] });

export const additionsEverywhere = cache(async (): Promise<Addition[]> => {
  if (BUILDING) return shownAdditions();
  if (Date.now() < additionsFailedUntil) return [];
  try {
    return await keptAdditions().catch((e) => (/incrementalCache missing/.test(String((e as Error)?.message ?? e)) ? additionsOrThrow() : Promise.reject(e)));
  } catch (e) {
    additionsFailedUntil = Date.now() + 30_000;
    console.error('chapter pictures: additions not read', (e as Error).message);
    return [];
  }
});
