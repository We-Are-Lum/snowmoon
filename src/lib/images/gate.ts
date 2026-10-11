import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { lookUp, shown } from './neynar';

/**
 * Who may press Generate (decision 11, owner 2026-10-09), decided before anything is counted or
 * reserved: no daily count used, no spend reserved, no prompt check, no image model.
 *
 * - Invited FIDs (IMAGES.invited) go straight through: no lookup.
 * - Everyone else waits for the owner's launch order, enforced here: the Terms and Privacy pages
 *   are in this build (APP_LEGAL_PAGES, set by next.config.ts from the page files themselves at
 *   build time) and report alerts are set up (SNOWMOON_ALERT_URL). Until both, they are refused.
 * - Then the Neynar user score, at least IMAGES.neynarMinScore. If Neynar can't be reached, refused.
 */
type Sql = postgres.Sql;

/** Refusals shown to the person. Wording drafted by the coding agent (a closed model), for the owner's review. */
export const GATE_WORDING = {
  notOpen:
    'Image making isn’t open to everyone yet. It opens once the Terms and Privacy pages are up and reports reach a moderator. Reading, listening, saving cards and everything else still work.',
  unreachable:
    'Image making can’t check your account right now (Neynar, which scores Farcaster accounts, can’t be reached). Try again later. Reading, listening, saving cards and everything else still work.',
  below: (value: number) =>
    `Image making is open to Farcaster accounts with a Neynar score of ${IMAGES.neynarMinScore} or more, to keep out spam accounts. Yours is ${shown(value)}. Reading, listening, saving cards and everything else still work.`,
} as const;

export type Gate = { ok: true } | { ok: false; status: 403 | 503; error: string; reason: 'not-open' | 'unreachable' | 'score' };

/** The owner's launch order: both legal pages built, and the alert set. Names only in the log. */
export function openToEveryone(): { open: boolean; missing: string[] } {
  const missing: string[] = [];
  if (process.env.APP_LEGAL_PAGES !== 'terms+privacy') missing.push('Terms and Privacy pages');
  if (!process.env.SNOWMOON_ALERT_URL) missing.push('SNOWMOON_ALERT_URL');
  return { open: missing.length === 0, missing };
}

export async function mayGenerate(sql: Sql, fid: number): Promise<Gate> {
  if (IMAGES.invited.includes(fid)) return { ok: true };
  const launch = openToEveryone();
  if (!launch.open) {
    console.error('images: not open to everyone yet; missing', launch.missing.join(', '));
    return { ok: false, status: 503, error: GATE_WORDING.notOpen, reason: 'not-open' };
  }
  const r = await lookUp(sql, fid);
  if (!r.ok) {
    console.error('images: Neynar lookup failed', r.why);
    return { ok: false, status: 503, error: GATE_WORDING.unreachable, reason: 'unreachable' };
  }
  if (r.value < IMAGES.neynarMinScore) return { ok: false, status: 403, error: GATE_WORDING.below(r.value), reason: 'score' };
  return { ok: true };
}
