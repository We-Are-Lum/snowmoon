import 'server-only';
import type postgres from 'postgres';
import { isAdmin } from './admins';
import { CHALLENGE, WORK_ID } from './config';
import { byline, designByline } from './images/byline';
import { basesOf } from './challenge/rules';
import { standing } from './challenge/entries';
import { fullQueue } from './images/designs';
import { socialPerson } from './people';
import { credit } from './wallet/credit';
import { frameByline } from './remix/frames';
import { sceneHandleFor } from './adaptation-pages';
import { SECTIONS, TZ, countSql, defs, type Def, type SectionId } from './admin-activity-defs';

/**
 * The admin activity page (owner, 2026-11-05; docs/proposals/admin-activity.md): for admins only, everyone else gets
 * 404 before any query. It reads only what the site already keeps, in one read-only transaction as studio_writer, and
 * returns totals for everything private and, per person, only what is public anyway (published work, entries, its
 * byline and link). It sorts, by time and by name, under P5b's exception for admin-only pages (owner, 2026-11-05: "P5 is
 * about public steering"); it publishes, orders and hides nothing anyone else sees. Never cached (the route).
 */
type Sql = postgres.Sql;

export interface Metric { key: string; unit: 'count' | 'usd'; total: number; byDay: Record<string, number> }
export interface Section { id: SectionId; title: string; days: 'Pacific' | 'UTC' | null; note: string | null; metrics: Metric[] }
export interface PublicRow { title: string; by: string; href: string | null; at: string; note: string | null }
export interface PublicList { id: string; title: string; rows: PublicRow[] }
export interface ActivityView {
  days: number;
  /** The days shown, newest first: Pacific dates, and UTC dates for the cost tables. */
  dayList: string[];
  dayListUtc: string[];
  generatedAt: string;
  /** Who the per-person lists are for (a public handle), or null for everyone. */
  who: string | null;
  sections: Section[];
  lists: PublicList[];
  /** Counts left out because their table or column isn't on this database yet. */
  notHere: string[];
}
/** What the transaction read, and the bylines to finish after it. */
type Read = { view: ActivityView; bylines: ((sql: Sql) => Promise<void>)[] };
export type ActivityAnswer = { status: 200; body: ActivityView } | { status: 404 | 503; body: { error: string } };

export const DAY_CHOICES = [7, 30, 90] as const;
export const daysFrom = (raw: string | null | undefined) => (DAY_CHOICES as readonly number[]).includes(Number(raw)) ? Number(raw) : 30;

/** The answer for this person: 404 unless an admin, before anything is read. */
export async function adminActivity(sql: Sql | null, fid: number | null, opts: { days?: number; who?: string | null } = {}): Promise<ActivityAnswer> {
  if (!isAdmin(fid)) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'Not available here' } };
  const days = daysFrom(String(opts.days ?? ''));
  const { view, bylines } = (await sql.begin('read only', (tx) => readAll(tx as unknown as Sql, days, opts.who ?? null))) as unknown as Read;
  // Bylines, after the transaction, by the public pages' own functions (the linked-wallet credit, a scene's handle), so
  // an admin sees each piece's maker exactly as everyone does. They read only what those pages read.
  for (const b of bylines) await b(sql);
  return { status: 200, body: view };
}

/** The days shown, newest first, in a time zone (Pacific, or UTC for the cost tables). */
function dayList(days: number, timeZone: string, now = new Date()): string[] {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const t = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(t - i * 86_400_000).toISOString().slice(0, 10));
}

async function present(tx: Sql, names: string[]): Promise<Set<string>> {
  const rows = await tx<{ n: string }[]>`
    select n from unnest(${tx.array(names)}::text[]) as n
    where case when array_length(string_to_array(n, '.'), 1) = 3
      then exists (select 1 from information_schema.columns c where c.table_schema = split_part(n, '.', 1) and c.table_name = split_part(n, '.', 2) and c.column_name = split_part(n, '.', 3))
      else to_regclass(n) is not null end`;
  return new Set(rows.map((r) => r.n));
}

