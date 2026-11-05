import 'server-only';
import type postgres from 'postgres';
import { SOCIAL_SIGN_IN } from '../config';
import { isSocialPerson, socialAccountOf } from '../people';
import { socialAccount } from './accounts';
import { lensDecision } from './lens-check';
import { BLUESKY_CHECK_WORDING, blueskyDecision, keptBlueskyDecision, type BlueskyFacts } from './bluesky-check';

/**
 * Free generations for Lens and Bluesky sign-ins (owner's item 5, 2026-10-31: "Free generations come only by linking a
 * Farcaster or Lens account").
 *
 * Today a Farcaster account gets the free daily counts (Pictures: IMAGES.generationsPerDay, behind the Neynar score;
 * Remix: REMIX.generationsPerDay) and a wallet account gets none: it pays from its prepaid balance. So:
 * - a Lens or Bluesky account linked to a Farcaster account signs in as that FID (getPerson) and gets its counts;
 * - a Bluesky account linked to a Lens account signs in as that Lens account (or its FID), and gets what it gets;
 * - a Lens account (not linked) gets the free counts only when its Lens score is at least SOCIAL_SIGN_IN.lens.minScore
 *   (1,000; owner, 2026-11-04), decided at Generate and kept only as a decision (src/lib/social/lens-check.ts);
 * - a Bluesky account that isn't linked gets them only if it passes the Bluesky check (owner, 2026-11-04; Bluesky's
 *   counterpart of Neynar's score: src/lib/social/bluesky-check.ts) while SOCIAL_SIGN_IN.bluesky.check is on; while
 *   it is off, none, as before. It has no balance either (only a wallet account has one): to pay, it signs in with a
 *   wallet.
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
  /** Never the score itself (owner, 2026-11-04: the score is never stored, logged or returned to the page). */
  lensBelow: (min: number) => `Free images and frames are open to Lens accounts with a Lens score of ${min.toLocaleString('en-US')} or more, to keep out spam accounts. Yours is below that. Link a Farcaster account, or sign in with a wallet to pay.`,
  /** When a Generate is counted (a route that skipped the gate): the short, general form. */
  none: 'Free images and frames aren’t open to this account. Link a Farcaster account to it, or sign in with a wallet to pay.',
  lensUnreachable: 'We can’t check your Lens account right now (the Lens API can’t be reached). Try again later.',
} as const;

export type FreeDecision =
  | { free: true }
  | { free: false; reason: 'link-needed' | 'lens-not-open' | 'lens-score' | 'lens-unreachable' | 'bluesky-new' | 'bluesky-idle' | 'bluesky-failed' | 'bluesky-unreachable'; error: string };

/**
 * Whether a person may use the free daily counts. Farcaster accounts: yes (the Neynar gate is separate). Wallet
 * accounts: no (they pay). Lens and Bluesky accounts: as above. At Generate (the default) a Lens account with no
 * current decision is looked up (src/lib/social/lens-check.ts); `lookUp: false` (the maker opening, the count shown)
 * never asks Lens, and gives null when there is no decision yet: it is made at Generate. `score` is replaced only by
 * the tests.
 */
export async function freeFor(sql: Sql | null, person: number, opts?: { lookUp?: true; score?: (account: string) => Promise<number | null>; bluesky?: (did: string) => Promise<BlueskyFacts> }): Promise<FreeDecision>;
export async function freeFor(sql: Sql | null, person: number, opts: { lookUp: false }): Promise<FreeDecision | null>;
export async function freeFor(
  sql: Sql | null,
  person: number,
  opts: { lookUp?: boolean; score?: (account: string) => Promise<number | null>; bluesky?: (did: string) => Promise<BlueskyFacts> } = {},
): Promise<FreeDecision | null> {
  if (person > 0) return { free: true };
  if (!isSocialPerson(person)) return { free: false, reason: 'link-needed', error: FREE_WORDING.linkNeeded };
  const row = sql ? await socialAccount(sql, socialAccountOf(person)).catch(() => null) : null;
  if (sql && row?.kind === 'bluesky' && SOCIAL_SIGN_IN.bluesky.check.on) {
    // The Bluesky check, decided at Generate as Neynar's score is (only the decision is kept: a pass 90 days, a fail a
    // day). `lookUp: false` (the maker opening, the count shown) never asks Bluesky: null until a decision is made.
    if (opts.lookUp === false) {
      const kept = await keptBlueskyDecision(sql, row.subject).catch(() => null);
      if (kept === null) return null;
      return kept === 'passed' ? { free: true } : { free: false, reason: 'bluesky-failed', error: BLUESKY_CHECK_WORDING.failed() };
    }
    const d = await blueskyDecision(sql, row, opts.bluesky);
    if (!d.ok) return { free: false, reason: 'bluesky-unreachable', error: BLUESKY_CHECK_WORDING.unreachable };
    if (d.decision === 'new') return { free: false, reason: 'bluesky-new', error: BLUESKY_CHECK_WORDING.new() };
    if (d.decision === 'idle') return { free: false, reason: 'bluesky-idle', error: BLUESKY_CHECK_WORDING.idle() };
    if (d.decision === 'failed') return { free: false, reason: 'bluesky-failed', error: BLUESKY_CHECK_WORDING.failed() };
    return { free: true };
  }
  if (!sql || !row || row.kind !== 'lens') return { free: false, reason: 'link-needed', error: FREE_WORDING.linkNeeded };
  const min = SOCIAL_SIGN_IN.lens.minScore;
  if (min === null) return { free: false, reason: 'lens-not-open', error: FREE_WORDING.lensNotOpen };
  const d = await lensDecision(sql, row.subject, { lookUp: opts.lookUp !== false, score: opts.score });
  if (d === 'unknown') return null;
  if (d === 'unreachable') return { free: false, reason: 'lens-unreachable', error: FREE_WORDING.lensUnreachable };
  if (d === 'below') return { free: false, reason: 'lens-score', error: FREE_WORDING.lensBelow(min) };
  return { free: true };
}
