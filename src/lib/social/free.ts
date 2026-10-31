import 'server-only';
import type postgres from 'postgres';
import { SOCIAL_SIGN_IN } from '../config';
import { isSocialPerson, socialAccountOf } from '../people';
import { socialAccount } from './accounts';
import { lensScore } from './lens';

/**
 * Free generations for Lens and Bluesky sign-ins (owner's item 5, 2026-10-31: "Free generations come only by linking a
 * Farcaster or Lens account").
 *
 * Today a Farcaster account gets the free daily counts (Pictures: IMAGES.generationsPerDay, behind the Neynar score;
 * Remix: REMIX.generationsPerDay) and a wallet account gets none: it pays from its prepaid balance. So:
 * - a Lens or Bluesky account linked to a Farcaster account signs in as that FID (getPerson) and gets its counts;
 * - a Bluesky account linked to a Lens account signs in as that Lens account (or its FID), and gets what it gets;
 * - a Lens account (not linked) gets the free counts only when the owner has set SOCIAL_SIGN_IN.lens.minScore and its
 *   Lens score is at least that; while it is null, none;
 * - a Bluesky account that isn't linked gets none, ever. It has no balance either (only a wallet account has one): to
 *   pay, it signs in with a wallet.
 * Checked at the gate (src/lib/images/gate.ts) and again when a Generate is counted (images and Remix limits), so no
 * route that skips the gate (an agent's approved frame) can hand a Bluesky-only account a free generation.
 *
 * Refusal wording: DRAFT, drafted by the coding agent (Anthropic's Claude, a closed model), for the owner's reread.
 */
type Sql = postgres.Sql;

export const FREE_WORDING = {
  linkNeeded:
    'Free images and frames come with a Farcaster or Lens account. Link one to this Bluesky account, or sign in with a wallet to pay. Reading, notes and everything else still work.',
  lensNotOpen: 'Free images and frames aren’t open to Lens accounts yet. Link a Farcaster account, or sign in with a wallet to pay.',
  lensBelow: (score: number, min: number) => `Free images and frames are open to Lens accounts with a Lens score of ${min} or more, to keep out spam accounts. Yours is ${score}.`,
  /** When a Generate is counted (a route that skipped the gate): the short, general form. */
  none: 'Free images and frames aren’t open to this account. Link a Farcaster account to it, or sign in with a wallet to pay.',
  lensUnreachable: 'We can’t check your Lens account right now (the Lens API can’t be reached). Try again later.',
} as const;

export type FreeDecision = { free: true } | { free: false; reason: 'link-needed' | 'lens-not-open' | 'lens-score' | 'lens-unreachable'; error: string };

/**
 * Whether a person may use the free daily counts. Farcaster accounts: yes (the Neynar gate is separate). Wallet
 * accounts: no (they pay). Lens and Bluesky accounts: as above. `score` is replaced only by the tests.
 */
export async function freeFor(sql: Sql | null, person: number, score: (account: string) => Promise<number | null> = lensScore): Promise<FreeDecision> {
  if (person > 0) return { free: true };
  if (!isSocialPerson(person)) return { free: false, reason: 'link-needed', error: FREE_WORDING.linkNeeded };
  const row = sql ? await socialAccount(sql, socialAccountOf(person)).catch(() => null) : null;
  if (!row || row.kind !== 'lens') return { free: false, reason: 'link-needed', error: FREE_WORDING.linkNeeded };
  const min = SOCIAL_SIGN_IN.lens.minScore;
  if (min === null) return { free: false, reason: 'lens-not-open', error: FREE_WORDING.lensNotOpen };
  const s = await score(row.subject);
  if (s === null) return { free: false, reason: 'lens-unreachable', error: FREE_WORDING.lensUnreachable };
  if (s < min) return { free: false, reason: 'lens-score', error: FREE_WORDING.lensBelow(s, min) };
  return { free: true };
}
