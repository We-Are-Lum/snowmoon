import 'server-only';
import type postgres from 'postgres';
import { WORK_ID } from '../config';

/**
 * Readers' published images, read with the app's database role (studio_writer), so every query
 * here filters to published elements itself: hidden images and drafts never come back.
 */
type Sql = postgres.Sql;

export interface ReaderImage {
  versionId: string;
  elementId: string;
  url: string;
  sha256: string;
  chapter: number;
  start: number;
  end: number;
  byFid: number;
  createdAt: string;
  likes: number;
  userPrompt: string;
  prompt: string;
  style: { id: string; text: string } | null;
  model: string;
  modelVersion: string | null;
  host: string | null;
  seed: number | null;
  costUsd: number | null;
  requestId: string | null;
  settings: Record<string, unknown>;
  assist: unknown;
  checks: Record<string, unknown>;
  uses: string[];
  remixedFrom: string[];
}

const SELECT = (sql: Sql) => sql`
  select v.id as version_id, e.id as element_id, v.asset_url as url, v.asset_sha256 as sha256,
         a.chapter, a.start_idx, a.end_idx, e.created_by_fid as by_fid, e.created_at,
         coalesce(lt.likes, 0)::int as likes,
         r.prompt, r.model, r.model_version, r.provider, r.seed, r.cost_usd::float8 as cost_usd, r.params, r.assist,
         coalesce((select array_agg(l.to_version_id::text) from studio.links l where l.from_version_id = v.id and l.kind = 'uses'), '{}') as uses,
         coalesce((select array_agg(l.to_version_id::text) from studio.links l where l.from_version_id = v.id and l.kind = 'remixed_from'), '{}') as remixed_from
  from studio.elements e
  join studio.element_versions v on v.element_id = e.id
  join studio.anchors a on a.version_id = v.id
  join studio.recipes r on r.id = v.recipe_id
  left join studio.like_totals lt on lt.version_id = v.id
  where e.element_type = 'image' and e.status = 'published' and e.work_id = ${WORK_ID} and r.source = 'in_app'`;

function shape(r: Record<string, unknown>): ReaderImage {
  const p = (r.params ?? {}) as Record<string, unknown>;
  return {
    versionId: String(r.version_id),
    elementId: String(r.element_id),
    url: String(r.url),
    sha256: String(r.sha256),
    chapter: Number(r.chapter),
    start: Number(r.start_idx),
    end: Number(r.end_idx),
    byFid: Number(r.by_fid),
    createdAt: new Date(r.created_at as string).toISOString(),
    likes: Number(r.likes),
    userPrompt: String(p.user_prompt ?? ''),
    prompt: String(r.prompt ?? ''),
    style: (p.style as ReaderImage['style']) ?? null,
    model: String(r.model ?? ''),
    modelVersion: (r.model_version as string) ?? null,
    host: (r.provider as string) ?? null,
    seed: r.seed === null || r.seed === undefined ? null : Number(r.seed),
    costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
    requestId: (p.request_id as string) ?? null,
    settings: (p.settings as Record<string, unknown>) ?? {},
    assist: r.assist ?? null,
    checks: (p.checks as Record<string, unknown>) ?? {},
    uses: (r.uses as string[]) ?? [],
    remixedFrom: (r.remixed_from as string[]) ?? [],
  };
}

/** The feed (owner, 2026-10-08): newest first, or most liked as a labelled alternative. */
export async function feed(sql: Sql, sort: 'new' | 'liked', limit = 60): Promise<ReaderImage[]> {
  const rows = await sql`
    select * from (${SELECT(sql)}) x
    order by ${sort === 'liked' ? sql`x.likes desc, x.created_at desc` : sql`x.created_at desc`}
    limit ${limit}`;
  return rows.map(shape);
}

export async function chapterImages(sql: Sql, chapter: number): Promise<ReaderImage[]> {
  const rows = await sql`select * from (${SELECT(sql)}) x where x.chapter = ${chapter} order by x.likes desc, x.created_at desc`;
  return rows.map(shape);
}

export async function imageByVersion(sql: Sql, versionId: string): Promise<ReaderImage | null> {
  if (!/^[0-9a-f-]{36}$/.test(versionId)) return null;
  const [row] = await sql`select * from (${SELECT(sql)}) x where x.version_id = ${versionId}`;
  return row ? shape(row) : null;
}

/** The element behind a version, whatever its status (for the author's hide and unhide, and moderation). */
export async function elementOf(sql: Sql, versionId: string) {
  if (!/^[0-9a-f-]{36}$/.test(versionId)) return null;
  const [row] = await sql`
    select e.id, e.status, e.created_by_fid, v.asset_sha256 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = ${versionId} and e.element_type = 'image'`;
  return row ? { elementId: String(row.id), status: String(row.status), byFid: Number(row.created_by_fid), sha256: String(row.asset_sha256) } : null;
}

/**
 * Reported images waiting for a moderator (section 6): the latest report or rule-hide per image,
 * oldest first. Listing the queue in time order ranks nothing that readers see. Reporters' FIDs
 * are never selected: only each reason with its count, and the notes.
 */
export async function reportQueue(sql: Sql) {
  return sql`
    with last as (
      select distinct on (element_id) element_id, step, role, at from studio.removal_log
      where step in ('reported', 'hidden', 'dismissed') order by element_id, at desc)
    select e.id as element_id, e.status, e.created_by_fid, e.created_at, v.id as version_id, v.asset_sha256, v.asset_url,
           r.prompt, r.model, r.params, a.chapter, a.start_idx, a.end_idx, last.step as last_step, last.role as last_role,
           (select json_agg(json_build_object('reason', reason, 'n', n)) from (
              select reason, count(*)::int as n from studio.removal_log where element_id = e.id and step = 'reported' group by reason) x) as reasons,
           (select json_agg(note) from studio.removal_log where element_id = e.id and step = 'reported' and note is not null) as notes
    from last join studio.elements e on e.id = last.element_id
    join studio.element_versions v on v.element_id = e.id
    join studio.recipes r on r.id = v.recipe_id
    join studio.anchors a on a.version_id = v.id
    where last.step = 'reported' or (last.step = 'hidden' and last.role = 'rule')
    order by last.at
    limit 100`;
}
