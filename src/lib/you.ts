import 'server-only';
import { isSocialPerson, socialAccountOf } from './people';
import { socialAccount } from './social/accounts';
import type postgres from 'postgres';
import { db } from './db';
import { WORK_ID } from './config';
import { lookupName } from './names';
import { adaptationsOf, getAdaptation, handleFor, ownMedia, sceneHandleFor, shownVersion, versionsBy, type Person, type Version } from './adaptation-pages';
import { allMyFrames, shownFramesBy, type Frame } from './remix/frames';
import { boardsBy, type Storyboard } from './remix/storyboards';
import { posterFor } from './scene-delivery';
import { basenameOf } from './wallet/basename';
import { PROFILE_LISTS_REMIXES, SHOW_BASENAMES } from './you-flags';
import { shortAddress } from './wallet/session';
import { linkedTo, walletsOf } from './wallet/credit';

/**
 * The You page (/you, private to the signed-in person) and the public profile (/@<handle>), owner
 * 2026-10-18: "build the You page". Every read here reuses the tables that hold the work already
 * (0008 images, 0011 wallet accounts, 0012 adaptations, 0013 remix frames and storyboards); nothing
 * new is stored. Two kinds of read, kept apart on purpose:
 * - ownWork(person): everything the person made, hidden things too, for their own page only. The
 *   person is always the signed-in one (src/app/api/you/route.ts takes it from the session).
 * - publicWork(person): only what is public anyway at its own link (scenes as /@<handle>/<id> shows
 *   them, remix frames and storyboards that aren't hidden), for the profile.
 * A missing table (a database without 0012 or 0013) reads as nothing, so the page still renders.
 */
type Sql = postgres.Sql;

/** Name order everywhere (owner, 2026-10-18): Farcaster name, then Basename, then the shortened address. */
export interface Who {
  kind: 'farcaster' | 'wallet' | 'lens' | 'bluesky';
  /** As shown: @name, FID n, alice.base.eth or 0x1234…abcd. */
  name: string;
  /** The handle in /@<handle> links: a Farcaster name, or a wallet account's full address. Null for a FID with no name. */
  handle: string | null;
  fid?: number;
  username?: string | null;
  address?: string;
  basename?: string | null;
  short?: string;
}

export async function whoIs(person: Person, walletAddress?: string | null): Promise<Who> {
  if (person > 0) {
    const username = await lookupName(person).catch(() => null);
    const handle = await handleFor(person).catch(() => null);
    return { kind: 'farcaster', name: username ? `@${username}` : handle ? `@${handle}` : `FID ${person}`, handle, fid: person, username: username ?? handle };
  }
  if (isSocialPerson(person)) {
    // A Lens or Bluesky account not linked to a Farcaster account (branch signin-lens-bluesky): its handle as checked
    // at its last sign-in. No /@ page for it yet, so no handle in links.
    const sql = db();
    const row = sql ? await socialAccount(sql, socialAccountOf(person)).catch(() => null) : null;
    const kind = row?.kind ?? 'bluesky';
    return { kind, name: row?.handle ?? (kind === 'lens' ? 'a Lens account' : 'a Bluesky account'), handle: null };
  }
  const address = (walletAddress ?? (await handleFor(person).catch(() => null)) ?? '').toLowerCase();
  const basename = SHOW_BASENAMES && address ? await basenameOf(address) : null;
  const short = address ? shortAddress(address) : 'a wallet account';
  return { kind: 'wallet', name: basename ?? short, handle: address || null, address: address || undefined, basename, short };
}

/** Run a read; a table that isn't there yet (42P01) reads as empty. */
async function orNone<T>(q: () => Promise<T[]>): Promise<T[]> {
  try {
    return await q();
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return [];
    throw e;
  }
}

async function titles(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const id of new Set(ids)) out.set(id, (await getAdaptation(id).catch(() => null))?.title ?? 'a scene');
  return out;
}

