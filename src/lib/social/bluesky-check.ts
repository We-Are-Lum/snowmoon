import 'server-only';
import type postgres from 'postgres';
import { SOCIAL_SIGN_IN } from '../config';
import { currentDecision, decide } from '../checks/decisions';
import { ATPROTO_HTTP, isDid } from './atproto';

/**
 * The Bluesky check (owner, 2026-11-04): Bluesky's counterpart of Neynar's score. A Bluesky account that isn't linked
 * to a Farcaster or Lens account passes it, and then gets the free daily counts and can remix and enter the remix
 * challenge as a Farcaster account that passes Neynar's score does, if:
 * 1. it was made before SOCIAL_SIGN_IN.bluesky.check.createdBefore (the profile's createdAt, from the AppView), and
 * 2. it posted at least minRecentPosts times in the last recentDays days: its own posts and replies, not reposts,
 *    counted only when both the post's own date and the AppView's indexedAt (Bluesky's clock, which the account can't
 *    set) fall inside the window, so a backdated or future-dated post doesn't count.
 *
 * Asked of Bluesky's public AppView (public.api.bsky.app: app.bsky.actor.getProfile, app.bsky.feed.getAuthorFeed),
 * with the account's DID only, no key, through the same guarded fetch as the sign-in (https, public host, 5 s, no
 * redirects, 100 kB). Decided at Generate (the gate) and at publish (the challenge's eligibility), the same way as
 * Neynar today. Only the decision is kept, in the shared decision store (studio.check_decisions, src/lib/checks/
 * decisions.ts; owner, 2026-11-04: one store for every network): network 'bluesky', the account's DID, whether it
 * passed, when, and the rule it was decided under (thresholdKey, 'made-before-2026-11-06+5posts30d'). A pass lasts
 * CHECKS.passDays (90), a fail is asked again no sooner than CHECKS.failHours (24) later, and any decision is asked
 * again once the rule changes. Why a fail failed (made too late, or too few posts) is not kept either: a fail read
 * back from the store says both rules ('failed'). The dates and counts are compared in memory and forgotten. A failed
 * lookup is never stored.
 *
 * Wording: DRAFT, drafted by the coding agent (Anthropic's Claude, a closed model), for the owner's reread.
 */
type Sql = postgres.Sql;
const RULES = SOCIAL_SIGN_IN.bluesky.check;

/** 'new' and 'idle' come from a lookup just made; 'failed' is a stored fail, whose reason isn't kept. */
export type BlueskyDecision = 'passed' | 'new' | 'idle' | 'failed';
export type BlueskyLookup = { ok: true; decision: BlueskyDecision } | { ok: false; why: string };

/** What the AppView gave, as read: only what the decision needs, held in memory for the one comparison. */
export interface BlueskyFacts {
  createdAt: string | null;
  posts: { createdAt: string | null; indexedAt: string | null }[];
}

export const BLUESKY_CHECK_WORDING = {
  new: () =>
    `Free images and frames are open to Bluesky accounts made before ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date(RULES.createdBefore))}, to keep out accounts made to use them. Link a Farcaster account, or sign in with a wallet to pay.`,
  idle: () =>
    `Free images and frames are open to Bluesky accounts that posted at least ${RULES.minRecentPosts} times in the last ${RULES.recentDays} days, to keep out unused accounts. Link a Farcaster account, or sign in with a wallet to pay.`,
  /** A fail read back from the store: which rule it missed isn't kept, so both are named. */
  failed: () =>
    `Free images and frames are open to Bluesky accounts made before ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date(RULES.createdBefore))} that posted at least ${RULES.minRecentPosts} times in the last ${RULES.recentDays} days. Yours didn’t pass when we last checked; we can check again a day after that. Link a Farcaster account, or sign in with a wallet to pay.`,
  unreachable: 'We can’t check your Bluesky account right now (Bluesky can’t be reached). Try again later.',
} as const;

type Rules = { createdBefore: string; recentDays: number; minRecentPosts: number };

/** The cut-off's calendar day in Pacific time, as YYYY-MM-DD ('2026-11-06T08:00:00Z' is 6 November, 00:00 Pacific). */
const pacificDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Los_Angeles' }).format(new Date(iso));

