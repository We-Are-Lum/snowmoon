import 'server-only';
import { db } from './db';
import { lookupFid, lookupName, NAME } from './names';

/**
 * Adaptation pages: /@<fname>/<id>, /@<fname>/<id>/v/<n>, /<id> (docs/proposals/adaptation-urls.md).
 *
 * Data comes from the tables of migration 0012 (studio.adaptations, adaptation_versions,
 * adaptation_pages, account_names). Until 0012 is applied (or with no database at all: local
 * builds, previews), every read falls back to STATIC below, which holds adaptation 1 and the
 * owner. The switch is automatic: once the tables answer, they are used and STATIC is not.
 */

/** A person number: a Farcaster FID (positive) or minus a wallet account's id (migration 0011). */
export type Person = number;

export interface VersionRecipe {
  /** The video. Only files on this site's own domains are played (principle 6). */
  video_url: string | null;
  poster_url?: string | null;
  /** Where the version's full recipe (prompts, models, hashes) can be read. */
  recipe_url?: string | null;
  /** The AI declaration shown under the player (principle 2). */
  ai_label?: string | null;
  /** "A scene after chapter 14". */
  after_chapter?: number | null;
  /** The last chapter the version gives away. */
  spoilers_through?: number | null;
}

export interface Adaptation {
  id: number;
  owner: Person;
  title: string;
}

export interface Version {
  id: number;
  adaptationId: number;
  parentId: number | null;
  author: Person;
  recipe: VersionRecipe;
  createdAt: string;
  hidden: boolean;
}

/**
 * Sunday's fallback (owner, 2026-10-17): adaptation 1 is Fifteen Days, by FID 6786 (@naaate), and
 * the owner's page shows version 1. The same rows are seeded by 0012.
 * PLACEHOLDER: video_url is null until the owner's cut is published on media.snowmoon.party;
 * until then the page says the video isn't published yet.
 */
const STATIC = {
  adaptations: [{ id: 1, owner: 6786, title: 'Fifteen Days' }] as Adaptation[],
  versions: [
    {
      id: 1,
      adaptationId: 1,
      parentId: null,
      author: 6786,
      recipe: { video_url: null, poster_url: null, recipe_url: null, ai_label: 'Pictures: AI-generated, not by the author', after_chapter: 14, spoilers_through: 19 },
      createdAt: '2026-10-18',
      hidden: false,
    },
  ] as Version[],
  pages: [{ person: 6786, adaptationId: 1, versionId: 1 }],
  names: { naaate: 6786 } as Record<string, number>,
};

/** Run a query against the 0012 tables; undefined when there is no database or the tables aren't there yet. */
async function fromTables<T>(q: (sql: NonNullable<ReturnType<typeof db>>) => Promise<T>): Promise<T | undefined> {
  const sql = db();
  if (!sql) return undefined;
  try {
    return await q(sql);
  } catch (e) {
    // 42P01: relation does not exist (0012 not applied). Anything else is a real failure.
    if ((e as { code?: string }).code === '42P01') return undefined;
    throw e;
  }
}

type VersionRow = { id: string; adaptation_id: string; parent_version_id: string | null; author_person: string; recipe: VersionRecipe; created_at: Date; hidden: boolean };
const toVersion = (r: VersionRow): Version => ({
  id: Number(r.id),
  adaptationId: Number(r.adaptation_id),
  parentId: r.parent_version_id === null ? null : Number(r.parent_version_id),
  author: Number(r.author_person),
  recipe: r.recipe,
  createdAt: r.created_at.toISOString().slice(0, 10),
  hidden: r.hidden,
});

export async function getAdaptation(id: number): Promise<Adaptation | null> {
  const rows = await fromTables((sql) => sql<{ id: string; owner_person: string; title: string }[]>`
    select id, owner_person, title from studio.adaptations where id = ${id}`);
  if (rows) return rows[0] ? { id: Number(rows[0].id), owner: Number(rows[0].owner_person), title: rows[0].title } : null;
  return STATIC.adaptations.find((a) => a.id === id) ?? null;
}

export async function getVersion(id: number): Promise<Version | null> {
  const rows = await fromTables((sql) => sql<VersionRow[]>`
    select id, adaptation_id, parent_version_id, author_person, recipe, created_at, hidden
    from studio.adaptation_versions where id = ${id}`);
  if (rows) return rows[0] ? toVersion(rows[0]) : null;
  return STATIC.versions.find((v) => v.id === id) ?? null;
}

/**
 * What /@<person>/<root> shows: the version their page points at, if it is public; otherwise their
 * latest public version under that root (forks of forks included); otherwise null ("nothing here yet").
 */
