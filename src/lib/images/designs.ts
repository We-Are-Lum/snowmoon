import 'server-only';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { WORK_ID } from '../config';
import type { DesignBody, DesignPicture } from '../element-body';
import { IMAGE_WORDING } from './wording';

/**
 * Styles and character sheets (step 4, docs/proposals/style-guides-and-sheets.md), on the tables
 * that exist; no migration:
 * - a style is a studio.entities row of kind 'style' (its name, unique per work); a character is
 *   a kind 'character' row for one of the book's characters (content/snowmoon/designs/characters),
 *   made when its first sheet is published, never named by a reader;
 * - a design is a studio.elements row (element_type 'design') on that entity, by the FID that made
 *   it; each version an element_versions row whose body is DesignBody (title, text, samples, views);
 * - a fork is a new design element on the same entity whose v1 has a 'remixed_from' link to the
 *   version it came from (links are append-only, so the credit stays);
 * - "built on by n" counts published images whose version has a 'uses' link to any version of the
 *   design (images only, from published work; never picks);
 * - picks (studio.picks, one per person per entity) are read and written here only for the
 *   signed-in FID, never listed, joined or counted for anyone else.
 * Read with the app's role (studio_writer), so every public query filters to published work itself.
 */
type Sql = postgres.Sql;
export type DesignKind = 'style' | 'character';
export type DesignOrder = 'new' | 'built';

export interface DesignRow {
  elementId: string;
  versionId: string;
  versionNo: number;
  versions: number;
  entityId: string;
  entity: string;
  kind: DesignKind;
  title: string;
  text: string;
  byFid: number;
  byName: string | null;
  createdAt: string;
  updatedAt: string;
  builtOn: number;
  thumb: string | null;
  assist: DesignBody['assist'];
  /**
   * The credit a fork carries, for good. When the source was hidden since, only that it was a remix
   * (decision 16, 2026-10-09): no name, maker or link.
   */
  remixedFrom:
    | { hidden: false; versionId: string; title: string; entity: string; byFid: number; byName: string | null; byRole: DesignBody['role']; versionNo: number }
    | { hidden: true }
    | null;
  /** 'maintainer' for the project's starting style, published by the maintainer (decision 13). */
  byRole: DesignBody['role'];
}

const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);

/** Built on: published images whose version 'uses' any version of the design element e. */
const BUILT_ON = (sql: Sql) => sql`(
  select count(distinct l.from_version_id)::int from studio.links l
  join studio.element_versions tv on tv.id = l.to_version_id
  join studio.element_versions fv on fv.id = l.from_version_id
  join studio.elements fe on fe.id = fv.element_id
  where l.kind = 'uses' and tv.element_id = e.id and fe.element_type = 'image' and fe.status = 'published')`;

/** Each published design with its newest version, the credit it carries, and its built-on count. */
const ROWS = (sql: Sql) => sql`
  select e.id as element_id, e.entity_id, e.created_by_fid, e.created_at, en.kind, en.name as entity,
         v.id as version_id, v.version_no, v.body, v.created_at as updated_at,
         (select count(*)::int from studio.element_versions vv where vv.element_id = e.id) as versions,
         ${BUILT_ON(sql)} as built_on,
         (select json_build_object('version_id', sv.id, 'body', sv.body, 'version_no', sv.version_no, 'by_fid', se.created_by_fid, 'entity', sen.name, 'status', se.status)
            from studio.element_versions fv0 join studio.links l0 on l0.from_version_id = fv0.id and l0.kind = 'remixed_from'
            join studio.element_versions sv on sv.id = l0.to_version_id
            join studio.elements se on se.id = sv.element_id
            join studio.entities sen on sen.id = se.entity_id
            where fv0.element_id = e.id order by fv0.version_no limit 1) as remixed_from
  from studio.elements e
  join studio.entities en on en.id = e.entity_id
  join lateral (select * from studio.element_versions v where v.element_id = e.id order by v.version_no desc limit 1) v on true
  where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID}`;

const bodyOf = (b: unknown): DesignBody => {
  const o = (b ?? {}) as Partial<DesignBody> & { description?: string };
  return { title: o.title ?? '', text: o.text ?? o.description ?? '', samples: o.samples ?? [], views: o.views ?? {}, by_name: o.by_name ?? null, by_name_source: o.by_name_source ?? null, assist: o.assist ?? null, role: o.role ?? null };
};

