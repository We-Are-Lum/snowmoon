import { ASSISTANT, IMAGES, SOCIAL_SIGN_IN } from '../config';

/**
 * Who can ask the assistant, in words: the panel's line and the refusals of src/lib/chat/gate.ts (step 1 of "the
 * assistant for any account", owner 2026-11-05). Safe in the browser: the panel and check:ui read the same words.
 *
 * Wording: drafted by the coding agent (Anthropic's Claude, a closed model); "reviewed by the coordinator, approved by
 * the owner" (2026-11-05, docs/legal/assistant-any-account-step1.md), with the owner's fix: a Bluesky refusal names
 * Farcaster or Lens, a Lens refusal Farcaster. While ASSISTANT.anyAccount is off, the lines say what is true then: only a
 * Farcaster account (or one linked to it) asks.
 */
export type AccountKind = 'farcaster' | 'wallet' | 'lens' | 'bluesky';

const BSKY = SOCIAL_SIGN_IN.bluesky.check;
const lensMin = () => (SOCIAL_SIGN_IN.lens.minScore ?? 0).toLocaleString('en-US');
const hours = (recheck: Date, now: Date) => {
  const h = Math.max(1, Math.ceil((recheck.getTime() - now.getTime()) / 3_600_000));
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
};

export const ASK_WORDING = {
  /** The panel's line on who can ask (signed out, and under a refusal). */
  who: () => (ASSISTANT.anyAccount ? 'Asking questions needs a Farcaster, Lens or Bluesky account that passes its check.' : 'Asking questions needs a Farcaster account.'),
  /** A wallet sign-in (not linked to a Farcaster account). */
  wallet: () =>
    ASSISTANT.anyAccount ? 'Asking questions needs a Farcaster, Lens or Bluesky account. Sign in with one to ask.' : 'Asking questions needs a Farcaster account. Sign in with one to ask.',
  /** A Lens or Bluesky sign-in not linked to a Farcaster account, while ASSISTANT.anyAccount is off (today). */
  socialOff: 'Asking questions needs a Farcaster account. Link this account to one, or sign in with Farcaster, to ask.',
  lensNotOpen: 'Asking questions isn’t open to Lens accounts yet. Link it to a Farcaster account that passes its check to ask.',
  /** Never the score itself (the Lens check keeps only the decision). */
  lensBelow: () => `Asking questions is open to Lens accounts with a Lens score of ${lensMin()} or more, to keep out spam accounts. Yours is below that. Link it to a Farcaster account that passes its check to ask.`,
  blueskyNotOpen: 'Asking questions isn’t open to Bluesky accounts yet. Link it to a Farcaster or Lens account that passes its check to ask.',
  blueskyNew: () => `Asking questions is open to Bluesky accounts at least ${BSKY.minAgeDays} days old, to keep out accounts made to use it. Link it to a Farcaster or Lens account that passes its check to ask.`,
  blueskyIdle: () =>
    `Asking questions is open to Bluesky accounts that posted at least ${BSKY.minRecentPosts} times in the last ${BSKY.recentDays} days, to keep out unused accounts. Link it to a Farcaster or Lens account that passes its check to ask.`,
  /** A stored fail: which rule it missed isn't kept, so both are named. */
  blueskyFailed: () =>
    `Asking questions is open to Bluesky accounts at least ${BSKY.minAgeDays} days old that posted at least ${BSKY.minRecentPosts} times in the last ${BSKY.recentDays} days. Yours didn’t pass when we last checked; we can check again a day after that. Link it to a Farcaster or Lens account that passes its check to ask.`,
  /** Only while ASSISTANT.anyAccount is on (the owner's one rule: Farcaster accounts pass Neynar too). */
  neynarBelow: (shown: string) => `Asking questions is open to Farcaster accounts with a Neynar score of ${IMAGES.neynarMinScore} or more, to keep out spam accounts. Yours is ${shown}.`,
  neynarBelowKept: (recheck: Date, now = new Date()) =>
    `Asking questions is open to Farcaster accounts with a Neynar score of ${IMAGES.neynarMinScore} or more, to keep out spam accounts. Yours was below that when we last checked; we can check again in about ${hours(recheck, now)}.`,
  neynarUnreachable: 'The assistant can’t check your account right now (Neynar, which scores Farcaster accounts, can’t be reached). Try again later.',
  /** The account behind a Lens or Bluesky sign-in couldn't be read. */
  accountUnreadable: 'The assistant can’t check your account right now. Try again later.',
} as const;
