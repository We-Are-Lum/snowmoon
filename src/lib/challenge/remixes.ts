import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, WORK_ID } from '../config';
import { bookCharacter } from '../images/designs';

/**
 * The remixes on /challenge and /challenge/remixes (owner, 2026-11-04). A remix is a published sheet of one of the
 * challenge's characters (CHALLENGE.characters) whose first version was remixed from another sheet, shown at its
 * newest version. Every remix, entry or not, window or not. Read-only; no outside call.
 *
 * Two lists, and nothing else: all of them, for the random selection the browser shuffles afresh on each visit
 * (src/lib/challenge/shuffle.ts), and the feed, newest first (by when the remix was made), filterable by character,
 * a page at a time. No remix, like or built-on count is read, and nothing is ordered by one (P5g, P5i).
 */
type Sql = postgres.Sql;

export interface RemixCard {
  versionId: string;
  elementId: string;
  /** The character's slug (CHALLENGE.characters). */
  character: string;
  title: string;
  byName: string | null;
  byFid: number;
  thumb: string | null;
  /** When the remix was made (its design's first version). */
  createdAt: string;
}

const chars = () => CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));

/** The feed's page size. */
export const FEED_PAGE = 24;
/** How many remixes the random selection shows. */
export const PICK_SIZE = 6;

const card = (r: Record<string, unknown>, slugOf: Map<string, string>): RemixCard => {
  const b = (r.body ?? {}) as { title?: string; by_name?: string | null; samples?: { url: string }[]; views?: { front?: { url: string } } };
  return {
    versionId: String(r.version_id), elementId: String(r.element_id), character: slugOf.get(String(r.name)) ?? '',
    title: b.title ?? '', byName: b.by_name ?? null, byFid: Number(r.created_by_fid),
    thumb: b.views?.front?.url ?? b.samples?.[0]?.url ?? null, createdAt: new Date(r.created_at as string).toISOString(),
  };
};

/**
 * Remixes, newest first. `character` narrows to one (a slug of CHALLENGE.characters; any other is no remixes);
 * `before` is the feed's cursor (the last card of the previous page); `limit` caps the page (none: every remix).
 */
export async function remixes(sql: Sql, opts: { character?: string | null; before?: { createdAt: string; elementId: string } | null; limit?: number } = {}): Promise<RemixCard[]> {
  const all = chars();
  const list = opts.character ? all.filter((c) => c.slug === opts.character) : all;
  if (!list.length) return [];
  const slugOf = new Map(all.map((c) => [c.name, c.slug]));
  const before = opts.before && Number.isFinite(Date.parse(opts.before.createdAt)) && /^[0-9a-f-]{36}$/i.test(opts.before.elementId) ? opts.before : null;
  const rows = await sql`
    select e.id as element_id, en.name, e.created_by_fid, date_trunc('milliseconds', e.created_at) as created_at, v.id as version_id, v.body
    from studio.elements e
    join studio.entities en on en.id = e.entity_id
    join lateral (select * from studio.element_versions v where v.element_id = e.id order by v.version_no desc limit 1) v on true
    where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind = 'character'
      and en.name in ${sql(list.map((c) => c.name))}
      and exists (select 1 from studio.element_versions v1 join studio.links l on l.from_version_id = v1.id and l.kind = 'remixed_from'
                  where v1.element_id = e.id and v1.version_no = 1)
      ${before ? sql`and (date_trunc('milliseconds', e.created_at), e.id) < (${before.createdAt}::timestamptz, ${before.elementId}::uuid)` : sql``}
    order by date_trunc('milliseconds', e.created_at) desc, e.id desc
    ${opts.limit ? sql`limit ${opts.limit}` : sql``}`;
  // The database's order (newest first, then by id, so pages never overlap) is kept as it comes.
  return rows.map((r) => card(r, slugOf));
}

/** The feed's cursor in a link ("<iso>_<element id>"), and back. */
export const cursorOf = (c: Pick<RemixCard, 'createdAt' | 'elementId'>) => `${c.createdAt}_${c.elementId}`;
export function parseCursor(s: string | undefined | null): { createdAt: string; elementId: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/i.exec(s ?? '');
  return m ? { createdAt: m[1], elementId: m[2].toLowerCase() } : null;
}

/** One page of the feed, and the cursor of the next page when there is one. */
export async function remixFeed(sql: Sql, opts: { character?: string | null; before?: string | null } = {}): Promise<{ cards: RemixCard[]; next: string | null }> {
  const page = await remixes(sql, { character: opts.character, before: parseCursor(opts.before), limit: FEED_PAGE + 1 });
  const cards = page.slice(0, FEED_PAGE);
  return { cards, next: page.length > FEED_PAGE ? cursorOf(cards[cards.length - 1]) : null };
}