function shape(r: Record<string, unknown>): DesignRow {
  const b = bodyOf(r.body);
  const rf = r.remixed_from as { version_id: string; body: unknown; version_no: number; by_fid: number; entity: string; status: string } | null;
  const rb = rf ? bodyOf(rf.body) : null;
  return {
    elementId: String(r.element_id),
    versionId: String(r.version_id),
    versionNo: Number(r.version_no),
    versions: Number(r.versions),
    entityId: String(r.entity_id),
    entity: String(r.entity),
    kind: r.kind as DesignKind,
    title: b.title,
    text: b.text,
    byFid: Number(r.created_by_fid),
    byName: b.by_name,
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    builtOn: Number(r.built_on),
    thumb: b.samples[0]?.url ?? b.views.front?.url ?? null,
    assist: b.assist,
    byRole: b.role,
    remixedFrom: !rf || !rb
      ? null
      : rf.status !== 'published'
        ? { hidden: true }
        : { hidden: false, versionId: String(rf.version_id), title: rb.title, entity: rf.entity, byFid: Number(rf.by_fid), byName: rb.by_name, byRole: rb.role, versionNo: Number(rf.version_no) },
  };
}

/** The order is always named on the screen: newest first (default) or most built on. */
const ORDER = (sql: Sql, order: DesignOrder) => (order === 'built' ? sql`x.built_on desc, x.updated_at desc` : sql`x.updated_at desc`);

export async function listDesigns(sql: Sql, kind: DesignKind, order: DesignOrder = 'new', entityId?: string): Promise<DesignRow[]> {
  if (entityId !== undefined && !isId(entityId)) return [];
  const rows = await sql`
    select * from (${ROWS(sql)}) x
    where x.kind = ${kind} ${entityId ? sql`and x.entity_id = ${entityId}` : sql``}
    order by ${ORDER(sql, order)}
    limit 200`;
  return rows.map(shape);
}

export interface DesignVersion {
  versionId: string;
  versionNo: number;
  createdAt: string;
  builtOn: number;
}
export interface DesignPage extends DesignRow {
  /** The version this page shows (any version of the design, not only the newest). */
  shown: { versionId: string; versionNo: number; createdAt: string; body: DesignBody };
  history: DesignVersion[];
}

/** A published design at one of its versions, with its version list (newest first). */
export async function designByVersion(sql: Sql, versionId: string): Promise<DesignPage | null> {
  if (!isId(versionId)) return null;
  const [v] = await sql`select v.id, v.element_id, v.version_no, v.body, v.created_at from studio.element_versions v
    join studio.elements e on e.id = v.element_id where v.id = ${versionId} and e.element_type = 'design' and e.status = 'published'`;
  if (!v) return null;
  const [row] = await sql`select * from (${ROWS(sql)}) x where x.element_id = ${v.element_id}`;
  if (!row) return null;
  const history = await sql`
    select v.id, v.version_no, v.created_at,
      (select count(distinct l.from_version_id)::int from studio.links l
        join studio.element_versions fv on fv.id = l.from_version_id join studio.elements fe on fe.id = fv.element_id
        where l.kind = 'uses' and l.to_version_id = v.id and fe.element_type = 'image' and fe.status = 'published') as built_on
    from studio.element_versions v where v.element_id = ${v.element_id} order by v.version_no desc`;
  return {
    ...shape(row),
    shown: { versionId: String(v.id), versionNo: Number(v.version_no), createdAt: new Date(v.created_at).toISOString(), body: bodyOf(v.body) },
    history: history.map((h) => ({ versionId: String(h.id), versionNo: Number(h.version_no), createdAt: new Date(h.created_at).toISOString(), builtOn: Number(h.built_on) })),
  };
}

/** Published images built on a design (any version), newest first, for "See them". */
export async function imagesBuiltOn(sql: Sql, elementId: string, limit = 24): Promise<{ versionId: string; url: string; chapter: number }[]> {
  if (!isId(elementId)) return [];
  const rows = await sql`
    select distinct on (fv.id) fv.id, fv.asset_url, a.chapter, fe.created_at from studio.links l
    join studio.element_versions tv on tv.id = l.to_version_id
    join studio.element_versions fv on fv.id = l.from_version_id
    join studio.elements fe on fe.id = fv.element_id
    join studio.anchors a on a.version_id = fv.id
    where l.kind = 'uses' and tv.element_id = ${elementId} and fe.element_type = 'image' and fe.status = 'published'`;
  return rows
    .map((r) => ({ versionId: String(r.id), url: String(r.asset_url), chapter: Number(r.chapter), at: new Date(r.created_at).getTime() }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ versionId, url, chapter }) => ({ versionId, url, chapter }));
}

