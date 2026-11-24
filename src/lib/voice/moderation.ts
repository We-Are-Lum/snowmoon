import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { REASONS } from '../images/reasons';
import { recheckMaker } from '../checks/decisions';
import { hiddenKeyFor } from './store';

/**
 * Reporting and hiding published storyboards (Nate, 2026-11-23; docs/proposals/storyboard-moderation.md, approved with
 * his answers): the images' rules, word for word in effect. Any signed-in person may report a published storyboard once,
 * with a reason and an optional private note, inside the same daily report limit as images (IMAGES.reportsPerDay); its
 * maker can't report their own. One "minor" report (IMAGES.hideAtOnce), or reports from IMAGES.hideAfterReporters
 * different people since its last dismissal (Nate, 2026-11-23: images still count all-time), hide it at once, until a
 * moderator looks. Otherwise it waits in the admins' queue and stays up.
 * Who reported is in the private log only (studio.voice_publication_log); the queue shows counts, never who.
 *
 * Hiding (a moderator, the maintainer or a stated rule) is reversible: the publication is marked hidden
 * (studio.hide_voice_publication), its public files are copied to the private bucket under voice-hidden/ and deleted
 * from the public one; unhiding (a moderator or the maintainer) puts them back. Each step is logged.
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };
export interface ModerationDeps {
  getPublic: (key: string) => Promise<Uint8Array | null>;
  putPublic: (key: string, bytes: Uint8Array) => Promise<void>;
  deletePublic: (key: string) => Promise<void>;
  getPrivate: (key: string) => Promise<Uint8Array | null>;
  putPrivate: (key: string, bytes: Uint8Array) => Promise<void>;
  deletePrivate: (key: string) => Promise<void>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One person's reports today, of images and storyboards together (one daily limit for both). */
export async function reportsToday(sql: Sql, fid: number): Promise<number> {
  const [a] = await sql`select count(*)::int as n from studio.removal_log where by_fid = ${fid} and step = 'reported' and at > now() - interval '1 day'`;
  const [b] = await sql`select count(*)::int as n from studio.voice_publication_log where by_fid = ${fid} and step = 'reported' and at > now() - interval '1 day'`;
  return a.n + b.n;
}

export async function reportStoryboard(sql: Sql, fid: number, id: string, raw: unknown, deps: ModerationDeps): Promise<Result> {
  if (!UUID.test(id)) return { status: 404, json: { error: 'No such storyboard' } };
  const [pub] = await sql`select id, fid, hidden_at from studio.voice_publications where id = ${id} and taken_down_at is null`;
  if (!pub) return { status: 404, json: { error: 'No such storyboard' } };
  if (Number(pub.fid) === fid) return { status: 400, json: { error: 'You can’t report your own storyboard. You can take it down from its page.' } };
  const { reason: r, note } = (raw ?? {}) as { reason?: unknown; note?: unknown };
  const reason = String(r);
  if (!(REASONS as readonly string[]).includes(reason)) return { status: 400, json: { error: 'Choose a reason' } };
  const text = typeof note === 'string' ? note.trim().slice(0, 280) : '';
  const [mine] = await sql`select 1 from studio.voice_publication_log where publication_id = ${id} and by_fid = ${fid} and step = 'reported' limit 1`;
  if (mine) return { status: 200, json: { reported: true } };
  if ((await reportsToday(sql, fid)) >= IMAGES.reportsPerDay) return { status: 429, json: { error: `You can report ${IMAGES.reportsPerDay} images or storyboards a day` } };
  await sql`insert into studio.voice_publication_log ${sql({ publication_id: id, step: 'reported', by_fid: fid, role: 'reader', reason, note: text || null })}`;
  // A reported maker is checked again at their next Generate or publish, as for images (owner, 2026-11-04).
  await recheckMaker(sql, Number(pub.fid));
  // Reporters counted since the last dismissal (Nate, 2026-11-23; storyboards only: images still count all-time).
  const [n] = await sql`select count(distinct by_fid)::int as n from studio.voice_publication_log where publication_id = ${id} and step = 'reported'
    and at > coalesce((select max(d.at) from studio.voice_publication_log d where d.publication_id = ${id} and d.step = 'dismissed'), '-infinity')`;
  const rule = IMAGES.hideAtOnce.includes(reason) ? `one "${reason}" report` : n.n >= IMAGES.hideAfterReporters ? `${n.n} reporters` : null;
  let hidden = false;
  if (rule && !pub.hidden_at) hidden = (await hideStoryboard(sql, id, 0, 'rule', reason, rule, deps)).hidden;
  return { status: 200, json: { reported: true, hidden } };
}

