import 'server-only';
import type postgres from 'postgres';
import { remixLines } from './lineage';
import { refusedBases } from './bases';
import { baseStyleOrder, basesOf, isFirstRemix, remixOfBase } from './rules';
import { CHALLENGE, WORK_ID } from '../config';
import { challengeVisibleTo } from './visibility';
import { bookCharacter } from '../images/designs';
import { isSocialPerson } from '../people';
import { chooseEntries, distinctSubmissions, entrantCounts, fromDecision, type Decision, inWindow, newestFirst, phase, shortDateText, submitRefusal, submittedToday, type Candidate, type Eligibility, type Submission } from './rules';
import type { Post } from './post-links';
import { challengePictures, picturesCount } from './pictures';
import { momentById } from './moments';

/**
 * The remix challenge's entries (owner, 2026-10-31; Submit, 2026-11-04), the server half. Reads published sheets, the
 * private submissions (studio.challenge_marks: one row per Submit, its maker's FID, the character and the version) and
 * the eligibility decided once at publish (studio.challenge_eligibility, written by src/lib/challenge/record.ts; both
 * 0033_remix_challenge.sql). A remix becomes an entry only when its maker presses Submit, with a link to a post about
 * it (read and listed as "Add where you posted it" does: src/lib/challenge/posts.ts); one per person per Pacific day
 * (CHALLENGE.submissionsPerDay), checked under a lock; a withdrawn one stays on record (withdrawn_at) and still uses
 * its day (0038_challenge_daily.sql). Viewing a page never asks Neynar or anyone else
 * anything (owner, 2026-10-31; scripts/test-challenge.ts proves it). Without the eligibility table, only invited makers
 * count (decided from the lists alone); without the marks table nothing is an entry and Submit answers "not available
 * yet" (as src/lib/picks.ts does without its table).
 */
type Sql = postgres.Sql;

export interface ChallengeVersion extends Candidate {
  /** The record's maker: a FID (sheets are made with Farcaster only). */
  maker: number;
  versionNo: number;
  title: string;
  byName: string | null;
  thumb: string | null;
}

const names = () => CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
const slugOf = (name: string) => names().find((c) => c.name === name)?.slug ?? '';

/**
 * Versions of published sheets for the challenge's characters made inside the window, each with whether its design is
 * a remix that counts: a fork of one of the character's bases, or of a remix of one (CHALLENGE.bases; while the
 * character has none yet, a fork of any sheet). Newest first.
 */
export async function windowVersions(sql: Sql): Promise<ChallengeVersion[]> {
  // Entries as pictures (CHALLENGE.pictureEntries, branch challenge-moments): the challenge's pictures made in the
  // window, each counting when its line reaches one of its character's bases; sheet remixes no longer count.
  if (CHALLENGE.pictureEntries) return windowPictures(sql);
  const chars = names().map((c) => c.name);
  if (!chars.length) return [];
  const rows = await sql`
    select v.id as version_id, e.id as element_id, en.name, e.created_by_fid, v.created_at, v.version_no, v.body
    from studio.element_versions v
    join studio.elements e on e.id = v.element_id
    join studio.entities en on en.id = e.entity_id
    where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind = 'character' and en.name in ${sql(chars)}
      and v.created_at >= ${CHALLENGE.dates.opens}::timestamptz and v.created_at < ${CHALLENGE.dates.closes}::timestamptz`;
  const lines = await remixLines(sql, [...new Set(rows.map((r) => String(r.element_id)))]);
  const refused = await refusedBases(sql);
  return rows
    .map((r) => {
      const maker = Number(r.created_by_fid);
      const character = slugOf(String(r.name));
      const b = (r.body ?? {}) as { title?: string; by_name?: string | null; samples?: { url: string }[]; views?: { front?: { url: string } } };
      return {
        versionId: String(r.version_id), elementId: String(r.element_id), character, maker,
        person: maker > 0 || isSocialPerson(maker) ? maker : 0, createdAt: new Date(r.created_at).toISOString(), forked: remixOfBase(character, lines.get(String(r.element_id)) ?? [], CHALLENGE.bases, refused),
        versionNo: Number(r.version_no), title: b.title ?? '', byName: b.by_name ?? null, thumb: b.views?.front?.url ?? b.samples?.[0]?.url ?? null,
      };
    })
    // The owner's first remixes (CHALLENGE.firstRemixes) are shown on /challenge, never as entries (owner, 2026-11-04).
    .filter((v) => inWindow(v.createdAt) && !isFirstRemix(v))
    .sort(newestFirst);
}