// ---------------------------------------------------------------------------------------------
// The book's characters (content/snowmoon/designs/characters): names and the book's own words.
// ---------------------------------------------------------------------------------------------
export interface BookCharacter {
  slug: string;
  name: string;
  setting: string | null;
  /** The chapter in which the book first names them (for covering spoilers). */
  firstChapter: number;
  /** The book's own words about them, each with where it is. */
  quotes: { chapter: number; idx: number; quote: string }[];
}

let characters: BookCharacter[] | null = null;
export function bookCharacters(): BookCharacter[] {
  if (characters) return characters;
  const dir = path.join(process.cwd(), 'content/snowmoon/designs/characters');
  characters = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { slug: string; name: string; setting?: string; facts?: { chapter: number; idx: number; quote: string }[]; first_appearance?: { chapter: number; idx: number } })
    .map((c) => {
      const quotes = (c.facts ?? []).map((q) => ({ chapter: q.chapter, idx: q.idx, quote: q.quote })).sort((a, b) => a.chapter - b.chapter || a.idx - b.idx);
      // Where the book first names them (scripts/first-appearances.ts, decision 19); the earliest fact only as a fallback.
      return { slug: c.slug, name: c.name, setting: c.setting ?? null, firstChapter: c.first_appearance?.chapter ?? quotes[0]?.chapter ?? 1, quotes };
    })
    .sort((a, b) => a.firstChapter - b.firstChapter || a.name.localeCompare(b.name));
  return characters;
}

export const bookCharacter = (slug: string) => bookCharacters().find((c) => c.slug === slug) ?? null;

/** The character's entity row, if one exists yet (one is made with its first sheet). */
export async function characterEntity(sql: Sql, c: BookCharacter): Promise<string | null> {
  const [r] = await sql`select id from studio.entities where work_id = ${WORK_ID} and kind = 'character' and name = ${c.name}`;
  return r ? String(r.id) : null;
}

/** Published sheets per character entity name (a count of published work; never of picks). */
export async function sheetCounts(sql: Sql): Promise<Map<string, number>> {
  const rows = await sql`select en.name, count(*)::int as n from studio.elements e join studio.entities en on en.id = e.entity_id
    where e.element_type = 'design' and e.status = 'published' and en.kind = 'character' and e.work_id = ${WORK_ID} group by en.name`;
  return new Map(rows.map((r) => [String(r.name), Number(r.n)]));
}

// ---------------------------------------------------------------------------------------------
// Making a design: a new style, a new sheet, a fork, or a new version of your own.
// ---------------------------------------------------------------------------------------------
export type MakeMode = 'create' | 'fork' | 'version';
export interface MakeInput {
  fid: number;
  mode: MakeMode;
  kind: DesignKind;
  /** create a style: its name (a new entity). */
  styleName?: string;
  /** create a sheet: the book character. */
  character?: BookCharacter;
  /** fork: the version it comes from. version: a version of your own design. */
  fromVersionId?: string;
  body: DesignBody;
}
export const CHARACTER_NAME_REFUSAL = IMAGE_WORDING.designs.form.characterName;
export class MakeRefused extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Designs (new ones and new versions) this person published today, UTC. */
export async function designPublishesToday(sql: Sql, fid: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.element_versions v join studio.elements e on e.id = v.element_id
    where e.element_type = 'design' and e.created_by_fid = ${fid} and v.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return Number(r?.n ?? 0);
}

/** Is a style name free? Names are compared without case, so "Kalimar Paper" and "kalimar paper" can't both exist. */
export async function styleNameTaken(sql: Sql, name: string): Promise<boolean> {
  const [r] = await sql`select 1 from studio.entities where work_id = ${WORK_ID} and kind = 'style' and lower(name) = lower(${name.trim()}) limit 1`;
  return Boolean(r);
}

/**
 * A style may not be named like one of the book's characters (decision 12, 2026-10-09): their full
 * name, or a word they are called by ("Zei", "Lektor"), ignoring case.
 */
