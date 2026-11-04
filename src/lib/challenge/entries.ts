import 'server-only';
import type postgres from 'postgres';
import { remixLines } from './lineage';
import { refusedBases } from './bases';
import { baseStyleOrder, basesOf, remixOfBase } from './rules';
import { CHALLENGE, WORK_ID } from '../config';
import { challengeVisibleTo } from './visibility';
import { bookCharacter } from '../images/designs';
import { chooseEntries, entrantCounts, fromDecision, type Decision, inWindow, markKey, newestFirst, phase, shortDateText, type Candidate, type Eligibility } from './rules';

/**
 * The remix challenge's entries (owner, 2026-10-31), the server half, for pages. Reads published sheets, the private
 * marks (studio.challenge_marks) and the eligibility decided once at publish (studio.challenge_eligibility, written by
 * src/lib/challenge/record.ts; both 0033_remix_challenge.sql). It never asks Neynar or anyone else anything: viewing a
 * page makes no outside call (owner, 2026-10-31; scripts/test-challenge.ts proves it). Without the eligibility table,
 * only invited makers count (decided from the lists alone); without the marks table everyone's latest version counts
 * and marking answers "not available yet" (as src/lib/picks.ts does without its table).
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
        person: maker > 0 ? maker : 0, createdAt: new Date(r.created_at).toISOString(), forked: remixOfBase(character, lines.get(String(r.element_id)) ?? [], CHALLENGE.bases, refused),
        versionNo: Number(r.version_no), title: b.title ?? '', byName: b.by_name ?? null, thumb: b.views?.front?.url ?? b.samples?.[0]?.url ?? null,
      };
    })
    .filter((v) => inWindow(v.createdAt))
    .sort(newestFirst);
}

// The marks table may not exist yet: remembered for a minute, like src/lib/picks.ts.
let missingUntil = 0;
const missing = (e: unknown) => (e as { code?: string }).code === '42P01';

/** Each person's mark per character (the latest row counts). Empty without the table. */
export async function readMarks(sql: Sql): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (Date.now() < missingUntil) return out;
  try {
    const rows = await sql<{ fid: string; character: string; version_id: string }[]>`
      select distinct on (fid, character) fid, character, version_id from studio.challenge_marks
      where challenge = ${CHALLENGE.id} order by fid, character, marked_at desc, id desc`;
    for (const r of rows) out.set(markKey(Number(r.fid), r.character), String(r.version_id));
  } catch (e) {
    if (missing(e)) missingUntil = Date.now() + 60_000;
    else console.error('challenge: marks not read', (e as { code?: string }).code ?? (e as Error).name);
  }
  return out;
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
  /** Per character, how many different eligible people have entered it (a count, not a ranking). */
  entrants: Map<string, number>;
}

/** The entries so far, and the admins' versions, each newest first. Nothing while CHALLENGE.entries is off. */
export async function standing(sql: Sql): Promise<Standing> {
  if (!CHALLENGE.entries) return { entries: [], byAdmins: [], entrants: entrantCounts([]) };
  const versions = (await windowVersions(sql)).filter((v) => v.forked);
  const elig = await eligibilityOf(sql, versions);
  const marks = await readMarks(sql);
  const entries = chooseEntries(versions.filter((v) => elig.get(v.versionId)?.eligible === true), marks, () => true);
  const byAdmins = versions.filter((v) => elig.get(v.versionId)?.why === 'admin');
  return { entries, byAdmins, entrants: entrantCounts(entries) };
}

export type VersionStanding = { kind: 'entry'; character: string } | { kind: 'admin' } | { kind: 'candidate'; character: string } | null;

/**
 * What a version page shows: "Entry" when it is its maker's entry for the character; the admin line for an admin's
 * version in the window; otherwise nothing (a person's eligibility is never shown).
 */
export async function versionStanding(sql: Sql, versionId: string): Promise<VersionStanding> {
  if (!CHALLENGE.entries) return null;
  const all = (await windowVersions(sql)).filter((v) => v.forked);
  const v = all.find((x) => x.versionId === versionId);
  if (!v) return null;
  const mine = all.filter((x) => x.person === v.person && x.maker === v.maker && x.character === v.character);
  const elig = await eligibilityOf(sql, mine);
  const e = elig.get(v.versionId);
  if (e?.why === 'admin') return { kind: 'admin' };
  if (!e?.eligible) return null;
  const chosen = chooseEntries(mine.filter((x) => elig.get(x.versionId)?.eligible === true), await readMarks(sql), () => true)[0];
  return chosen?.versionId === versionId ? { kind: 'entry', character: v.character } : { kind: 'candidate', character: v.character };
}

/**
 * What the publish confirmation says about the remix challenge (owner, 2026-11-03), read right after the decision is
 * stored (src/lib/challenge/record.ts): 'entry' when the new version is its maker's entry for the character, 'unchecked'
 * when Neynar didn't answer at publish, so it doesn't count. Otherwise nothing. No outside call: the stored decision
 * and the lists only. Never throws: a confirmation without the line is better than a publish that seems to fail.
 */
export async function publishStanding(sql: Sql, versionId: string): Promise<{ kind: 'entry' | 'unchecked'; character: string } | null> {
  // Nothing is said at publish until the owner opens the challenge (CHALLENGE.public; owner, 2026-11-04).
  if (!CHALLENGE.entries || !CHALLENGE.public) return null;
  try {
    const s = await versionStanding(sql, versionId);
    if (s?.kind === 'entry') return s;
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

export type MarkResult = { ok: true } | { ok: false; why: string; status: number };
export const MARK_WORDING = {
  off: 'Entries aren’t open yet.',
  /** Before the window (owner, 2026-11-03: not "Entries are closed"), its date built from CHALLENGE.dates. */
  opens: () => `Entries open ${shortDateText('opens')}.`,
  closed: 'Entries are closed.',
  notYours: 'You can mark only your own version, made during the challenge.',
  notYet: 'Marking another version isn’t available yet. Your latest version counts.',
};

/** Mark one of your own versions in the window as your entry for its character (the latest mark counts). */
export async function markEntry(sql: Sql, fid: number, versionId: string, now = new Date()): Promise<MarkResult> {
  if (!CHALLENGE.entries) return { ok: false, why: MARK_WORDING.off, status: 503 };
  // Until the owner opens the challenge (CHALLENGE.public; owner, 2026-11-04), only admins may mark, to test it; an
  // admin's version is never an entry (admins aren't eligible), so their marks change no one's standing.
  if (!challengeVisibleTo(fid)) return { ok: false, why: MARK_WORDING.off, status: 503 };
  if (phase(now) === 'before') return { ok: false, why: MARK_WORDING.opens(), status: 409 };
  if (!inWindow(now)) return { ok: false, why: MARK_WORDING.closed, status: 409 };
  const v = (await windowVersions(sql)).find((x) => x.versionId === versionId && x.forked);
  if (!v || v.person !== fid) return { ok: false, why: MARK_WORDING.notYours, status: 403 };
  try {
    await sql`insert into studio.challenge_marks ${sql({ challenge: CHALLENGE.id, fid, character: v.character, version_id: versionId })}`;
    return { ok: true };
  } catch (e) {
    if (missing(e)) return { ok: false, why: MARK_WORDING.notYet, status: 503 };
    throw e;
  }
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