/** The challenge's pictures made inside the window, as entry candidates (one version each), newest first. */
export async function windowPictures(sql: Sql): Promise<ChallengeVersion[]> {
  const pics = (await challengePictures(sql)).filter((p) => inWindow(p.createdAt) && !isFirstRemix(p));
  const counts = await picturesCount(sql, pics);
  return pics
    .map((p) => ({
      versionId: p.versionId, elementId: p.elementId, character: p.character, maker: p.byFid,
      person: p.byFid > 0 || isSocialPerson(p.byFid) ? p.byFid : 0, createdAt: p.createdAt, forked: counts.get(p.versionId) === true,
      versionNo: 1, title: momentById(p.moment)?.title ?? '', byName: p.byName, thumb: p.thumb,
    }))
    .sort(newestFirst);
}

/** A version's page in the challenge: a picture's own page while entries are pictures, the sheet's page otherwise. */
export const entryHref = (versionId: string) => (CHALLENGE.pictureEntries ? `/challenge/p/${versionId}` : `/references/designs/${versionId}`);

// The marks table may not exist yet: remembered for a minute, like src/lib/picks.ts.
let missingUntil = 0;
const missing = (e: unknown) => (e as { code?: string }).code === '42P01';
/** studio.challenge_marks without withdrawn_at: 0038_challenge_daily.sql isn't applied yet. */
const noColumn = (e: unknown) => (e as { code?: string }).code === '42703';

/** Every standing submission (one row per Submit; a withdrawn one is left out). Empty without the table or its column. */
export async function readSubmissions(sql: Sql): Promise<Submission[]> {
  if (Date.now() < missingUntil) return [];
  try {
    const rows = await sql<{ fid: string; character: string; version_id: string; marked_at: Date }[]>`
      select fid, character, version_id, marked_at from studio.challenge_marks where challenge = ${CHALLENGE.id} and withdrawn_at is null order by marked_at, id`;
    return distinctSubmissions(rows.map((r) => ({ person: Number(r.fid), character: r.character, versionId: String(r.version_id), at: new Date(r.marked_at).toISOString() })));
  } catch (e) {
    if (missing(e) || noColumn(e)) missingUntil = Date.now() + 60_000;
    else console.error('challenge: submissions not read', (e as { code?: string }).code ?? (e as Error).name);
    return [];
  }
}

let eligibilityMissingUntil = 0;

/**
 * The eligibility stored for each version (decided at publish). A version with no stored decision counts only if its
 * maker is invited (and not an admin), which the lists alone decide; no score is ever looked up here.
 */
export async function eligibilityOf(sql: Sql, versions: ChallengeVersion[]): Promise<Map<string, Eligibility>> {
  const out = new Map<string, Eligibility>();
  if (!versions.length) return out;
  const stored = new Map<string, Decision>();
  if (Date.now() >= eligibilityMissingUntil) {
    try {
      const rows = await sql<{ version_id: string; decision: Decision }[]>`
        select version_id, decision from studio.challenge_eligibility where challenge = ${CHALLENGE.id} and version_id in ${sql(versions.map((v) => v.versionId))}`;
      for (const r of rows) stored.set(String(r.version_id), r.decision);
    } catch (e) {
      if (missing(e)) eligibilityMissingUntil = Date.now() + 60_000;
      else console.error('challenge: eligibility not read', (e as { code?: string }).code ?? (e as Error).name);
    }
  }
  for (const v of versions) out.set(v.versionId, fromDecision(v.maker, stored.get(v.versionId) ?? null));
  return out;
}

export interface Standing {
  entries: ChallengeVersion[];
  /** Versions admins made in the window: shown plainly as not eligible for rewards. */
  byAdmins: ChallengeVersion[];
  /** Per character, how many different eligible people submitted an entry for it (a count, not a ranking). */
  entrants: Map<string, number>;
}

/** The entries so far (submitted), and the admins' versions, each newest first. Nothing while CHALLENGE.entries is off. */
export async function standing(sql: Sql): Promise<Standing> {
  if (!CHALLENGE.entries) return { entries: [], byAdmins: [], entrants: entrantCounts([]) };
  const versions = (await windowVersions(sql)).filter((v) => v.forked);
  const submissions = await readSubmissions(sql);
  const elig = await eligibilityOf(sql, versions);
  const entries = chooseEntries(versions.filter((v) => elig.get(v.versionId)?.eligible === true), submissions, () => true);
  const byAdmins = versions.filter((v) => elig.get(v.versionId)?.why === 'admin');
  return { entries, byAdmins, entrants: entrantCounts(entries) };
}

export type VersionStanding = { kind: 'entry'; character: string } | { kind: 'admin' } | { kind: 'candidate'; character: string } | null;

