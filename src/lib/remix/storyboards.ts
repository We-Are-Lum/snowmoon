import 'server-only';
import { actsFor } from '../wallet/credit';
import type postgres from 'postgres';
import { REMIX } from '../config';
import { isMaintainer } from './frames';
import { versionIndex } from './shot';

/**
 * Storyboards (owner, 2026-10-18; studio.storyboards, migration 0013): a person's ordered frames for
 * a version (each the version's own frame for a shot, or one of their remix frames of it), each
 * with a length, and which existing converted take plays for each line. Public at /storyboard/<id>
 * with the maker's name and title, until hidden by its maker or the maintainer.
 */
type Sql = postgres.Sql;

export interface StoryItem {
  shot: string;
  frame: string | null;
  seconds: number;
}
export interface Storyboard {
  id: string;
  adaptationId: number;
  versionId: number;
  person: number;
  title: string;
  items: StoryItem[];
  takes: Record<string, string>;
  byName: string | null;
  hidden: boolean;
  hiddenRole: 'maker' | 'maintainer' | null;
  createdAt: string;
}

const row = (r: Record<string, unknown>): Storyboard => ({
  id: String(r.id),
  adaptationId: Number(r.adaptation_id),
  versionId: Number(r.version_id),
  person: Number(r.person),
  title: String(r.title ?? ''),
  items: r.items as StoryItem[],
  takes: (r.takes ?? {}) as Record<string, string>,
  byName: (r.by_name as string | null) ?? null,
  hidden: Boolean(r.hidden),
  hiddenRole: (r.hidden_role as Storyboard['hiddenRole']) ?? null,
  createdAt: new Date(r.created_at as string).toISOString(),
});

const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);
const S = REMIX.storyboard;

/** Checks a storyboard as sent: known shots, the person's own shown remix frames of those shots, lengths, takes. */
export async function checkBoard(
  sql: Sql,
  person: number,
  adaptation: number,
  version: number,
  raw: { title?: unknown; items?: unknown; takes?: unknown },
): Promise<{ ok: true; title: string; items: StoryItem[]; takes: Record<string, string> } | { ok: false; error: string }> {
  const idx = versionIndex(adaptation, version);
  if (!idx) return { ok: false, error: 'No such version' };
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title.length > S.titleMaxChars) return { ok: false, error: `A title can be up to ${S.titleMaxChars} characters` };
  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > S.maxItems) return { ok: false, error: `A storyboard has 1 to ${S.maxItems} frames` };
  const items: StoryItem[] = [];
  for (const it of raw.items as { shot?: unknown; frame?: unknown; seconds?: unknown }[]) {
    const shot = typeof it?.shot === 'string' ? it.shot : '';
    const seconds = Number(it?.seconds);
    if (!idx.shots.has(shot)) return { ok: false, error: 'A frame names a shot this version doesn’t have' };
    if (!Number.isFinite(seconds) || seconds < S.minSeconds || seconds > S.maxSeconds) return { ok: false, error: `Each frame lasts ${S.minSeconds} to ${S.maxSeconds} seconds` };
    if (it.frame !== null && it.frame !== undefined && !isId(it.frame)) return { ok: false, error: 'Bad frame' };
    items.push({ shot, frame: isId(it.frame) ? it.frame : null, seconds: Math.round(seconds * 10) / 10 });
  }
  const frames = [...new Set(items.map((i) => i.frame).filter((f): f is string => f !== null))];
  if (frames.length) {
    const rows = await sql`select id, shot_id from studio.remix_frames where id in ${sql(frames)} and person = ${person} and version_id = ${version} and not hidden`;
    const shotOf = new Map(rows.map((r) => [String(r.id), String(r.shot_id)]));
    if (items.some((i) => i.frame && shotOf.get(i.frame) !== i.shot)) return { ok: false, error: 'A remix frame is not yours, is hidden, or is of another shot' };
  }
  const takes: Record<string, string> = {};
  if (raw.takes && typeof raw.takes === 'object') {
    for (const [cue, take] of Object.entries(raw.takes as Record<string, unknown>)) {
      if (typeof take !== 'string' || !idx.takes.get(cue)?.has(take)) return { ok: false, error: 'A line names a take that doesn’t exist' };
      if (take !== 'version') takes[cue] = take;
    }
  }
  return { ok: true, title, items, takes };
}