const usable = (d: Def, here: Set<string>) => (d.needs ?? []).every((n) => (n.startsWith('!') ? !here.has(n.slice(1)) : here.has(n)));

async function readAll(tx: Sql, days: number, who: string | null): Promise<Read> {
  await tx`set local statement_timeout = '5s'`;
  const all = defs(CHALLENGE.id);
  const extra = ['studio.challenge_marks', 'studio.challenge_eligibility', 'studio.social_accounts'];
  const here = await present(tx, [...new Set([...all.flatMap((d) => (d.needs ?? []).map((n) => n.replace(/^!/, ''))), ...extra])]);
  const notHere = all.filter((d) => !usable(d, here) && !(d.needs ?? []).some((n) => n.startsWith('!'))).map((d) => d.id);

  const sections = new Map<SectionId, Section>();
  for (const [id, s] of Object.entries(SECTIONS) as [SectionId, (typeof SECTIONS)[SectionId]][]) sections.set(id, { id, title: s.title, days: s.days, note: s.note ?? null, metrics: [] });
  for (const d of all.filter((x) => usable(x, here))) {
    const rows = await tx.unsafe<{ day: string | null; key: string; n: number; total: boolean }[]>(countSql(d), [days]);
    const byKey = new Map<string, Metric>();
    for (const r of rows) {
      const m = byKey.get(r.key) ?? { key: r.key, unit: d.unit, total: 0, byDay: {} };
      byKey.set(r.key, m);
      if (r.total) m.total = Number(r.n);
      else if (r.day) m.byDay[r.day] = Number(r.n);
    }
    sections.get(d.section)!.metrics.push(...[...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)));
  }
  const maker = who ? await personFor(tx, who, here.has('studio.social_accounts')) : null;
  const bylines: Read['bylines'] = [];
  const lists = await publicLists(tx, maker, here, bylines);
  // Last: the moderators' own queue helper, counted only (up to 100 of each kind, as /moderate lists them).
  const queue = await fullQueue(tx).then((q) => q.length).catch(() => null);
  if (queue !== null) sections.get('safety')!.metrics.unshift({ key: 'Open in the moderation queue (/moderate, up to 100 of each kind)', unit: 'count', total: queue, byDay: {} });
  const view: ActivityView = {
    days, dayList: dayList(days, TZ), dayListUtc: dayList(days, 'UTC'), generatedAt: new Date().toISOString(), who: maker === null ? null : who,
    // One person's view holds their public work only: no count at all, private or not.
    sections: maker === null ? [...sections.values()] : [], lists, notHere,
  };
  return { view, bylines };
}

/** A public handle to its person: a Farcaster name the site has seen, a wallet's address, or a Lens/Bluesky handle. */
async function personFor(tx: Sql, raw: string, social: boolean): Promise<number | null> {
  const h = raw.trim().replace(/^@/, '').toLowerCase();
  if (!h || h.length > 253) return null;
  if (/^0x[0-9a-f]{40}$/.test(h)) {
    const [w] = await tx<{ id: string }[]>`select id::text from studio.wallet_accounts where address = ${h}`;
    return w ? -Number(w.id) : null;
  }
  const [n] = await tx<{ person: string }[]>`select person::text from studio.account_names where fname = ${h}`;
  if (n) return Number(n.person);
  if (!social) return null;
  const [s] = await tx<{ id: string }[]>`select id::text from studio.social_accounts where lower(handle) = ${h} order by last_sign_in_at desc limit 1`;
  return s ? socialPerson(Number(s.id)) : null;
}

const iso = (d: unknown) => new Date(d as string).toISOString();