export function characterNameClash(name: string): BookCharacter | null {
  const n = name.trim().toLowerCase();
  return bookCharacters().find((c) => c.name.toLowerCase() === n || c.name.split(/\s+/).some((w) => w.toLowerCase() === n && !/^(lord|lady|general|senator)$/.test(n))) ?? null;
}

export async function makeDesign(sql: Sql, m: MakeInput): Promise<{ versionId: string; elementId: string }> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    let entityId: string;
    let elementId: string | null = null;
    let versionNo = 1;
    let remixFrom: string | null = null;
    if (m.mode === 'create' && m.kind === 'style') {
      const name = (m.styleName ?? '').trim();
      if (!name) throw new MakeRefused(400, 'Give the style a name');
      if (await styleNameTaken(t, name)) throw new MakeRefused(409, 'A style with this name already exists. Fork it, or choose another name.');
      if (characterNameClash(name)) throw new MakeRefused(409, CHARACTER_NAME_REFUSAL);
      const [en] = await t`insert into studio.entities ${t({ work_id: WORK_ID, kind: 'style', name })} returning id`;
      entityId = String(en.id);
    } else if (m.mode === 'create' && m.kind === 'character') {
      if (!m.character) throw new MakeRefused(400, 'Choose one of the book’s characters');
      const [found] = await t`select id from studio.entities where work_id = ${WORK_ID} and kind = 'character' and name = ${m.character.name}`;
      entityId = found
        ? String(found.id)
        : String((await t`insert into studio.entities ${t({ work_id: WORK_ID, kind: 'character', name: m.character.name, setting: m.character.setting, first_chapter: m.character.firstChapter })} returning id`)[0].id);
    } else {
      if (!isId(m.fromVersionId)) throw new MakeRefused(400, 'No such design');
      const [src] = await t`select v.id, v.element_id, e.entity_id, e.created_by_fid, en.kind from studio.element_versions v
        join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
        where v.id = ${m.fromVersionId} and e.element_type = 'design' and e.status = 'published'`;
      if (!src || src.kind !== m.kind) throw new MakeRefused(404, 'No such design');
      entityId = String(src.entity_id);
      if (m.mode === 'fork') remixFrom = String(src.id);
      else {
        if (Number(src.created_by_fid) !== m.fid) throw new MakeRefused(403, 'Only its maker can add a version. Fork it to make your own.');
        elementId = String(src.element_id);
        const [mx] = await t`select max(version_no)::int as n from studio.element_versions where element_id = ${elementId}`;
        versionNo = Number(mx.n) + 1;
      }
    }
    if (!elementId) {
      const [el] = await t`insert into studio.elements ${t({ work_id: WORK_ID, element_type: 'design', entity_id: entityId, created_by_fid: m.fid })} returning id`;
      elementId = String(el.id);
    }
    const [v] = await t`insert into studio.element_versions ${t({ element_id: elementId, version_no: versionNo, body: t.json(m.body as never) })} returning id`;
    if (remixFrom) await t`insert into studio.links ${t({ from_version_id: v.id, to_version_id: remixFrom, kind: 'remixed_from' })}`;
    return { versionId: String(v.id), elementId };
  });
}

// ---------------------------------------------------------------------------------------------
// Picks: private. Only ever for the FID that is signed in; never listed for anyone else, never counted.
// ---------------------------------------------------------------------------------------------
export interface MyPick {
  entityId: string;
  kind: DesignKind;
  entity: string;
  versionId: string;
  versionNo: number;
  elementId: string;
  title: string;
  text: string;
  byFid: number;
  byName: string | null;
  pickedAt: string;
  /** False when the design was hidden since: it is no longer offered or added. */
  available: boolean;
  /** The design's newest published version, when newer than the pick (offered, never applied). */
  newer: { versionId: string; versionNo: number; createdAt: string } | null;
  thumb: string | null;
  views: DesignBody['views'];
  samples: DesignPicture[];
  assist: DesignBody['assist'];
  byRole: DesignBody['role'];
}

