import 'server-only';
import { isAdmin } from '../admins';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { checkNeynar, shown } from './neynar';
import { recheckAt } from '../checks/decisions';
import { prepaidOpen, priceUsd } from '../wallet/credits';
import { holdsPersonBalance, personBalanceOn, personBalanceUsd } from '../balance/person';
import { IMAGE_WORDING } from './wording';
import { isSocialPerson, isWalletPerson } from '../people';
import { freeFor } from '../social/free';
import { kindOf, linkedOn, missingNetworks, personPasses, readPersonOf } from '../linked/accounts';
import { LINKED_WORDING } from '../linked/wording';

/**
 * Who may press Generate (decision 11, owner 2026-10-09), decided before anything is counted or
 * reserved: no daily count used, no spend reserved, no prompt check, no image model.
 *
 * - Invited FIDs (IMAGES.invited) go straight through: no lookup.
 * - Everyone else waits for the owner's launch order, enforced here: the Terms and Privacy pages
 *   are in this build (APP_LEGAL_PAGES, set by next.config.ts from the page files themselves at
 *   build time) and report alerts are set up (SNOWMOON_ALERT_URL). Until both, they are refused.
 * - Then the Neynar user score, at least IMAGES.neynarMinScore. Only the decision is kept: a pass is used for 90 days
 *   and a fail for 24 hours without asking again (src/lib/checks/decisions.ts). If Neynar can't be reached, refused.
 * - Wallet accounts (fid below zero; owner, 2026-10-13): payment replaces the score. They wait for
 *   the same launch order, and for prepaid to be open (IMAGES.prepaid.payTo set). Their balance is
 *   checked when the Generate is counted (limits.ts).
 * - Lens and Bluesky accounts (branch signin-lens-bluesky): free only as src/lib/social/free.ts decides (a Bluesky
 *   account must be linked to a Farcaster or Lens account; a Lens account needs the owner's Lens score threshold).
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
  /** A kept fail: the score isn't kept, so only when it was checked and when it can be checked again. */
  belowKept: (recheck: Date, now = new Date()) =>
    `Image making is open to Farcaster accounts with a Neynar score of ${IMAGES.neynarMinScore} or more, to keep out spam accounts. Yours was below that when we last checked; we can check again in about ${Math.max(1, Math.ceil((recheck.getTime() - now.getTime()) / 3_600_000))} ${Math.max(1, Math.ceil((recheck.getTime() - now.getTime()) / 3_600_000)) === 1 ? 'hour' : 'hours'}. Reading, listening, saving cards and everything else still work.`,
} as const;

export type Gate =
  | { ok: true; paidOnly?: boolean }
  | {
      ok: false;
      status: 403 | 503;
      error: string;
      reason: 'not-open' | 'unreachable' | 'score' | 'prepaid-closed' | 'link-needed' | 'lens-not-open' | 'lens-score' | 'lens-unreachable' | 'bluesky-new' | 'bluesky-idle' | 'bluesky-failed' | 'bluesky-unreachable';
      /** Linked accounts (on): the per-network detail, shown under "Why?" (owner, 2026-11-04, 10.1). */
      why?: string;
      /** Linked accounts (on): the networks the person could still link, for "Link another account". */
      canLink?: ('farcaster' | 'lens' | 'bluesky')[];
    };

/** The owner's launch order: both legal pages built, and the alert set. Names only in the log. */
export function openToEveryone(): { open: boolean; missing: string[] } {
  const missing: string[] = [];
  if (process.env.APP_LEGAL_PAGES !== 'terms+privacy') missing.push('Terms and Privacy pages');
  if (!process.env.SNOWMOON_ALERT_URL) missing.push('SNOWMOON_ALERT_URL');
  return { open: missing.length === 0, missing };
}

/**
 * Who may press Generate. `orPay` (owner, 2026-11-04, paying per person; PERSON_BALANCE): for a Generate that can be
 * paid from a person balance (Pictures, a sheet's views), a Farcaster, Lens or Bluesky person whom the free check
 * refuses (the Neynar score, Neynar unreachable, the Lens score or the Bluesky check) may still go on with
 * `paidOnly`, if their balance covers this Generate's price: paying never makes an entry, and wallet accounts already
 * pay without a score. Free generations still need the check. The launch order applies to everyone.
 */
export async function mayGenerate(sql: Sql, fid: number, orPay?: { reserveUsd: number }): Promise<Gate> {
  const g = await freeGate(sql, fid);
  if (g.ok || !orPay || g.reason === 'not-open' || !personBalanceOn() || !holdsPersonBalance(fid)) return g;
  const balance = await personBalanceUsd(sql, fid).catch(() => 0);
  return balance >= priceUsd(orPay.reserveUsd) ? { ok: true, paidOnly: true } : g;
}

/**
 * Linked accounts (LINKED_ACCOUNTS, off; src/lib/linked/accounts.ts): a person passes if any linked account has a
 * current pass (v2: a sign-in in its 30-day wait is in no Snowmoon account, so there is no wait to check here); and a
 * refusal by a check offers the next step (the approved words of 2026-11-04): link a network not linked yet, or prepay.
 */
async function freeGate(sql: Sql, fid: number): Promise<Gate> {
  const g = await accountGate(sql, fid);
  // A wallet pays (no free count to withhold); the launch order and closed prepaid stand as they are.
  if (!linkedOn() || isWalletPerson(fid) || (!g.ok && (g.reason === 'not-open' || g.reason === 'prepaid-closed'))) return g;
  if (g.ok) return g;
  if (await personPasses(sql, fid)) return { ok: true };
  if (g.reason === 'unreachable' || g.reason === 'lens-unreachable') return g;
  const members = (await readPersonOf(sql, fid))?.members ?? [{ kind: (await kindOf(sql, fid)) ?? 'farcaster', account: fid }];
  const canLink = missingNetworks(members);
  return { ...g, error: LINKED_WORDING.refusal(canLink).join(' '), why: g.error, canLink };
}

async function accountGate(sql: Sql, fid: number): Promise<Gate> {
  // Invited FIDs and admins (admin caps, owner 2026-10-29) skip the score.
  if (IMAGES.invited.includes(fid) || isAdmin(fid)) return { ok: true };
  const launch = openToEveryone();
  if (!launch.open) {
    console.error('images: not open to everyone yet; missing', launch.missing.join(', '));
    return { ok: false, status: 503, error: GATE_WORDING.notOpen, reason: 'not-open' };
  }
  if (isSocialPerson(fid)) {
    const d = await freeFor(sql, fid);
    return d.free ? { ok: true } : { ok: false, status: d.reason === 'lens-unreachable' || d.reason === 'bluesky-unreachable' ? 503 : 403, error: d.error, reason: d.reason };
  }
  if (fid < 0) return prepaidOpen() ? { ok: true } : { ok: false, status: 503, error: IMAGE_WORDING.prepaid.notOpen, reason: 'prepaid-closed' };
  const r = await checkNeynar(sql, fid, IMAGES.neynarMinScore);
  if (!r.ok) {
    console.error('images: Neynar check failed', r.why);
    return { ok: false, status: 503, error: GATE_WORDING.unreachable, reason: 'unreachable' };
  }
  if (!r.passed) return { ok: false, status: 403, error: refusalFor(r), reason: 'score' };
  return { ok: true };
}

/** A refusal's words: the score if Neynar was just asked, otherwise when it can be asked again. */
export function refusalFor(r: { score: number | null; decidedAt: Date }): string {
  return r.score !== null ? GATE_WORDING.below(r.score) : GATE_WORDING.belowKept(recheckAt({ passed: false, decidedAt: r.decidedAt }));
}