export async function shownVersion(person: Person, adaptationId: number): Promise<Version | null> {
  const rows = await fromTables((sql) => sql<VersionRow[]>`
    select v.id, v.adaptation_id, v.parent_version_id, v.author_person, v.recipe, v.created_at, v.hidden
    from studio.adaptation_versions v
    left join studio.adaptation_pages p on p.person = ${person} and p.adaptation_id = ${adaptationId} and p.version_id = v.id
    where v.adaptation_id = ${adaptationId} and not v.hidden and (p.version_id is not null or v.author_person = ${person})
    order by (p.version_id is not null) desc, v.created_at desc, v.id desc
    limit 1`);
  if (rows) return rows[0] ? toVersion(rows[0]) : null;
  const page = STATIC.pages.find((p) => p.person === person && p.adaptationId === adaptationId);
  const chosen = page && STATIC.versions.find((v) => v.id === page.versionId && !v.hidden);
  if (chosen) return chosen;
  return STATIC.versions.filter((v) => v.adaptationId === adaptationId && v.author === person && !v.hidden).sort((a, b) => b.id - a.id)[0] ?? null;
}

/** The FID we last saw holding this name (for links made before a rename). */
async function seenName(fname: string): Promise<number | null> {
  const rows = await fromTables((sql) => sql<{ person: string }[]>`select person from studio.account_names where fname = ${fname}`);
  if (rows) return rows[0] ? Number(rows[0].person) : null;
  return STATIC.names[fname] ?? null;
}

/** Remember the name a person had, only for people who have published a version (so it can't fill up). */
async function noteName(fname: string, fid: number): Promise<void> {
  await fromTables((sql) => sql`
    insert into studio.account_names (fname, person)
    select ${fname}, ${fid}
    where exists (select 1 from studio.adaptation_versions where author_person = ${fid})
    on conflict (fname) do update set person = excluded.person, seen_at = now()`).catch(() => undefined);
}

/** A wallet account's handle is its full address, lowercase: 42 characters, so never a Farcaster name (16 at most; owner, 2026-10-17). */
const ADDRESS = /^0x[0-9a-f]{40}$/;

async function walletByAddress(address: string): Promise<number | null> {
  const rows = await fromTables((sql) => sql<{ id: string }[]>`select id from studio.wallet_accounts where address = ${address}`);
  return rows?.length ? Number(rows[0].id) : null;
}

async function walletAddress(id: number): Promise<string | null> {
  const rows = await fromTables((sql) => sql<{ address: string }[]>`select address from studio.wallet_accounts where id = ${id}`);
  return rows?.[0]?.address ?? null;
}

export type Resolved =
  | { kind: 'person'; person: Person; handle: string }
  | { kind: 'redirect'; handle: string }
  | { kind: 'none' };

/**
 * The handle in a URL (the part after @) to a person. Looked up on each request (cached in
 * names.ts), since links are kept by FID and a name can change hands.
 * - An fname Farcaster knows: that FID. A different spelling of it (case) redirects to the canonical one.
 * - An fname Farcaster no longer knows, but we saw it on someone who has since renamed: redirect to the new name.
 * - A full 0x address: a wallet account (the account is person minus its id). Checksum case redirects to lowercase.
 */
export async function resolveHandle(raw: string): Promise<Resolved> {
  const handle = decodeURIComponent(raw).replace(/^@/, '');
  const name = handle.toLowerCase();
  if (ADDRESS.test(name)) {
    const id = await walletByAddress(name);
    if (id === null) return { kind: 'none' };
    return name === handle ? { kind: 'person', person: -id, handle } : { kind: 'redirect', handle: name };
  }
  if (!NAME.test(name)) return { kind: 'none' };
  const found = await lookupFid(name);
  if (found.fid) {
    void noteName(name, found.fid);
    const canonical = found.username ?? name;
    return canonical === handle ? { kind: 'person', person: found.fid, handle } : { kind: 'redirect', handle: canonical };
  }
  const seen = await seenName(name);
  if (seen) {
    // Farcaster didn't answer: trust the name we saw. It answered "no such name": the person renamed.
    if (found.failed) return name === handle ? { kind: 'person', person: seen, handle } : { kind: 'redirect', handle: name };
    const now = await lookupName(seen);
    if (now && now !== name) return { kind: 'redirect', handle: now };
  }
  return { kind: 'none' };
}

/** The handle for a person's URLs: their Farcaster name, or a wallet account's full address. Null for a FID with no name. */
export async function handleFor(person: Person): Promise<string | null> {
  if (person < 0) return walletAddress(-person);
  const name = await lookupName(person);
  if (name) return name.toLowerCase();
  return Object.entries(STATIC.names).find(([, fid]) => fid === person)?.[0] ?? null;
}

/** "1-fifteen-days" → 1. The slug after the id is ignored. */
export function parseId(segment: string): number | null {
  const m = /^(\d{1,9})(?:-[a-z0-9-]*)?$/i.exec(decodeURIComponent(segment));
  return m ? Number(m[1]) : null;
}

/** Only video on this site's own domains is played: production pages make no third-party requests (principle 6). */
export function ownMedia(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'snowmoon.party' || u.hostname.endsWith('.snowmoon.party')) ? u.toString() : null;
  } catch {
    return null;
  }
}