export async function myPicks(sql: Sql, fid: number): Promise<MyPick[]> {
  const rows = await sql`
    select p.entity_id, p.version_id, p.picked_at, en.kind, en.name as entity, v.version_no, v.body, e.id as element_id, e.created_by_fid, e.status,
      (select json_build_object('id', nv.id, 'no', nv.version_no, 'at', nv.created_at) from studio.element_versions nv
         where nv.element_id = e.id and nv.version_no > v.version_no order by nv.version_no desc limit 1) as newer
    from studio.picks p
    join studio.entities en on en.id = p.entity_id
    join studio.element_versions v on v.id = p.version_id
    join studio.elements e on e.id = v.element_id
    where p.fid = ${fid}
    order by p.picked_at desc`;
  return rows.map((r) => {
    const b = bodyOf(r.body);
    const nw = r.newer as { id: string; no: number; at: string } | null;
    return {
      entityId: String(r.entity_id),
      kind: r.kind as DesignKind,
      entity: String(r.entity),
      versionId: String(r.version_id),
      versionNo: Number(r.version_no),
      elementId: String(r.element_id),
      title: b.title,
      text: b.text,
      byFid: Number(r.created_by_fid),
      byName: b.by_name,
      pickedAt: new Date(r.picked_at).toISOString(),
      available: r.status === 'published',
      newer: nw && r.status === 'published' ? { versionId: String(nw.id), versionNo: Number(nw.no), createdAt: new Date(nw.at).toISOString() } : null,
      thumb: b.samples[0]?.url ?? b.views.front?.url ?? null,
      views: b.views,
      samples: b.samples,
      assist: b.assist,
      byRole: b.role,
    };
  });
}

/** "Use as my …": this version becomes the person's pick for its entity (one per entity; a new one replaces it). */
export async function setPick(sql: Sql, fid: number, versionId: string): Promise<{ entityId: string } | null> {
  if (!isId(versionId)) return null;
  const [v] = await sql`select e.entity_id from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = ${versionId} and e.element_type = 'design' and e.status = 'published'`;
  if (!v) return null;
  await sql`insert into studio.picks ${sql({ fid, entity_id: v.entity_id, version_id: versionId })}
    on conflict (fid, entity_id) do update set version_id = excluded.version_id, picked_at = now()`;
  return { entityId: String(v.entity_id) };
}

export async function clearPick(sql: Sql, fid: number, entityId: string): Promise<void> {
  if (!isId(entityId)) return;
  await sql`delete from studio.picks where fid = ${fid} and entity_id = ${entityId}`;
}

/**
 * The person's picks the composer offers (decision 3, 2026-10-09): every picked style, newest pick
 * first (that one is chosen to start with, for this image only), and each picked character.
 * Hidden ones drop out.
 */
export function composerPicks(picks: MyPick[]): { styles: MyPick[]; characters: MyPick[] } {
  const live = picks.filter((p) => p.available);
  return { styles: live.filter((p) => p.kind === 'style'), characters: live.filter((p) => p.kind === 'character') };
}

// ---------------------------------------------------------------------------------------------
// Hiding and reports: a design is hidden like an image (its files leave the public bucket).
// ---------------------------------------------------------------------------------------------
export interface Work {
  elementId: string;
  type: 'image' | 'design';
  status: string;
  byFid: number;
  /** Every file of the work on the public bucket, by sha256 (an image: one; a design: its samples and views). */
  files: string[];
}

export const picturesOf = (b: DesignBody): DesignPicture[] => [...b.samples, ...(['front', 'side', 'back'] as const).map((k) => b.views[k]).filter((p): p is DesignPicture => Boolean(p))];

/** The work behind a version, image or design, whatever its status (for hide, unhide, report and moderation). */
export async function workOf(sql: Sql, versionId: string): Promise<Work | null> {
  if (!isId(versionId)) return null;
  const [row] = await sql`select e.id, e.element_type, e.status, e.created_by_fid, v.asset_sha256 from studio.element_versions v
    join studio.elements e on e.id = v.element_id where v.id = ${versionId} and e.element_type in ('image', 'design')`;
  if (!row) return null;
  let files: string[] = [];
  if (row.element_type === 'image') files = [String(row.asset_sha256)];
  else {
    const all = await sql`select body from studio.element_versions where element_id = ${row.id}`;
    files = [...new Set(all.flatMap((r) => picturesOf(bodyOf(r.body)).map((p) => p.sha256)))];
  }
  return { elementId: String(row.id), type: row.element_type as Work['type'], status: String(row.status), byFid: Number(row.created_by_fid), files };
}

