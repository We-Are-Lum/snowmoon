import 'server-only';
import { cache } from 'react';
import type postgres from 'postgres';
import { db } from '../db';
import type { Look, PictureDecision, PictureRecipe, PictureVersion, ShownReplacement } from './shared';

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
  sha256: string | null; width: number | null; height: number | null; model: string | null; maker: string | null; open_weights: boolean | null; look: Look | null; note: string | null; prompt: string | null;
};

/** The latest decision per job, joined to its version: a version shown in place of the committed file, or nothing. */
export async function readReplacements(sql: Sql): Promise<Map<string, ShownReplacement>> {
  const rows = await sql<ShownRow[]>`
    select distinct on (d.job_id) d.job_id, d.chapter, d.version_id, d.public_url, d.by_fid, d.by_handle, d.decided_at,
      v.sha256, v.width, v.height, v.model, v.maker, v.open_weights, v.look, v.note, v.prompt
    from studio.chapter_picture_decisions d left join studio.chapter_picture_versions v on v.id = d.version_id
    order by d.job_id, d.decided_at desc, d.id desc`;
  const out = new Map<string, ShownReplacement>();
  for (const r of rows) {
    if (!r.version_id || !r.public_url || !r.sha256) continue;
    out.set(r.job_id, {
      versionId: r.version_id, jobId: r.job_id, chapter: r.chapter, url: r.public_url, sha256: r.sha256, width: r.width ?? 1024, height: r.height ?? 576,
      model: r.model ?? '', maker: r.maker ?? '', open: Boolean(r.open_weights), look: r.look, note: r.note ?? '', prompt: r.prompt ?? '',
      byFid: Number(r.by_fid), byHandle: r.by_handle, at: new Date(r.decided_at).toISOString(),
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
};

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
  return {
    id: v.id,
    job: v.jobId,
    chapter: v.chapter,
    url: first.publicUrl,
    recipe: v.recipe,
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
