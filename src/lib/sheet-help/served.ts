import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { CHAT, SHEET_HELP } from '../config';
import type { SheetHelpMark } from '../element-body';
import { helpMark } from './mark';

/**
 * What "Ask for help" served, kept by the server so that publishing labels the recipe (owner, 2026-11-03: "the label
 * must be set by the server, comparing the published prompt with the suggestions it served, not by the browser").
 *
 * When a suggestion passes every check and is shown, studio.sheet_help_served gets one row: the FID, the sheet version
 * it was for (`from`, the version being remixed), when, and a FINGERPRINT of the suggested words (the model's words;
 * never the person's message, the draft or the reply's note): the sha256 of the words normalised (below), and how many
 * words. Not the words themselves: comparing needs only "is this phrase in the published text", which a fingerprint
 * of each phrase answers by hashing every run of that many words in the published text. So a suggestion the person
 * rejected is not kept readable. (A short phrase could still be guessed by someone with database access who hashes
 * candidates; the rows are deleted after SHEET_HELP.servedDays, and no public role can read them.)
 *
 * At publish (src/app/api/designs/route.ts), the design and every picture's recipe are labelled when any row for that
 * FID and that `from` version, under SHEET_HELP.servedDays old, matches a run of words in the published text. The
 * browser plays no part: a device that drops or edits anything is labelled the same.
 *
 * Normalised: lower case; every run of characters that isn't a letter, digit, apostrophe or hyphen is a word break
 * (so case, spaces, line breaks and the commas between parts don't matter).
 */
type Sql = postgres.Sql;

export const words = (s: string) => s.toLowerCase().replace(/[’]/g, "'").split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
export const fingerprint = (ws: string[]) => createHash('sha256').update(`sheet-help.v1\0${ws.join(' ')}`).digest('hex');

/** Every run of n words in the text, fingerprinted. */
export function runs(text: string, n: number): Set<string> {
  const ws = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(fingerprint(ws.slice(i, i + n)));
  return out;
}

/** Record one served suggestion; also deletes rows older than the window. */
export async function recordServed(sql: Sql, fid: number, from: string, after: string): Promise<void> {
  const ws = words(after);
  if (!ws.length) return;
  await sql`delete from studio.sheet_help_served where at < now() - make_interval(days => ${SHEET_HELP.servedDays})`;
  await sql`insert into studio.sheet_help_served (fid, version_id, words_sha256, words_count) values (${fid}, ${from}, ${fingerprint(ws)}, ${ws.length})`;
}

/** Did this person publish, on this sheet, words "Ask for help" served them within the window? */
export async function includesServed(sql: Sql, fid: number, from: unknown, text: string): Promise<boolean> {
  if (typeof from !== 'string' || !/^[0-9a-f-]{36}$/.test(from)) return false;
  const rows = await sql`select words_sha256, words_count from studio.sheet_help_served
    where fid = ${fid} and version_id = ${from} and at > now() - make_interval(days => ${SHEET_HELP.servedDays})`;
  const byLength = new Map<number, Set<string>>();
  for (const r of rows) {
    const n = Number(r.words_count);
    if (!byLength.has(n)) byLength.set(n, runs(text, n));
    if (byLength.get(n)!.has(String(r.words_sha256))) return true;
  }
  return false;
}

/**
 * The label publishing sets (src/app/api/designs/route.ts), from the server's own record only: a fork or version of a
 * character sheet whose text holds words served to this FID for the sheet it came from. Nothing from the browser is
 * read. Until NEXT_sheet_help.sql is applied the table is missing; nothing was served then, so: no label, no failure.
 */
export async function helpLabelFor(sql: Sql, p: { fid: number; mode: string; kind: string; from: unknown; text: string }): Promise<SheetHelpMark | null> {
  if (p.mode === 'create' || p.kind !== 'character') return null;
  return (await includesServed(sql, p.fid, p.from, p.text).catch(() => false)) ? helpMark([{ model: CHAT.model }]) : null;
}