/**
 * What a version page shows: "Entry" once its maker submitted it; for an eligible remix not submitted yet,
 * 'candidate' (its maker sees Submit); the admin line for an admin's version in the window; otherwise nothing (a
 * person's eligibility is never shown).
 */
export async function versionStanding(sql: Sql, versionId: string): Promise<VersionStanding> {
  if (!CHALLENGE.entries) return null;
  const v = (await windowVersions(sql)).find((x) => x.versionId === versionId && x.forked);
  if (!v) return null;
  const e = (await eligibilityOf(sql, [v])).get(v.versionId);
  if (e?.why === 'admin') return { kind: 'admin' };
  if (!e?.eligible) return null;
  const entered = chooseEntries([v], await readSubmissions(sql), () => true).length > 0;
  return { kind: entered ? 'entry' : 'candidate', character: v.character };
}

/**
 * What the publish confirmation says about the remix challenge (owner, 2026-11-03; Submit, 2026-11-04), read right
 * after the decision is stored (src/lib/challenge/record.ts): 'candidate' when the new version can be entered (its
 * maker presses Submit on its page), 'unchecked' when Neynar didn't answer at publish, so it can't. Otherwise nothing.
 * No outside call: the stored decision and the lists only. Never throws: a confirmation without the line is better
 * than a publish that seems to fail.
 */
export async function publishStanding(sql: Sql, versionId: string): Promise<{ kind: 'candidate' | 'unchecked'; character: string } | null> {
  // Nothing is said at publish until the owner opens the challenge (CHALLENGE.public; owner, 2026-11-04).
  if (!CHALLENGE.entries || !CHALLENGE.public) return null;
  try {
    const s = await versionStanding(sql, versionId);
    if (s?.kind === 'candidate' || s?.kind === 'entry') return { kind: 'candidate', character: s.character };
    if (s) return null;
    const [r] = await sql<{ decision: string }[]>`select decision from studio.challenge_eligibility where version_id = ${versionId} and challenge = ${CHALLENGE.id}`;
    if (r?.decision !== 'unchecked') return null;
    const v = (await windowVersions(sql)).find((x) => x.versionId === versionId && x.forked);
    return v ? { kind: 'unchecked', character: v.character } : null;
  } catch (e) {
    console.error('challenge: standing at publish not read', (e as { code?: string }).code ?? (e as Error).name);
    return null;
  }
}

export type SubmitResult = { ok: true; left: number } | { ok: false; why: string; status: number };
export const SUBMIT_WORDING = {
  off: 'Entries aren’t open yet.',
  /** Before the window (owner, 2026-11-03: not "Entries are closed"), its date built from CHALLENGE.dates. */
  opens: () => `Entries open ${shortDateText('opens')}.`,
  closed: 'Entries are closed.',
  notYours: 'You can submit only your own remix, made during the challenge.',
  /** From the open date to the close, for its maker's picture published before entries opened (owner, 2026-11-07, approved). */
  beforeOpen: 'This picture was made before entries opened, so it can’t be entered. Remix it to make a new one.',
  notEligible: 'This version can’t be entered: your account didn’t pass the site’s check when you published it.',
  needsPost: 'Add the link to a post about it on Farcaster, Bluesky or Lens first.',
  /** Draft wording (owner, 2026-11-04, answer 9.4: the post must be the submitter's own). */
  notYourPost: 'That post isn’t from your account. Submit a post you wrote.',
  /** Draft wording: a Bluesky post from someone not signed in with that Bluesky account (see writerCheck). */
  blueskyUnknown: 'We can’t tell that this Bluesky post is yours. Sign in with that Bluesky account to submit it, or submit a post from the account you’re signed in with.',
  /** Draft wording (overnight run 2026-11-05): a Lens post from someone not signed in with that Lens account. */
  lensUnknown: 'We can’t tell that this Lens post is yours. Sign in with that Lens account to submit it, or submit a post from the account you’re signed in with.',
  /** Draft wording: a wallet account can't enter (only Farcaster, Lens and Bluesky accounts can). */
  walletCantSubmit: 'Sign in with Farcaster, Lens or Bluesky to submit your remix.',
  already: 'You’ve already submitted this version.',
  /** Draft wording (branch contest, 2026-11-04): one submission per Pacific day. */
  today: 'You’ve already submitted a remix today. You can submit one each day (Pacific time), so come back tomorrow.',
  notYet: 'Submitting isn’t available yet.',
  withdrawNotYours: 'You can withdraw only your own submission.',
  withdrawNotYet: 'Withdrawing isn’t available yet.',
};