/**
 * The rule a decision is made under, stored with it in studio.check_decisions ('made-before-2026-11-06+5posts30d'):
 * a change of rules makes every decision under the old one stale. Never a count or a date of the account's.
 */
export const thresholdKey = (rules: Rules = RULES) => `made-before-${pacificDay(rules.createdBefore)}+${rules.minRecentPosts}posts${rules.recentDays}d`;

/** The decision, from the facts. Pure: the tests plant accounts here. */
export function decideBluesky(f: BlueskyFacts, now: Date = new Date(), rules: Rules = RULES): 'passed' | 'new' | 'idle' {
  const made = f.createdAt ? Date.parse(f.createdAt) : NaN;
  // No date, or one after the cut: treated as new (an account can't show it is old).
  if (!Number.isFinite(made) || made >= Date.parse(rules.createdBefore)) return 'new';
  const from = now.getTime() - rules.recentDays * 86_400_000;
  const inWindow = (iso: string | null) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) && t >= from && t <= now.getTime() + 5 * 60_000;
  };
  const recent = f.posts.filter((p) => inWindow(p.createdAt) && inWindow(p.indexedAt)).length;
  return recent >= rules.minRecentPosts ? 'passed' : 'idle';
}

const asObj = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const str = (x: unknown) => (typeof x === 'string' ? x : null);

async function getJson(path: string): Promise<Record<string, unknown>> {
  const res = await ATPROTO_HTTP.fetch(`${RULES.appView}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(SOCIAL_SIGN_IN.bluesky.timeoutMs), redirect: 'error' });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const text = await res.text();
  if (text.length > 400_000) throw new Error('too large');
  return JSON.parse(text) as Record<string, unknown>;
}

/** The facts for one DID: two requests to the AppView, the DID their only parameter about the person. */
export async function blueskyFacts(did: string): Promise<BlueskyFacts> {
  if (!isDid(did)) throw new Error('bad did');
  const q = encodeURIComponent(did);
  const profile = await getJson(`/xrpc/app.bsky.actor.getProfile?actor=${q}`);
  if (str(profile.did) !== did) throw new Error('another account');
  const feed = await getJson(`/xrpc/app.bsky.feed.getAuthorFeed?actor=${q}&limit=${RULES.feedLimit}&filter=posts_with_replies`);
  const items = Array.isArray(feed.feed) ? feed.feed : [];
  const posts = items
    .map(asObj)
    // A repost carries a reason; only the account's own posts and replies count.
    .filter((it) => !it.reason && str(asObj(asObj(it.post).author).did) === did)
    .map((it) => {
      const post = asObj(it.post);
      return { createdAt: str(asObj(post.record).createdAt), indexedAt: str(post.indexedAt) };
    });
  return { createdAt: str(profile.createdAt), posts };
}

/**
 * The account's decision: the stored one while it is current (src/lib/checks/decisions.ts: a pass for 90 days, a fail
 * for 24 hours, under today's rule), else asked of Bluesky now and stored (passed or not, and when). `facts` is
 * replaced only by the tests; `now` is the clock the posts are counted against.
 */
export async function blueskyDecision(sql: Sql, account: { id: number; subject: string }, facts: (did: string) => Promise<BlueskyFacts> = blueskyFacts, now: Date = new Date()): Promise<BlueskyLookup> {
  const threshold = thresholdKey();
  try {
    const kept = await currentDecision(sql, 'bluesky', account.subject, threshold);
    if (kept) return { ok: true, decision: kept.passed ? 'passed' : 'failed' };
  } catch (e) {
    console.error('bluesky-check: decisions unavailable', (e as { code?: string }).code ?? (e as Error).name);
    return { ok: false, why: 'store' };
  }
  let decision: 'passed' | 'new' | 'idle';
  try {
    decision = decideBluesky(await facts(account.subject), now);
  } catch (e) {
    return { ok: false, why: (e as Error).message || 'unreachable' };
  }
  await decide(sql, 'bluesky', account.subject, decision === 'passed', threshold);
  return { ok: true, decision };
}