async function publicLists(tx: Sql, maker: number | null, here: Set<string>, bylines: Read['bylines']): Promise<PublicList[]> {
  const by = (col: string) => (maker === null ? tx`` : tx`and ${tx(col)} = ${maker}`);
  const remixOf = tx`exists (select 1 from studio.element_versions v1 join studio.links l on l.from_version_id = v1.id and l.kind = 'remixed_from' where v1.element_id = e.id and v1.version_no = 1)`;
  const designs = (remix: boolean) => tx<{ id: string; created_at: string; by_fid: string; entity: string; title: string; by_name: string | null; role: string | null }[]>`
    select v.id::text, v.created_at, e.created_by_fid::text as by_fid, en.name as entity, coalesce(v.body->>'title', '') as title, v.body->>'by_name' as by_name, v.body->>'role' as role
    from studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
    where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and ${remix ? remixOf : tx`not ${remixOf}`} ${by('e.created_by_fid')}
    order by v.created_at desc limit 25`;
  const designRow = (r: Awaited<ReturnType<typeof designs>>[number]): PublicRow => ({
    title: r.title || r.entity, by: designByline(r.by_name, Number(r.by_fid), r.role), href: `/references/designs/${r.id}`, at: iso(r.created_at), note: r.title ? r.entity : null,
  });
  const images = await tx<{ id: string; created_at: string; by_fid: string; by_name: string | null; chapter: number | null }[]>`
    select v.id::text, e.created_at, e.created_by_fid::text as by_fid, r.params->>'by_name' as by_name, (select a.chapter from studio.anchors a where a.version_id = v.id limit 1) as chapter
    from studio.elements e join studio.element_versions v on v.element_id = e.id join studio.recipes r on r.id = v.recipe_id
    where e.element_type = 'image' and e.status = 'published' and e.work_id = ${WORK_ID} and r.source = 'in_app' ${by('e.created_by_fid')}
    order by e.created_at desc limit 25`;
  const scenes = await tx<{ id: string; adaptation_id: string; title: string; person: string; created_at: string }[]>`
    select v.id::text, v.adaptation_id::text, a.title, v.author_person::text as person, v.created_at
    from studio.adaptation_versions v join studio.adaptations a on a.id = v.adaptation_id
    where not v.hidden ${by('v.author_person')}
    order by v.created_at desc limit 25`;
  const frames = await tx<{ id: string; created_at: string; person: string; by_name: string | null }[]>`
    select id::text, created_at, person::text, by_name from studio.remix_frames where not hidden ${by('person')}
    order by created_at desc limit 25`;

  const lists: PublicList[] = [
    { id: 'versions', title: 'Newest sheet and style versions', rows: (await designs(false)).map(designRow) },
    { id: 'remixes', title: 'Newest remixes', rows: (await designs(true)).map(designRow) },
    { id: 'images', title: 'Newest images', rows: images.map((r) => ({ title: r.chapter ? `Chapter ${r.chapter}` : 'Image', by: '', href: `/image/${r.id}`, at: iso(r.created_at), note: null })) },
    { id: 'scenes', title: 'Newest scene versions', rows: scenes.map((r) => ({ title: r.title, by: '', href: null, at: iso(r.created_at), note: null })) },
    { id: 'frames', title: 'Newest Remix frames', rows: frames.map((r) => ({ title: 'Remix frame', by: '', href: `/remix/${r.id}`, at: iso(r.created_at), note: null })) },
    ...(await baseLists(tx)),
  ];
  const rowsOf = (id: string) => lists.find((l) => l.id === id)!.rows;
  // As the image page: the linked-wallet credit, then byline (src/lib/images/data.ts, src/lib/images/byline.ts).
  bylines.push(async (sql) => {
    const shown = await credit(sql, images, (r) => Number(r.by_fid), (r, fid, name) => ({ ...r, by_fid: String(fid), by_name: name }));
    shown.forEach((r, i) => (rowsOf('images')[i].by = byline(r.by_name, Number(r.by_fid))));
  });
  // As the frame page: the credit, then frameByline (src/app/remix/[id]/page.tsx).
  bylines.push(async (sql) => {
    const shown = await credit(sql, frames.map((r) => ({ person: Number(r.person), byName: r.by_name })), (r) => r.person, (r, fid, name) => ({ person: fid, byName: name }));
    shown.forEach((r, i) => (rowsOf('frames')[i].by = frameByline(r)));
  });
  // As the scene pages: sceneHandleFor (a linked wallet's version under its FID's name), and the link they redirect to.
  bylines.push(async () => {
    for (const [i, r] of scenes.entries()) {
      const handle = await sceneHandleFor(Number(r.person)).catch(() => null);
      const row = rowsOf('scenes')[i];
      row.by = handle ? (/^0x/.test(handle) ? handle : `@${handle}`) : Number(r.person) > 0 ? `FID ${r.person}` : 'an account';
      row.href = handle ? `/@${handle}/${r.adaptation_id}/v/${r.id}` : null;
    }
  });
  if (CHALLENGE.entries && here.has('studio.challenge_marks') && here.has('studio.challenge_eligibility')) {
    const st = await standing(tx);
    const entries = st.entries.filter((e) => maker === null || e.maker === maker);
    const per = [...st.entrants.entries()].map(([c, n]) => `${c}: ${entries.filter((e) => e.character === c).length} entries, ${n} makers`).join(' · ');
    lists.push({
      id: 'entries', title: `Challenge entries (${per || 'none yet'})`,
      rows: entries.map((e) => ({ title: e.title || e.character, by: designByline(e.byName, e.maker), href: `/references/designs/${e.versionId}`, at: e.createdAt, note: e.character })),
    });
    if (maker === null) lists.push({ id: 'admins', title: 'Admins’ versions in the window (not eligible)', rows: st.byAdmins.map((e) => ({ title: e.title || e.character, by: designByline(e.byName, e.maker), href: `/references/designs/${e.versionId}`, at: e.createdAt, note: e.character })) });
  }
  return lists;
}