export interface SceneItem {
  versionId: number;
  adaptationId: number;
  title: string;
  createdAt: string;
  hidden: boolean;
  /** Undefined until the DRAFT migration 0015 records who hid a version. */
  hiddenRole?: 'maker' | 'maintainer' | null;
  poster: string | null;
  aiLabel: string | null;
  recipeUrl: string | null;
  path: string | null;
  parentId: number | null;
}
export interface FrameItem {
  id: string;
  adaptationId: number;
  versionId: number;
  title: string;
  shot: string;
  words: string;
  url: string | null;
  createdAt: string;
  hidden: boolean;
  hiddenRole: 'maker' | 'maintainer' | null;
  model: { name?: string; licence?: string; host?: string } | null;
}
export interface BoardItem {
  id: string;
  adaptationId: number;
  versionId: number;
  title: string;
  sceneTitle: string;
  frames: number;
  seconds: number;
  createdAt: string;
  hidden: boolean;
  hiddenRole: 'maker' | 'maintainer' | null;
}
export interface PictureItem {
  versionId: string;
  url: string | null;
  chapter: number;
  prompt: string;
  createdAt: string;
  hidden: boolean;
  /** A hide the person made themselves can be undone by them (docs/removal.md, decision 22). */
  canUnhide: boolean;
}

const sceneItem = (v: Version & { title: string; hiddenRole?: 'maker' | 'maintainer' | null }, handle: string | null): SceneItem => ({
  versionId: v.id,
  adaptationId: v.adaptationId,
  title: v.title,
  createdAt: v.createdAt,
  hidden: v.hidden,
  ...('hiddenRole' in v ? { hiddenRole: v.hiddenRole ?? null } : {}),
  // A hidden version's poster isn't shown, even to its maker: it is out of view.
  poster: v.hidden ? null : posterFor(ownMedia(v.recipe.video_url), ownMedia(v.recipe.poster_url)),
  aiLabel: v.recipe.ai_label ?? null,
  recipeUrl: v.recipe.recipe_url ?? null,
  path: handle && !v.hidden ? `/@${handle}/${v.adaptationId}/v/${v.id}` : null,
  parentId: v.parentId,
});

const frameItem = (f: Frame, title: string): FrameItem => {
  const r = f.recipe as { shot?: { n?: number }; model?: { name?: string; licence?: string; host?: string } };
  return {
    id: f.id,
    adaptationId: f.adaptationId,
    versionId: f.versionId,
    title,
    shot: String(r.shot?.n ?? f.shotId),
    words: f.ownWords,
    // A hidden frame's file has left the public bucket: no picture.
    url: f.hidden ? null : f.imageUrl,
    createdAt: f.createdAt,
    hidden: f.hidden,
    hiddenRole: f.hiddenRole,
    model: r.model ? { name: r.model.name, licence: r.model.licence, host: r.model.host } : null,
  };
};

const boardItem = (b: Storyboard, sceneTitle: string): BoardItem => ({
  id: b.id,
  adaptationId: b.adaptationId,
  versionId: b.versionId,
  title: b.title,
  sceneTitle,
  frames: b.items.length,
  seconds: Math.round(b.items.reduce((n, i) => n + i.seconds, 0) * 10) / 10,
  createdAt: b.createdAt,
  hidden: b.hidden,
  hiddenRole: b.hiddenRole,
});

/** The person's own pictures (readers' images, element type image), hidden ones too: for their own page only. */
async function picturesBy(sql: Sql, person: number): Promise<PictureItem[]> {
  const rows = await sql`
    select v.id as version_id, v.asset_url as url, a.chapter, e.status, e.created_at, r.params,
           (select l.role from studio.removal_log l where l.element_id = e.id and l.step in ('hidden', 'unhidden') order by l.at desc limit 1) as last_role
    from studio.elements e
    join studio.element_versions v on v.element_id = e.id
    join studio.anchors a on a.version_id = v.id
    join studio.recipes r on r.id = v.recipe_id
    where e.element_type = 'image' and e.created_by_fid = ${person} and e.status in ('published', 'hidden')
      and e.work_id = ${WORK_ID} and r.source = 'in_app'
    order by e.created_at desc limit 100`;
  return rows.map((r) => {
    const hidden = r.status === 'hidden';
    const p = (r.params ?? {}) as { user_prompt?: unknown };
    return {
      versionId: String(r.version_id),
      url: hidden ? null : String(r.url),
      chapter: Number(r.chapter),
      prompt: typeof p.user_prompt === 'string' ? p.user_prompt : '',
      createdAt: new Date(r.created_at as string).toISOString(),
      hidden,
      canUnhide: hidden && r.last_role === 'author',
    };
  });
}

export interface OwnWork {
  /** False when this deployment has no database (local builds, previews): only scenes from the built-in fallback. */
  stored: boolean;
  scenes: SceneItem[];
  frames: FrameItem[];
  boards: BoardItem[];
  pictures: PictureItem[];
}

