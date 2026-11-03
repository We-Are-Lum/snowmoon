import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter, designByVersion } from '../images/designs';
import { PRIVACY } from '../legal';
import { phase } from './rules';

/**
 * CHALLENGE.openSheets (on, owner 2026-10-31): while the entry window is open, people outside the invited list
 * may fork a challenge character's sheet, and add versions to their own forks, and make the views for them. They still
 * pass the Generate gate (a Neynar score of at least IMAGES.neynarMinScore), consent, the daily counts and the spend
 * caps, as everywhere. Every other design (styles, places, other characters, new sheets from nothing) stays
 * invited-only (owner, 2026-10-10).
 */
type Sql = postgres.Sql;

/**
 * Whether the Privacy page (the owner's reread words) describes the remix challenge yet. Legal texts describe today
 * (owner, 2026-10-18): opening sheets to everyone waits for them, whatever the switch says.
 */
export const privacyDescribesChallenge = (privacy = PRIVACY) => /remix challenge/i.test((privacy.sections.find((s) => s.n === 4)?.body ?? []).flat().join(' '));

/** Sheets open to everyone who passes the gate: the switch, inside the entry window (from CHALLENGE.dates), once Privacy says so. */
export const challengeSheetsOpen = (now = new Date(), privacy = PRIVACY) => CHALLENGE.openSheets && phase(now) === 'open' && privacyDescribesChallenge(privacy);

export const isChallengeCharacter = (entityName: string) => CHALLENGE.characters.some((s) => bookCharacter(s)?.name === entityName);

/** May someone outside the invited list publish this design now? A fork of, or a version on, a challenge character's sheet. */
export async function openForChallenge(sql: Sql, mode: string, kind: string, from: unknown): Promise<boolean> {
  if (!challengeSheetsOpen() || kind !== 'character' || (mode !== 'fork' && mode !== 'version') || typeof from !== 'string') return false;
  const src = await designByVersion(sql, from).catch(() => null);
  return Boolean(src && src.kind === 'character' && isChallengeCharacter(src.entity));
}