/** Whether a publication is this person's own, and if it is hidden, why (for its maker only). */
export async function ownStoryboard(sql: Sql, fid: number, id: string): Promise<{ mine: boolean; hiddenReason?: string | null }> {
  if (!UUID.test(id)) return { mine: false };
  const [p] = await sql`select hidden_at,
      (select reason from studio.voice_publication_log h where h.publication_id = p.id and h.step = 'hidden' order by h.at desc limit 1) as reason
    from studio.voice_publications p where id = ${id} and fid = ${fid} and taken_down_at is null`;
  if (!p) return { mine: false };
  return p.hidden_at ? { mine: true, hiddenReason: (p.reason ?? null) as string | null } : { mine: true };
}

/** Hide: mark it, then move each public file to the private bucket. Nothing happens if it is already hidden. */
export async function hideStoryboard(sql: Sql, id: string, by: number, role: 'moderator' | 'maintainer' | 'rule', reason: string | null, note: string | null, deps: ModerationDeps) {
  if (!UUID.test(id)) return { hidden: false, moved: 0, failed: 0 };
  const keys = (await sql`select k from studio.hide_voice_publication(${id}::uuid, ${by}::bigint, ${role}, ${reason}, ${note}) as k`).map((x) => x.k as string);
  if (!keys.length) return { hidden: false, moved: 0, failed: 0 };
  let moved = 0;
  let failed = 0;
  for (const k of keys) {
    try {
      const bytes = await deps.getPublic(k);
      if (bytes) await deps.putPrivate(hiddenKeyFor(k), bytes);
      // Deleted from the public bucket only once its private copy is kept (or there was nothing left to keep).
      await deps.deletePublic(k);
      moved++;
    } catch (e) {
      failed++;
      console.error('storyboard hide: moving a file failed', (e as Error).name);
    }
  }
  await sql`insert into studio.voice_publication_log ${sql({ publication_id: id, step: 'moved_private', by_fid: by, role, note: failed ? `${failed} of ${keys.length} files not moved` : null })}`;
  const [m] = await sql`select fid from studio.voice_publications where id = ${id}`;
  if (m) await recheckMaker(sql, Number(m.fid));
  return { hidden: true, moved, failed };
}

/**
 * Unhide: show it again, and put each file back in the public bucket from its private copy, only if that copy is
 * byte for byte the file its maker published ("A moderator may unhide what was hidden; it puts back exactly what its
 * maker published, and never publishes anything else", principle 5, reread by Nate 2026-11-23).
 */
export async function unhideStoryboard(sql: Sql, id: string, by: number, role: 'moderator' | 'maintainer', deps: ModerationDeps) {
  if (!UUID.test(id)) return { shown: false, restored: 0, failed: 0 };
  const keys = (await sql`select k from studio.unhide_voice_publication(${id}::uuid, ${by}::bigint, ${role}) as k`).map((x) => x.k as string);
  if (!keys.length) return { shown: false, restored: 0, failed: 0 };
  let restored = 0;
  let failed = 0;
  for (const k of keys) {
    try {
      const bytes = await deps.getPrivate(hiddenKeyFor(k));
      if (!bytes) throw new Error('no private copy');
      // Exactly what its maker published (principle 5, reread 2026-11-23): each key ends in its file's sha256.
      if (createHash('sha256').update(bytes).digest('hex') !== /-([0-9a-f]{64})\.[a-z0-9]+$/.exec(k)?.[1]) throw new Error('the private copy is not the published file');
      await deps.putPublic(k, bytes);
      await deps.deletePrivate(hiddenKeyFor(k));
      restored++;
    } catch (e) {
      failed++;
      console.error('storyboard unhide: restoring a file failed', (e as Error).message);
    }
  }
  await sql`insert into studio.voice_publication_log ${sql({ publication_id: id, step: 'restored_public', by_fid: by, role, note: failed ? `${failed} of ${keys.length} files not restored` : null })}`;
  return { shown: true, restored, failed };
}