/**
 * Submit (owner, 2026-11-04): the maker's own remix, made in the window, eligible as stored at publish, with a post
 * that links to its page (the caller reads and checks it first: src/lib/challenge/posts.ts, verifiedPost). Under one
 * lock per person: one a Pacific day (CHALLENGE.submissionsPerDay; withdrawn ones count for their day) and "each
 * version once", then the post is listed on the version's page (as "Add where you posted it" lists it) and the
 * submission written, in one transaction. Returns how many more this person may submit today.
 */
export async function submitEntry(sql: Sql, fid: number, versionId: string, post: Post | null, now = new Date()): Promise<SubmitResult> {
  if (!CHALLENGE.entries || !CHALLENGE.posts) return { ok: false, why: SUBMIT_WORDING.off, status: 503 };
  // Until the owner opens the challenge (CHALLENGE.public; owner, 2026-11-04), only admins may submit, to test it; an
  // admin's version is never eligible, so it is refused below and changes no one's standing.
  if (!challengeVisibleTo(fid)) return { ok: false, why: SUBMIT_WORDING.off, status: 503 };
  if (phase(now) === 'before') return { ok: false, why: SUBMIT_WORDING.opens(), status: 409 };
  if (!inWindow(now)) return { ok: false, why: SUBMIT_WORDING.closed, status: 409 };
  const v = (await windowVersions(sql)).find((x) => x.versionId === versionId && x.forked);
  if (!v || v.person !== fid) {
    // Its maker's picture, published before entries opened (owner, 2026-11-07): for trying it out, never an entry.
    const [early] = CHALLENGE.pictureEntries ? await challengePictures(sql, { versionId }) : [];
    if (early && early.byFid === fid && Date.parse(early.createdAt) < Date.parse(CHALLENGE.dates.opens)) return { ok: false, why: SUBMIT_WORDING.beforeOpen, status: 403 };
    return { ok: false, why: SUBMIT_WORDING.notYours, status: 403 };
  }
  if ((await eligibilityOf(sql, [v])).get(v.versionId)?.eligible !== true) return { ok: false, why: SUBMIT_WORDING.notEligible, status: 403 };
  if (!post) return { ok: false, why: SUBMIT_WORDING.needsPost, status: 400 };
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('snowmoon.challenge.submit'), ${fid}::int)`;
      // Every row of theirs, withdrawn ones included: a withdrawn submission still uses its day.
      const theirs = await tx<{ version_id: string; marked_at: Date; character: string; withdrawn_at: Date | null }[]>`
        select version_id, marked_at, character, withdrawn_at from studio.challenge_marks where challenge = ${CHALLENGE.id} and fid = ${fid}`;
      const subs = theirs.map((r) => ({ person: fid, versionId: String(r.version_id), character: r.character, at: new Date(r.marked_at).toISOString(), withdrawnAt: r.withdrawn_at ? new Date(r.withdrawn_at).toISOString() : null }));
      const refusal = submitRefusal({ person: fid, versionId }, subs, now);
      if (refusal === 'already') return { ok: false as const, why: SUBMIT_WORDING.already, status: 409 };
      if (refusal === 'today') return { ok: false as const, why: SUBMIT_WORDING.today, status: 409 };
      await tx`insert into studio.version_posts ${tx({ version_id: versionId, network: post.network, post_id: post.id, handle: post.handle, posted_at: post.at, url: post.url, fid })}
        on conflict (version_id, network, post_id) do nothing`;
      await tx`insert into studio.challenge_marks ${tx({ challenge: CHALLENGE.id, fid, character: v.character, version_id: versionId })}`;
      return { ok: true as const, left: Math.max(0, CHALLENGE.submissionsPerDay - submittedToday(subs, now) - 1) };
    });
  } catch (e) {
    if (missing(e) || noColumn(e)) return { ok: false, why: SUBMIT_WORDING.notYet, status: 503 };
    throw e;
  }
}

/**
 * Withdraw a submission (proposed to the owner, 2026-11-04): its maker may, until entries close. It is no longer an
 * entry, but it stays on record (withdrawn_at is set; nothing is deleted) and still uses its day (branch contest,
 * 2026-11-04), and the post stays listed. Needs studio_writer's update of withdrawn_at (0038_challenge_daily.sql);
 * without it, "not available yet".
 */
export async function withdrawEntry(sql: Sql, fid: number, versionId: string, now = new Date()): Promise<SubmitResult> {
  if (!CHALLENGE.entries) return { ok: false, why: SUBMIT_WORDING.off, status: 503 };
  if (!inWindow(now)) return { ok: false, why: SUBMIT_WORDING.closed, status: 409 };
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('snowmoon.challenge.submit'), ${fid}::int)`;
      const gone = await tx`update studio.challenge_marks set withdrawn_at = now() where challenge = ${CHALLENGE.id} and fid = ${fid} and version_id = ${versionId} and withdrawn_at is null returning id`;
      if (!gone.length) return { ok: false as const, why: SUBMIT_WORDING.withdrawNotYours, status: 404 };
      const rows = await tx<{ marked_at: Date }[]>`select marked_at from studio.challenge_marks where challenge = ${CHALLENGE.id} and fid = ${fid}`;
      return { ok: true as const, left: Math.max(0, CHALLENGE.submissionsPerDay - submittedToday(rows.map((r) => ({ at: new Date(r.marked_at).toISOString() })), now)) };
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (missing(e) || noColumn(e) || code === '42501') return { ok: false, why: SUBMIT_WORDING.withdrawNotYet, status: 503 };
    throw e;
  }
}