/** Reported designs waiting for a moderator: the same rule as images (latest report or rule-hide), oldest first. */
export async function designQueue(sql: Sql) {
  const rows = await sql`
    with last as (
      select distinct on (element_id) element_id, step, role, at from studio.removal_log
      where step in ('reported', 'hidden', 'dismissed') order by element_id, at desc)
    select e.id as element_id, e.status, e.created_by_fid, e.created_at, en.kind, en.name as entity, v.id as version_id, v.version_no, v.body,
           last.step as last_step, last.role as last_role, last.at as last_at,
           (select json_agg(json_build_object('reason', reason, 'n', n)) from (
              select reason, count(*)::int as n from studio.removal_log where element_id = e.id and step = 'reported' group by reason) x) as reasons,
           (select json_agg(note) from studio.removal_log where element_id = e.id and step = 'reported' and note is not null) as notes
    from last join studio.elements e on e.id = last.element_id and e.element_type = 'design'
    join studio.entities en on en.id = e.entity_id
    join lateral (select * from studio.element_versions v where v.element_id = e.id order by v.version_no desc limit 1) v on true
    where last.step = 'reported' or (last.step = 'hidden' and last.role = 'rule')
    order by last.at
    limit 100`;
  return rows.map((r) => {
    const b = bodyOf(r.body);
    return {
      type: 'design' as const,
      version_id: String(r.version_id),
      status: String(r.status),
      created_by_fid: Number(r.created_by_fid),
      created_at: new Date(r.created_at).toISOString(),
      kind: r.kind as DesignKind,
      entity: String(r.entity),
      title: b.title,
      text: b.text,
      version_no: Number(r.version_no),
      pictures: picturesOf(b).map((p) => p.url),
      last_step: String(r.last_step),
      last_role: String(r.last_role),
      last_at: new Date(r.last_at).toISOString(),
      reasons: r.reasons,
      notes: r.notes,
    };
  });
}

/** The moderator queue: reported images and designs together, oldest report first (a time order ranks nothing readers see). */
export async function fullQueue(sql: Sql) {
  const { reportQueue } = await import('./data');
  const images = (await reportQueue(sql)).map((r) => ({ type: 'image' as const, ...(r as Record<string, unknown>), version_id: String(r.version_id), last_at: new Date(r.last_at as string).toISOString() }));
  const designs = await designQueue(sql);
  return [...images, ...designs].sort((a, b) => Date.parse(a.last_at) - Date.parse(b.last_at));
}

/** The file the project's starting style comes from; once it is published as a design, the composer's file option retires (decision 13). */
export const STARTING_STYLE_FILE = 'content/snowmoon/designs/styles/techno-vistas.json';

export async function startingStyleRetired(sql: Sql): Promise<boolean> {
  const [r] = await sql`select 1 from studio.elements e join studio.element_versions v on v.element_id = e.id
    where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and v.body->'assist'->>'source' = ${STARTING_STYLE_FILE} limit 1`;
  return Boolean(r);
}

/**
 * Publishes the project's starting style as a design (decision 13, 2026-10-09): under the
 * maintainer's FID, labelled the maintainer's, its text declared model-drafted. Used by
 * scripts/seed-designs.ts (dry run unless --apply) at merge time, after the owner's go.
 */
export async function seedStartingStyle(sql: Sql, opts: { fid: number; byName: string | null; text: string; title: string }): Promise<{ versionId: string } | { exists: true }> {
  if (await startingStyleRetired(sql)) return { exists: true };
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    const [have] = await t`select id from studio.entities where work_id = ${WORK_ID} and kind = 'style' and lower(name) = lower(${opts.title})`;
    const entityId = have ? String(have.id) : String((await t`insert into studio.entities ${t({ work_id: WORK_ID, kind: 'style', name: opts.title })} returning id`)[0].id);
    const body: DesignBody = {
      title: opts.title, text: opts.text, samples: [], views: {}, by_name: opts.byName, by_name_source: null, role: 'maintainer',
      assist: { model: 'claude-coding-agent', drafted: ['style text'], source: STARTING_STYLE_FILE },
    };
    const [el] = await t`insert into studio.elements ${t({ work_id: WORK_ID, element_type: 'design', entity_id: entityId, created_by_fid: opts.fid })} returning id`;
    const [v] = await t`insert into studio.element_versions ${t({ element_id: el.id, version_no: 1, body: t.json(body as never) })} returning id`;
    return { versionId: String(v.id) };
  });
}
