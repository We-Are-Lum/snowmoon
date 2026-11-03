import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import { eligibilityOf, readMarks, windowVersions } from '../challenge/entries';
import { chooseEntries } from '../challenge/rules';
import { loadRows } from '../deep-funding/load';
import { buildEntriesRecord, type EntriesRecord } from './record';

/**
 * The challenge record's database half: selects only (the caller runs it inside `sql.begin('read only', …)`). The
 * entries are chosen exactly as /challenge chooses them (src/lib/challenge/entries.ts: forks made in the window by an
 * eligible maker, the marked version or the latest), but without the page's CHALLENGE.entries switch, which only
 * decides whether the page shows them. Then every version they were built on is read (loadRows), and the record built.
 */
type Sql = postgres.Sql;

export const SITE = 'https://snowmoon.party';

export const slugOf = (entityName: string) => CHALLENGE.characters.find((s) => bookCharacter(s)?.name === entityName) ?? null;

export async function readEntriesRecord(sql: Sql): Promise<{ record: EntriesRecord; entries: number; versions: number }> {
  const candidates = (await windowVersions(sql)).filter((v) => v.forked);
  const elig = await eligibilityOf(sql, candidates);
  const marks = await readMarks(sql);
  const entries = chooseEntries(candidates.filter((v) => elig.get(v.versionId)?.eligible === true), marks, () => true);
  const rows = entries.length ? await loadRows(sql, entries.map((e) => e.versionId)) : { versions: new Map(), links: [] };
  const record = buildEntriesRecord({
    challenge: CHALLENGE.id,
    site: SITE,
    window: { opens: CHALLENGE.dates.opens, closes: CHALLENGE.dates.closes },
    characters: CHALLENGE.characters,
    entries: entries.map((e) => ({ versionId: e.versionId, character: e.character })),
    versions: [...rows.versions.values()],
    links: rows.links,
    slugOf,
  });
  return { record, entries: entries.length, versions: record.versions.length };
}