/** How many more this person may submit today (Pacific), and which versions stand submitted (their own pages only). */
export async function mySubmissions(sql: Sql, fid: number, now = new Date()): Promise<{ left: number; versions: string[] }> {
  const mine = (await readSubmissions(sql)).filter((s) => s.person === fid);
  let today = 0;
  try {
    const rows = await sql<{ marked_at: Date }[]>`select marked_at from studio.challenge_marks where challenge = ${CHALLENGE.id} and fid = ${fid}`;
    today = submittedToday(rows.map((r) => ({ at: new Date(r.marked_at).toISOString() })), now);
  } catch (e) {
    if (!missing(e)) throw e;
  }
  return { left: Math.max(0, CHALLENGE.submissionsPerDay - today), versions: mine.map((s) => s.versionId) };
}

/** `style`: the published style the sheet's views were made in (body.style.title), for the bases' style order. */
type StartingSheet = { versionId: string; title: string; byName: string | null; byFid: number; thumb: string | null; createdAt: string; style: string | null };
const sheetRow = (r: Record<string, unknown>): StartingSheet => {
  const b = (r.body ?? {}) as { title?: string; by_name?: string | null; views?: { front?: { url: string } }; style?: { title?: string } | null };
  return { versionId: String(r.id), title: b.title ?? '', byName: b.by_name ?? null, byFid: Number(r.created_by_fid), thumb: b.views?.front?.url ?? null, createdAt: new Date(r.created_at as string).toISOString(), style: b.style?.title ?? null };
};

/**
 * What to start from. Once the character's bases are picked (CHALLENGE.bases): those, newest first, each a
 * published sheet of this character (an element id at its newest version, a version id as that version); an id
 * that isn't one is left out. Before the picks: published sheets for the character made before the window opened,
 * newest first, as before the three bases.
 */
export async function startingSheets(sql: Sql, slug: string): Promise<StartingSheet[]> {
  const c = bookCharacter(slug);
  if (!c) return [];
  const bases = basesOf(slug);
  if (bases.length) {
    const rows = await sql`
      select distinct on (e.id) v.id, v.body, v.created_at, e.created_by_fid, e.id as element_id from studio.elements e
      join studio.entities en on en.id = e.entity_id
      join studio.element_versions v on v.element_id = e.id
      where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind = 'character' and en.name = ${c.name}
        and (e.id::text in ${sql(bases)} or v.id::text in ${sql(bases)})
      order by e.id, (v.id::text in ${sql(bases)}) desc, v.version_no desc`;
    // A refused base (a closed-model base before CHALLENGE.closedBasesAllowed) is left out.
    const refused = await refusedBases(sql);
    const usable = rows.filter((r) => !refused.has(String(r.element_id)) && !refused.has(String(r.id)));
    // In the bases' fixed style order (CHALLENGE.baseStyles), newest first within a style: the one challenge list not
    // in time order only (P5g allows it here, for the bases; owner, 2026-11-04). With no styles set, newest first.
    return usable.map(sheetRow).sort(newestFirst).sort(baseStyleOrder);
  }
  // Each sheet at its newest version from before the window (distinct on picks it); then newest first.
  const rows = await sql`
    select * from (
      select distinct on (e.id) v.id, v.body, v.created_at, e.created_by_fid from studio.elements e
      join studio.entities en on en.id = e.entity_id
      join studio.element_versions v on v.element_id = e.id
      where e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID} and en.kind = 'character' and en.name = ${c.name}
        and v.created_at < ${CHALLENGE.dates.opens}::timestamptz
      order by e.id, v.version_no desc) x
    order by x.created_at desc limit 24`;
  return rows.map(sheetRow);
}
