import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, EPISODE, WORK_ID } from '../../config';
import { accountDecision } from '../record';
import { challengePictures } from '../pictures';
import { startingSheets } from '../entries';
import { submissionsOpen, type Card, type Outline } from './rules';
import { EPISODE_WORDING as W } from './wording';

/**
 * Episode 1: the opening (owner, 2026-11-24): the outlines people submit, in studio.challenge_outlines
 * (NEXT_episode_outlines.sql). Drafts never reach the server; an outline is written only at Submit, with the account
 * check's decision made then (once; src/lib/challenge/record.ts accountDecision), and is fixed from then on: Withdraw
 * and a moderator's Hide set a time, and nothing is ever deleted. Lists are newest first and read nothing but the
 * time (P5g, P5i): no like, view or any other count exists for an outline.
 * Every function takes the `sql` it is given, so scripts/test-episode.ts runs them on PGlite.
 */
type Sql = postgres.Sql;

export type Picture = { versionId: string; thumb: string; byName: string | null; byFid: number; href: string; kind: 'image' | 'sheet'; title: string | null };
export type ShownCard = Card & { pic: Picture | null };
export type OutlineRow = {
  id: string;
  byFid: number;
  byName: string | null;
  title: string | null;
  cards: ShownCard[];
  minuteAfter: number;
  submittedAt: string;
  admin: boolean;
  withdrawn: boolean;
  hidden: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isOutlineId = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

/**
 * Published pictures by version id: a reader's image made here (recipes.source 'in_app', so it is AI-made and has its
 * recipe on /image/<id>) or a character sheet whose front view has a recipe (/references/designs/<id>). A hidden or
 * unpublished picture, or anything else, isn't in the answer, so a card that pointed to it shows no picture.
 */
export async function picturesByVersion(sql: Sql, ids: readonly string[]): Promise<Map<string, Picture>> {
  const want = [...new Set(ids.filter((i) => UUID.test(i)))];
  const out = new Map<string, Picture>();
  if (!want.length) return out;
  const rows = await sql`
    select v.id, e.element_type, e.created_by_fid, v.asset_url, v.body, r.params, r.source
    from studio.element_versions v
    join studio.elements e on e.id = v.element_id
    left join studio.recipes r on r.id = v.recipe_id
    where v.id::text in ${sql(want)} and e.work_id = ${WORK_ID} and e.status = 'published' and e.element_type in ('image', 'design')`;
  for (const r of rows) {
    const id = String(r.id);
    if (r.element_type === 'image') {
      if (r.source !== 'in_app' || !r.asset_url) continue;
      const p = (r.params ?? {}) as { by_name?: string };
      out.set(id, { versionId: id, thumb: String(r.asset_url), byName: p.by_name ?? null, byFid: Number(r.created_by_fid), href: `/image/${id}`, kind: 'image', title: null });
    } else {
      const b = (r.body ?? {}) as { title?: string; by_name?: string | null; views?: { front?: { url?: string; recipe?: unknown } } };
      const front = b.views?.front;
      if (!front?.url || !front.recipe) continue;
      out.set(id, { versionId: id, thumb: front.url, byName: b.by_name ?? null, byFid: Number(r.created_by_fid), href: `/references/designs/${id}`, kind: 'sheet', title: b.title ?? null });
    }
  }
  return out;
}

const shape = (r: Record<string, unknown>, pics: Map<string, Picture>): OutlineRow => {
  const cards = (Array.isArray(r.cards) ? r.cards : []) as Card[];
  return {
    id: String(r.id),
    byFid: Number(r.fid),
    byName: (r.by_name as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    cards: cards.map((c) => ({ happens: c.happens, does: c.does, picture: c.picture ?? null, pic: c.picture ? (pics.get(c.picture) ?? null) : null })),
    minuteAfter: Number(r.minute_after),
    submittedAt: new Date(r.submitted_at as string).toISOString(),
    admin: r.decision === 'admin',
    withdrawn: r.withdrawn_at !== null,
    hidden: r.hidden_at !== null,
  };
};

async function withPictures(sql: Sql, rows: Record<string, unknown>[]): Promise<OutlineRow[]> {
  const ids = rows.flatMap((r) => ((Array.isArray(r.cards) ? r.cards : []) as Card[]).map((c) => c.picture).filter((p): p is string => Boolean(p)));
  const pics = await picturesByVersion(sql, ids);
  return rows.map((r) => shape(r, pics));
}

/** Every outline shown on the challenge (not withdrawn, not hidden), newest first. */
export async function listOutlines(sql: Sql, challenge: string = EPISODE.id): Promise<OutlineRow[]> {
  const rows = await sql`
    select * from studio.challenge_outlines
    where challenge = ${challenge} and withdrawn_at is null and hidden_at is null
    order by submitted_at desc, id desc`;
  return withPictures(sql, rows);
}

/** One outline, whatever its state (its page shows "not found" for a withdrawn or hidden one). */
export async function getOutline(sql: Sql, id: string, challenge: string = EPISODE.id): Promise<OutlineRow | null> {
  if (!isOutlineId(id)) return null;
  const rows = await sql`select * from studio.challenge_outlines where id = ${id} and challenge = ${challenge}`;
  return rows.length ? (await withPictures(sql, rows))[0] : null;
}

/** The signed-in person's live outlines (submitted, not withdrawn), newest first, and how many more they may submit. */
export async function myOutlines(sql: Sql, fid: number, challenge: string = EPISODE.id): Promise<{ left: number; ids: string[] }> {
  const rows = await sql`select id from studio.challenge_outlines where challenge = ${challenge} and fid = ${fid} and withdrawn_at is null order by submitted_at desc, id desc`;
  return { left: Math.max(0, EPISODE.livePerPerson - rows.length), ids: rows.map((r) => String(r.id)) };
}

export type Result<T> = ({ ok: true } & T) | { ok: false; why: string; status: number };
type Decide = typeof accountDecision;

/**
 * Submit (owner, 2026-11-24): only with EPISODE.public on and inside the window; every attached picture must be a
 * published one (picturesByVersion); the account's check is run once, now ('admin', 'invited' or 'passed' may
 * submit; 'below' and 'unchecked' are refused and nothing is kept); then, under a lock for the person, at most
 * EPISODE.livePerPerson live outlines. A wallet account never gets here (the route refuses it).
 */
export async function submitOutline(sql: Sql, fid: number, byName: string | null, outline: Outline, opts: { now?: Date; pub?: boolean; dates?: { opens: string; closes: string } | null; decide?: Decide; challenge?: string } = {}): Promise<Result<{ id: string; left: number }>> {
  const now = opts.now ?? new Date();
  const challenge = opts.challenge ?? EPISODE.id;
  if (!submissionsOpen(now, opts.pub ?? EPISODE.public, opts.dates === undefined ? EPISODE.dates : opts.dates)) return { ok: false, why: W.closed, status: 403 };
  const wanted = outline.cards.map((c) => c.picture).filter((p): p is string => Boolean(p));
  if (wanted.length) {
    const found = await picturesByVersion(sql, wanted);
    if (wanted.some((p) => !found.has(p))) return { ok: false, why: W.pictureGone, status: 400 };
  }
  const d = await (opts.decide ?? accountDecision)(sql, fid, now);
  if (!d) return { ok: false, why: W.accountCantSubmit, status: 403 };
  if (d.why !== 'admin' && !d.eligible) return { ok: false, why: d.why === 'unchecked' ? W.checkUnavailable : W.checkNotPassed, status: d.why === 'unchecked' ? 503 : 403 };
  const decision = d.why === 'admin' ? 'admin' : d.why;
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`snowmoon.episode.${challenge}.${fid}`}))`;
    const [{ n }] = await tx`select count(*)::int as n from studio.challenge_outlines where challenge = ${challenge} and fid = ${fid} and withdrawn_at is null`;
    if (n >= EPISODE.livePerPerson) return { ok: false as const, why: W.tooMany(EPISODE.livePerPerson), status: 409 };
    const cards = outline.cards.map((c) => ({ happens: c.happens, does: c.does, picture: c.picture }));
    const [row] = await tx`
      insert into studio.challenge_outlines (challenge, fid, by_name, title, cards, minute_after, decision, submitted_at)
      values (${challenge}, ${fid}, ${byName ? byName.slice(0, 100) : null}, ${outline.title}, ${tx.json(cards)}, ${outline.minuteAfter}, ${decision}, ${now})
      returning id`;
    return { ok: true as const, id: String(row.id), left: EPISODE.livePerPerson - n - 1 };
  }) as Promise<Result<{ id: string; left: number }>>;
}

/** Withdraw one's own live outline, while submissions are open. It stays on record, marked withdrawn. */
export async function withdrawOutline(sql: Sql, fid: number, id: string, opts: { now?: Date; pub?: boolean; dates?: { opens: string; closes: string } | null; challenge?: string } = {}): Promise<Result<{ left: number }>> {
  const now = opts.now ?? new Date();
  const challenge = opts.challenge ?? EPISODE.id;
  if (!submissionsOpen(now, opts.pub ?? EPISODE.public, opts.dates === undefined ? EPISODE.dates : opts.dates)) return { ok: false, why: W.closed, status: 403 };
  if (!isOutlineId(id)) return { ok: false, why: 'Bad request', status: 400 };
  const r = await sql`update studio.challenge_outlines set withdrawn_at = ${now} where id = ${id} and challenge = ${challenge} and fid = ${fid} and withdrawn_at is null returning id`;
  if (!r.length) return { ok: false, why: W.notYours, status: 404 };
  return { ok: true, left: (await myOutlines(sql, fid, challenge)).left };
}

/** A moderator hides an outline (MODERATOR_FIDS; the route checks who). It stays on record, marked hidden, with who and when. */
export async function hideOutline(sql: Sql, moderator: number, id: string, now: Date = new Date(), challenge: string = EPISODE.id): Promise<Result<object>> {
  if (!isOutlineId(id)) return { ok: false, why: 'Bad request', status: 400 };
  const r = await sql`update studio.challenge_outlines set hidden_at = ${now}, hidden_by = ${moderator} where id = ${id} and challenge = ${challenge} and hidden_at is null returning id`;
  return r.length ? { ok: true } : { ok: false, why: 'Not found', status: 404 };
}

export type PictureSource = 'characters' | 'challenge' | 'mine';
export const PICTURE_SOURCES: readonly PictureSource[] = ['characters', 'challenge', 'mine'];
const PICK_LIMIT = 60;

/**
 * What the picture picker offers (no search, no generating): the challenge characters' bases, the remix challenge's
 * published pictures (newest first), or the signed-in person's own published pictures (newest first). Each passes
 * picturesByVersion, so only what a card may carry is offered.
 */
export async function pictureChoices(sql: Sql, from: PictureSource, fid: number | null): Promise<Picture[]> {
  let ids: string[] = [];
  if (from === 'characters') {
    for (const slug of CHALLENGE.characters) ids.push(...(await startingSheets(sql, slug)).map((s) => s.versionId));
  } else if (from === 'challenge') {
    ids = (await challengePictures(sql)).slice(0, PICK_LIMIT).map((p) => p.versionId);
  } else if (fid !== null) {
    const rows = await sql`
      select v.id from studio.elements e join studio.element_versions v on v.element_id = e.id
      where e.created_by_fid = ${fid} and e.work_id = ${WORK_ID} and e.status = 'published' and e.element_type in ('image', 'design')
      order by v.created_at desc, v.id desc limit ${PICK_LIMIT}`;
    ids = rows.map((r) => String(r.id));
  }
  const found = await picturesByVersion(sql, ids);
  return ids.map((i) => found.get(i)).filter((p): p is Picture => Boolean(p));
}