/** Each base (CHALLENGE.bases), with how many direct remixes it has and the newest ten. */
async function baseLists(tx: Sql): Promise<PublicList[]> {
  const ids = [...new Set(CHALLENGE.characters.flatMap((c) => basesOf(c)))];
  if (!ids.length) return [{ id: 'bases', title: 'Direct remixes of a base (no bases set yet)', rows: [] }];
  const out: PublicList[] = [];
  for (const id of ids) {
    const [b] = await tx<{ version_id: string; title: string; entity: string; by_fid: string; by_name: string | null; role: string | null; created_at: string; n: number }[]>`
      select v.id::text as version_id, coalesce(v.body->>'title', '') as title, en.name as entity, e.created_by_fid::text as by_fid, v.body->>'by_name' as by_name, v.body->>'role' as role, v.created_at,
        (select count(distinct fv.element_id)::int from studio.links l join studio.element_versions fv on fv.id = l.from_version_id and fv.version_no = 1 join studio.element_versions tv on tv.id = l.to_version_id join studio.elements fe on fe.id = fv.element_id
          where l.kind = 'remixed_from' and tv.element_id = e.id and fe.status = 'published') as n
      from studio.elements e join studio.entities en on en.id = e.entity_id
      join lateral (select * from studio.element_versions v where v.element_id = e.id order by v.version_no desc limit 1) v on true
      where e.id = ${id} and e.status = 'published'`;
    if (!b) continue;
    const remixes = await tx<{ version_id: string; title: string; by_fid: string; by_name: string | null; created_at: string }[]>`
      select fv.id::text as version_id, coalesce(fv.body->>'title', '') as title, fe.created_by_fid::text as by_fid, fv.body->>'by_name' as by_name, fv.created_at
      from studio.links l join studio.element_versions fv on fv.id = l.from_version_id and fv.version_no = 1 join studio.element_versions tv on tv.id = l.to_version_id join studio.elements fe on fe.id = fv.element_id
      where l.kind = 'remixed_from' and tv.element_id = ${id} and fe.status = 'published'
      order by fv.created_at desc limit 10`;
    out.push({
      id: `base-${id}`, title: `Direct remixes of a base: ${b.title || b.entity}, by ${designByline(b.by_name, Number(b.by_fid), b.role)} (${b.n})`,
      rows: [
        { title: `${b.title || b.entity} (the base)`, by: designByline(b.by_name, Number(b.by_fid), b.role), href: `/references/designs/${b.version_id}`, at: iso(b.created_at), note: b.entity },
        ...remixes.map((r) => ({ title: r.title || b.entity, by: designByline(r.by_name, Number(r.by_fid)), href: `/references/designs/${r.version_id}`, at: iso(r.created_at), note: null })),
      ],
    });
  }
  return out;
}
