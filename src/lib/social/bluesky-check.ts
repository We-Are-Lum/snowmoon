import 'server-only';
import type postgres from 'postgres';
import { SOCIAL_SIGN_IN } from '../config';
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
 * Neynar today. Only the decision, its time and the threshold used are kept, in studio.bluesky_checks, one row per
 * account (owner, 2026-11-04): a pass lasts passDays (90), a fail is asked again no sooner than failHours (24) later,
 * and any decision is asked again once the threshold changes. The dates and counts are compared in memory and
 * forgotten. A failed lookup is never stored. Branch check-decisions builds the shared store for every network; this
 * file's blueskyDecision is the one place to move onto it. Re-asking earlier when the account is reported or a
 * picture of its is hidden comes with that store.
 *
 * Wording: DRAFT, drafted by the coding agent (Anthropic's Claude, a closed model), for the owner's reread.
 */
type Sql = postgres.Sql;
const RULES = SOCIAL_SIGN_IN.bluesky.check;

export type BlueskyDecision = 'passed' | 'new' | 'idle';
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
  unreachable: 'We can’t check your Bluesky account right now (Bluesky can’t be reached). Try again later.',
} as const;

/** The threshold a decision was made under, kept with it: a change of rules makes every decision stale. */
export const thresholdKey = (rules: { createdBefore: string; recentDays: number; minRecentPosts: number } = RULES) =>
  `made<${rules.createdBefore};posts>=${rules.minRecentPosts}/${rules.recentDays}d`;

/** The decision, from the facts. Pure: the tests plant accounts here. */
export function decideBluesky(f: BlueskyFacts, now: Date = new Date(), rules: { createdBefore: string; recentDays: number; minRecentPosts: number } = RULES): BlueskyDecision {
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

const missing = (e: unknown) => (e as { code?: string }).code === '42P01';

/**
 * The account's decision: the stored one if it still holds (a pass for passDays, a fail for failHours, same threshold), else asked of Bluesky now and stored (the
 * decision and its time only). `facts` is replaced only by the tests.
 */
export async function blueskyDecision(sql: Sql, account: { id: number; subject: string }, facts: (did: string) => Promise<BlueskyFacts> = blueskyFacts, now: Date = new Date()): Promise<BlueskyLookup> {
  const threshold = thresholdKey();
  const passFrom = new Date(now.getTime() - RULES.passDays * 86_400_000);
  const failFrom = new Date(now.getTime() - RULES.failHours * 3_600_000);
  try {
    const [row] = await sql<{ decision: BlueskyDecision }[]>`select decision from studio.bluesky_checks where account_id = ${account.id}
      and threshold = ${threshold} and checked_at > (case when decision = 'passed' then ${passFrom}::timestamptz else ${failFrom}::timestamptz end)`;
    if (row) return { ok: true, decision: row.decision };
  } catch (e) {
    if (!missing(e)) throw e;
    return { ok: false, why: 'not-set-up' };
  }
  let decision: BlueskyDecision;
  try {
    decision = decideBluesky(await facts(account.subject), now);
  } catch (e) {
    return { ok: false, why: (e as Error).message || 'unreachable' };
  }
  await sql`insert into studio.bluesky_checks (account_id, decision, checked_at, threshold) values (${account.id}, ${decision}, ${now}, ${threshold})
    on conflict (account_id) do update set decision = excluded.decision, checked_at = excluded.checked_at, threshold = excluded.threshold`;
  return { ok: true, decision };
}
