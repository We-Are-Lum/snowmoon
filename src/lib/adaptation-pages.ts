import 'server-only';
import { db } from './db';
import { forgetName, lookupFid, lookupName, NAME } from './names';

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
  /**
   * A closed model that made part of the version (principle 3: reported; owner, 2026-10-18: closed models
   * are allowed when the recipe and label name the model, its maker, the date and that it is closed).
   */
  closed_model?: ClosedModel | null;
}

export interface ClosedModel {
  name: string;
  maker: string;
  /** Its id on the host, as in config/models.json. */
  endpoint: string;
  host: string;
  /** When it was used (YYYY-MM-DD). */
  date: string;
  /** What it made: "the pictures". */
  made: string;
  weights: string;
  /** "inputs open, model closed". */
  openness: string;
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
 * Sunday's fallback (owner, 2026-10-17): adaptation 1 is Fifteen Days, by FID 6786 (@naaate). Version 1
 * (the open-weight cut) is seeded by 0012; version 2 (the GPT cut) and the owner's page at version 2 by
 * 0014 (owner, 2026-10-18: "Chat gpt version is so much better. Let's go with that one").
 * The cut and its poster are named by their sha256 on media.snowmoon.party and uploaded in publish
 * step (b) (npm run publish:scene-video); until then the player finds nothing there.
 */
const STATIC = {
  adaptations: [{ id: 1, owner: 6786, title: 'Fifteen Days' }] as Adaptation[],
  versions: [
    {
      id: 1,
      adaptationId: 1,
      parentId: null,
      author: 6786,
      recipe: {
        video_url: 'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-9391f90d6dca.mp4',
        poster_url: 'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-poster-3caad9b75656.jpg',
        // The scene's recipe folder on main (owner, 2026-10-17); it loads once scenes-sound is merged.
        recipe_url: 'https://github.com/We-Are-Lum/snowmoon/tree/main/adaptations/fifteen-days',
        // The owner's wording (approved 2026-10-17): keeps P2b's standard "AI-generated, not by the author". No watermark claims.
        ai_label: "Pictures: AI-generated, not by the author · Voices: @naaate's performances, AI-converted.",
        after_chapter: 14,
        spoilers_through: 19,
      },
      createdAt: '2026-10-18',
      hidden: false,
    },
    {
      // The GPT cut, as is: version 1's cut with every model-drawn picture redrawn by GPT Image 2.5 Sunburst
      // (OpenAI, a closed model). The owner's own second version, not a remix of version 1: no parent.
      id: 2,
      adaptationId: 1,
      parentId: null,
      author: 6786,
      recipe: {
        video_url: 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4',
        poster_url: 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg',
        recipe_url: 'https://github.com/We-Are-Lum/snowmoon/tree/main/adaptations/fifteen-days',
        // DRAFT wording for the owner to approve (2026-10-18).
        ai_label: "Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.",
        after_chapter: 14,
        spoilers_through: 19,
        closed_model: {
          name: 'GPT Image 2.5 Sunburst',
          maker: 'OpenAI',
          endpoint: 'openai/gpt-image-2.5-sunburst',
          host: 'Vercel AI Gateway',
          date: '2026-10-18',
          made: 'the pictures',
          weights: 'not published',
          openness: 'inputs open, model closed',
        },
      },
      createdAt: '2026-10-18',
      hidden: false,
    },
  ] as Version[],
  pages: [{ person: 6786, adaptationId: 1, versionId: 2 }],
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
 * Versions whose pictures aren't committed here, so the live editor and Remix (public/editor/<id>/v<n>/,
 * made by scripts/editor-data.mjs) read another version's; every page that links into the editor says so.
 * None now: version 2, the GPT cut, has its own pictures and recipes in the editor since 2026-10-18
 * (adaptations/fifteen-days/versions/2.json, "editor"); until then it read version 1's.
 */
const EDITOR_READS: Record<number, number> = {};

/** The version whose committed files the live editor, the shot strip and Remix read for this one. */
export async function editorVersion(v: Version): Promise<Version> {
  const other = EDITOR_READS[v.id];
  if (!other) return v;
  const e = await getVersion(other);
  return e && e.adaptationId === v.adaptationId && !e.hidden ? e : v;
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

/** Every adaptation and its public versions, newest first (the agent read API's list_scenes). */
export async function publicCatalogue(): Promise<{ adaptation: Adaptation; versions: Version[] }[]> {
  const rows = await fromTables((sql) => sql<(VersionRow & { title: string; owner_person: string })[]>`
    select v.id, v.adaptation_id, v.parent_version_id, v.author_person, v.recipe, v.created_at, v.hidden, a.title, a.owner_person
    from studio.adaptation_versions v join studio.adaptations a on a.id = v.adaptation_id
    where not v.hidden order by v.adaptation_id, v.id desc`);
  const list = rows
    ? rows.map((r) => ({ adaptation: { id: Number(r.adaptation_id), owner: Number(r.owner_person), title: r.title }, version: toVersion(r) }))
    : STATIC.versions.filter((v) => !v.hidden).map((v) => ({ adaptation: STATIC.adaptations.find((a) => a.id === v.adaptationId)!, version: v }));
  const by = new Map<number, { adaptation: Adaptation; versions: Version[] }>();
  for (const { adaptation, version } of list) {
    if (!by.has(adaptation.id)) by.set(adaptation.id, { adaptation, versions: [] });
    by.get(adaptation.id)!.versions.push(version);
  }
  return [...by.values()];
}

/**
 * The adaptations a person has something public under: a version they made that isn't hidden, or their
 * page pointing at one (the You page and the public profile, /@<handle>; owner, 2026-10-18).
 * Each is then shown with shownVersion, so a profile shows exactly what /@<handle>/<id> shows.
 */
export async function adaptationsOf(person: Person): Promise<Adaptation[]> {
  const rows = await fromTables((sql) => sql<{ id: string; owner_person: string; title: string }[]>`
    select a.id, a.owner_person, a.title from studio.adaptations a
    where exists (select 1 from studio.adaptation_versions v where v.adaptation_id = a.id and v.author_person = ${person} and not v.hidden)
       or exists (select 1 from studio.adaptation_pages p join studio.adaptation_versions v on v.id = p.version_id
                  where p.person = ${person} and p.adaptation_id = a.id and not v.hidden)
    order by a.id`);
  if (rows) return rows.map((r) => ({ id: Number(r.id), owner: Number(r.owner_person), title: r.title }));
  const ids = new Set([
    ...STATIC.versions.filter((v) => v.author === person && !v.hidden).map((v) => v.adaptationId),
    ...STATIC.pages.filter((p) => p.person === person).map((p) => p.adaptationId),
  ]);
  return STATIC.adaptations.filter((a) => ids.has(a.id));
}

/** Who hid a version, when migration 0015 (DRAFT) has added the columns; null before it, or when not hidden. */
export type HiddenBy = 'maker' | 'maintainer' | null;

/**
 * Every version a person made, hidden ones too, newest first: for their own You page only (never a
 * public page). `hiddenRole` is read when the DRAFT migration 0015 is applied; until then it is
 * undefined (who hid it isn't recorded, so bringing it back isn't offered).
 */
export async function versionsBy(person: Person): Promise<(Version & { title: string; hiddenRole?: HiddenBy })[]> {
  const withRole = await fromTables(async (sql) => {
    // 0015 (DRAFT) adds hidden_role; asked of the catalogue first, so no failing statement is sent without it.
    const [c] = await sql`select exists (select 1 from information_schema.columns
      where table_schema = 'studio' and table_name = 'adaptation_versions' and column_name = 'hidden_role') as has`;
    if (c?.has)
      return await sql<(VersionRow & { title: string; hidden_role: HiddenBy })[]>`
        select v.id, v.adaptation_id, v.parent_version_id, v.author_person, v.recipe, v.created_at, v.hidden, a.title, v.hidden_role
        from studio.adaptation_versions v join studio.adaptations a on a.id = v.adaptation_id
        where v.author_person = ${person} order by v.created_at desc, v.id desc limit 100`;
    return (
      await sql<(VersionRow & { title: string })[]>`
        select v.id, v.adaptation_id, v.parent_version_id, v.author_person, v.recipe, v.created_at, v.hidden, a.title
        from studio.adaptation_versions v join studio.adaptations a on a.id = v.adaptation_id
        where v.author_person = ${person} order by v.created_at desc, v.id desc limit 100`
    ).map((r) => ({ ...r, hidden_role: undefined as unknown as HiddenBy }));
  });
  if (withRole) return withRole.map((r) => ({ ...toVersion(r), title: r.title, ...(r.hidden_role === undefined ? {} : { hiddenRole: r.hidden_role }) }));
  return STATIC.versions
    .filter((v) => v.author === person)
    .sort((a, b) => b.id - a.id)
    .map((v) => ({ ...v, title: STATIC.adaptations.find((a) => a.id === v.adaptationId)?.title ?? '' }));
}

/**
 * Every public version a person made under one adaptation, the one their page shows first, then newest
 * first (a moment page lays them side by side; owner, 2026-10-19).
 */
export async function authorVersions(person: Person, adaptationId: number): Promise<Version[]> {
  const shown = await shownVersion(person, adaptationId);
  const rows = await fromTables((sql) => sql<VersionRow[]>`
    select id, adaptation_id, parent_version_id, author_person, recipe, created_at, hidden
    from studio.adaptation_versions
    where adaptation_id = ${adaptationId} and author_person = ${person} and not hidden
    order by id desc`);
  const all = rows ? rows.map(toVersion) : STATIC.versions.filter((v) => v.adaptationId === adaptationId && v.author === person && !v.hidden).sort((a, b) => b.id - a.id);
  return shown ? [shown, ...all.filter((v) => v.id !== shown.id)] : all;
}

/** The FID we last saw holding this name (for links made before a rename). */
async function seenName(fname: string): Promise<number | null> {
  const rows = await fromTables((sql) => sql<{ person: string }[]>`select person from studio.account_names where fname = ${fname}`);
  if (rows) return rows[0] ? Number(rows[0].person) : null;
  return STATIC.names[fname] ?? null;
}

/**
 * Remember a person's Farcaster name, so links made before a rename still find them. Only when they
 * sign in (or publish): viewing /@someone/1 stores nothing about a person who never used the site
 * (owner, 2026-10-17). Errors are ignored: sign-in never waits on this.
 */
export async function rememberName(fid: number, username?: string | null): Promise<void> {
  try {
    const name = (username ?? (await lookupName(fid)))?.toLowerCase();
    if (!name || !NAME.test(name)) return;
    await fromTables((sql) => sql`
      insert into studio.account_names (fname, person) values (${name}, ${fid})
      on conflict (fname) do update set person = excluded.person, seen_at = now()`);
  } catch {
    /* not remembered */
  }
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
    const canonical = found.username ?? name;
    return canonical === handle ? { kind: 'person', person: found.fid, handle } : { kind: 'redirect', handle: canonical };
  }
  const seen = await seenName(name);
  if (seen) {
    // Farcaster didn't answer: trust the name we saw. It answered "no such name": the person renamed.
    if (found.failed) return name === handle ? { kind: 'person', person: seen, handle } : { kind: 'redirect', handle: name };
    let now = await lookupName(seen);
    // Our cached name for that FID is the one Farcaster just said is gone: the cache predates the
    // rename (names.ts keeps a FID's name a day), so ask again rather than 404 until it expires.
    if (now === name) {
      forgetName(seen);
      now = await lookupName(seen);
    }
    if (now && now !== name) return { kind: 'redirect', handle: now };
  }
  return { kind: 'none' };
}

/** The handle for a person's URLs: their Farcaster name, or a wallet account's full address. Null for a FID with no name. */
export async function handleFor(person: Person): Promise<string | null> {
  if (person < 0) return walletAddress(-person);
  const name = await lookupName(person);
  if (name) return name.toLowerCase();
  // Farcaster didn't answer (or has no name for them): the name we last saw on this person, which
  // resolveHandle accepts while Farcaster is down. Without this, /<id> and old fixed links 404 then.
  const seen = await fromTables((sql) => sql<{ fname: string }[]>`
    select fname from studio.account_names where person = ${person} order by seen_at desc limit 1`);
  if (seen?.[0]) return seen[0].fname;
  return Object.entries(STATIC.names).find(([, fid]) => fid === person)?.[0] ?? null;
}

/** "Fifteen Days" → "fifteen-days": the words a page's link carries after its id. */
export function titleSlug(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** "1-fifteen-days" → 1. Words after the id redirect to the current title's (scene-page.tsx). */
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