/**
 * Everything the signed-in person made, hidden things too. Never call this for anyone but the signed-in person.
 * For a FID, with what its linked wallets made (owner, 2026-10-22: a linked wallet's earlier work shows under the
 * Farcaster name; src/lib/wallet/credit.ts). A linked wallet's scenes link to the Farcaster name's URLs, where they
 * now live (the address URLs redirect there while linked); its frames and boards keep their own links.
 */
export async function ownWork(person: Person, handle: string | null): Promise<OwnWork> {
  const own = await ownWorkOf(person, handle);
  for (const w of person > 0 ? await walletsOf(db(), person) : []) {
    const more = await ownWorkOf(w, await sceneHandleFor(w).catch(() => null));
    own.scenes.push(...more.scenes);
    own.frames.push(...more.frames);
    own.boards.push(...more.boards);
    own.pictures.push(...more.pictures);
  }
  return own;
}

async function ownWorkOf(person: Person, handle: string | null): Promise<OwnWork> {
  const sql = db();
  const scenes = (await versionsBy(person)).map((v) => sceneItem(v, handle));
  if (!sql) return { stored: false, scenes, frames: [], boards: [], pictures: [] };
  const [frames, boards, pictures] = await Promise.all([
    orNone(() => allMyFrames(sql, person)),
    orNone(() => boardsBy(sql, person, { hidden: true })),
    orNone(() => picturesBy(sql, person)),
  ]);
  const t = await titles([...frames.map((f) => f.adaptationId), ...boards.map((b) => b.adaptationId)]);
  return {
    stored: true,
    scenes,
    frames: frames.map((f) => frameItem(f, t.get(f.adaptationId) ?? 'a scene')),
    boards: boards.map((b) => boardItem(b, t.get(b.adaptationId) ?? 'a scene')),
    pictures,
  };
}

export interface PublicWork {
  /** One per adaptation: the version /@<handle>/<id> shows. */
  scenes: (SceneItem & { latestPath: string })[];
  frames: FrameItem[];
  boards: BoardItem[];
}

/**
 * What a public profile shows: only what is already public at its own link. Nothing hidden, no pictures, no money. A FID's
 * includes its linked wallets' (as ownWork): their scenes through adaptationsOf and shownVersion, at the FID's own
 * /@<name>/<id> (one per adaptation, as that URL shows), and their frames and boards here.
 */
export async function publicWork(person: Person, handle: string): Promise<PublicWork> {
  const pub = await publicWorkOf(person, handle);
  for (const w of person > 0 ? await walletsOf(db(), person) : []) {
    const wh = await handleFor(w).catch(() => null);
    if (!wh) continue;
    const more = await publicWorkOf(w, wh);
    pub.frames.push(...more.frames);
    pub.boards.push(...more.boards);
  }
  return pub;
}

async function publicWorkOf(person: Person, handle: string): Promise<PublicWork> {
  const scenes: PublicWork['scenes'] = [];
  for (const a of await adaptationsOf(person)) {
    const v = await shownVersion(person, a.id);
    if (v && !v.hidden) scenes.push({ ...sceneItem({ ...v, title: a.title }, handle), latestPath: `/@${handle}/${a.id}` });
  }
  const sql = db();
  // Scenes only, until consent v5 (src/lib/you-flags.ts).
  if (!sql || !PROFILE_LISTS_REMIXES) return { scenes, frames: [], boards: [] };
  const [frames, boards] = await Promise.all([orNone(() => shownFramesBy(sql, person, 60)), orNone(() => boardsBy(sql, person, { hidden: false, limit: 30 }))]);
  const t = await titles([...frames.map((f) => f.adaptationId), ...boards.map((b) => b.adaptationId)]);
  return {
    scenes,
    frames: frames.filter((f) => !f.hidden).map((f) => frameItem(f, t.get(f.adaptationId) ?? 'a scene')),
    boards: boards.filter((b) => !b.hidden).map((b) => boardItem(b, t.get(b.adaptationId) ?? 'a scene')),
  };
}

/** The handle of a person's public profile, if it has anything on it (so a byline never links to a page that isn't there). */
export async function profileHandle(person: Person): Promise<string | null> {
  // A linked wallet's work is shown under its FID, so its byline links to the FID's profile.
  const fid = person < 0 ? (await linkedTo(db(), [person]).catch(() => new Map<number, number>())).get(person) : undefined;
  if (fid) return profileHandle(fid);
  const handle = await handleFor(person).catch(() => null);
  if (!handle) return null;
  const w = await publicWork(person, handle).catch(() => null);
  return w && (w.scenes.length || w.frames.length || w.boards.length) ? handle : null;
}