/** Dismiss: the reports were wrong. It leaves the queue; the storyboard stays as it is. */
export async function dismissStoryboard(sql: Sql, id: string, by: number) {
  if (!UUID.test(id)) return false;
  const [pub] = await sql`select 1 from studio.voice_publications where id = ${id}`;
  if (!pub) return false;
  await sql`insert into studio.voice_publication_log ${sql({ publication_id: id, step: 'dismissed', by_fid: by, role: 'moderator' })}`;
  return true;
}

type QueueRow = {
  id: string; title: string; maker: string | null; publishedAt: string; hidden: { at: string; role: string } | null;
  reasons: { reason: string; n: number }[]; reporters: number; notes: string[]; lastStep: string; lastRole: string;
};
const titleOf = (recipe: unknown) => String((recipe as { speech?: { title?: string } } | null)?.speech?.title ?? 'A speech');
const makerOf = (recipe: unknown) => ((recipe as { performer?: { name?: string | null } } | null)?.performer?.name ?? null) as string | null;

/**
 * The admins' queue: published storyboards whose latest report, hide or dismissal is a report, or a hide by a stated
 * rule (which stays until a moderator looks). Reasons with their counts, how many people reported (never who), notes.
 */
export async function storyboardQueue(sql: Sql): Promise<QueueRow[]> {
  const rows = await sql`
    with last as (
      select distinct on (publication_id) publication_id, step, role, at from studio.voice_publication_log
      where step in ('reported', 'hidden', 'dismissed', 'unhidden') order by publication_id, at desc),
    since as (
      select l.publication_id, coalesce((select max(d.at) from studio.voice_publication_log d where d.publication_id = l.publication_id and d.step = 'dismissed'), '-infinity') as t from last l)
    select p.id, p.recipe, p.named, p.published_at, p.hidden_at, p.hidden_role, last.step, last.role,
      (select json_agg(json_build_object('reason', reason, 'n', n)) from (
         select reason, count(*)::int as n from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported' and r.at > s.t group by reason) x) as reasons,
      (select count(distinct by_fid)::int from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported' and r.at > s.t) as reporters,
      (select json_agg(note) from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported' and r.note is not null and r.at > s.t) as notes
    from last join studio.voice_publications p on p.id = last.publication_id join since s on s.publication_id = p.id
    where p.taken_down_at is null and (last.step = 'reported' or (last.step = 'hidden' and last.role = 'rule'))
    order by last.at
    limit 100`;
  return rows.map((r) => ({
    id: r.id as string,
    title: titleOf(r.recipe),
    maker: r.named ? makerOf(r.recipe) : null,
    publishedAt: new Date(r.published_at as string).toISOString(),
    hidden: r.hidden_at ? { at: new Date(r.hidden_at as string).toISOString(), role: r.hidden_role as string } : null,
    reasons: (r.reasons ?? []) as { reason: string; n: number }[],
    reporters: Number(r.reporters ?? 0),
    notes: (r.notes ?? []) as string[],
    lastStep: r.step as string,
    lastRole: r.role as string,
  }));
}

/** The hidden storyboards, with who hid them (a moderator, the maintainer, or a stated rule) and why. */
export async function hiddenStoryboards(sql: Sql) {
  const rows = await sql`
    select p.id, p.recipe, p.named, p.published_at, p.hidden_at, p.hidden_role, p.hidden_by,
      (select reason from studio.voice_publication_log h where h.publication_id = p.id and h.step = 'hidden' order by h.at desc limit 1) as reason
    from studio.voice_publications p where p.hidden_at is not null and p.taken_down_at is null
    order by p.hidden_at desc limit 100`;
  return rows.map((r) => ({
    id: r.id as string,
    title: titleOf(r.recipe),
    maker: r.named ? makerOf(r.recipe) : null,
    publishedAt: new Date(r.published_at as string).toISOString(),
    hiddenAt: new Date(r.hidden_at as string).toISOString(),
    hiddenBy: r.hidden_role === 'rule' ? 'a stated rule' : `${r.hidden_role} (FID ${r.hidden_by})`,
    reason: (r.reason ?? null) as string | null,
  }));
}

/** Storyboard reports waiting (for the moderators' push, with the images'): reports since each one's last dismissal. */
export async function storyboardReportsWaiting(sql: Sql): Promise<number> {
  const q = await storyboardQueue(sql);
  return q.reduce((a, x) => a + x.reasons.reduce((b, y) => b + y.n, 0), 0);
}