export async function saveBoard(sql: Sql, b: { adaptation: number; version: number; person: number; title: string; items: StoryItem[]; takes: Record<string, string>; byName: string | null }): Promise<Storyboard> {
  const [r] = await sql`insert into studio.storyboards ${sql({
    adaptation_id: b.adaptation,
    version_id: b.version,
    person: b.person,
    title: b.title,
    items: sql.json(b.items as never),
    takes: sql.json(b.takes as never),
    by_name: b.byName,
  })} returning *`;
  return row(r);
}

export async function boardsToday(sql: Sql, person: number): Promise<number> {
  const [r] = await sql`select count(*)::int as n from studio.storyboards where person = ${person} and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
  return r?.n ?? 0;
}

export async function boardById(sql: Sql, id: string): Promise<Storyboard | null> {
  if (!isId(id)) return null;
  const [r] = await sql`select * from studio.storyboards where id = ${id}`;
  return r ? row(r) : null;
}

/**
 * A person's storyboards, newest first: all of them (hidden ones too) for their own Dashboard, or only
 * shown ones for their public profile, /@<handle> (owner, 2026-10-18).
 */
export async function boardsBy(sql: Sql, person: number, o: { hidden: boolean; limit?: number }): Promise<Storyboard[]> {
  const rs = o.hidden
    ? await sql`select * from studio.storyboards where person = ${person} order by created_at desc limit ${o.limit ?? 100}`
    : await sql`select * from studio.storyboards where person = ${person} and not hidden order by created_at desc limit ${o.limit ?? 100}`;
  return rs.map(row);
}

/** The remix frames a board shows, by id: their image and whether they are still shown. */
export async function boardFrames(sql: Sql, b: Storyboard): Promise<Record<string, { url: string; hidden: boolean }>> {
  const ids = [...new Set(b.items.map((i) => i.frame).filter((f): f is string => f !== null))];
  if (!ids.length) return {};
  const rows = await sql`select id, image_url, hidden from studio.remix_frames where id in ${sql(ids)}`;
  return Object.fromEntries(rows.map((r) => [String(r.id), { url: String(r.image_url), hidden: Boolean(r.hidden) }]));
}

export async function setBoardHidden(sql: Sql, person: number, id: string, hide: boolean): Promise<{ ok: true; board: Storyboard } | { ok: false; status: number; error: string }> {
  const b = await boardById(sql, id);
  if (!b) return { ok: false, status: 404, error: 'No such storyboard' };
  const maker = await actsFor(sql, person, b.person);
  const maint = isMaintainer(person);
  if (!maker && !maint) return { ok: false, status: 403, error: 'Only the person who made this storyboard can hide it.' };
  if (hide) {
    if (b.hidden) return { ok: true, board: b };
    const [r] = await sql`update studio.storyboards set hidden = true, hidden_by = ${person}, hidden_role = ${maker ? 'maker' : 'maintainer'}, hidden_at = now() where id = ${id} returning *`;
    return { ok: true, board: row(r) };
  }
  if (!b.hidden) return { ok: true, board: b };
  if (b.hiddenRole === 'maintainer' ? !maint : !maker) return { ok: false, status: 403, error: 'Only whoever hid it can bring it back.' };
  const [r] = await sql`update studio.storyboards set hidden = false, hidden_by = null, hidden_role = null, hidden_at = null where id = ${id} returning *`;
  return { ok: true, board: row(r) };
}
