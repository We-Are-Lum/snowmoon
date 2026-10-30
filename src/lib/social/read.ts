import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { unstable_cache } from 'next/cache';
import { SOCIAL_READ } from '../config';
import { db } from '../db';
import { type Hidden, type SocialPost, hiddenFrom, parseBlueskySearch, parseNeynarFeed, postsForPage } from './parse';

/**
 * "Posts that link here": the server half. Each network is asked one question for the whole site, at most once per
 * SOCIAL_READ.keepSeconds (kept in Next's data cache, shared by every page and every reader), and each page takes its
 * own posts from the answer. The reader's browser never asks either network (P6a); nothing from them is shown but
 * plain text and a link (no avatar, picture or script).
 *
 * Fails closed: if the setting is off, the hide list can't be read (before NEXT_social_read.sql is applied, or with no
 * database), or a network doesn't answer, the page shows nothing from that source, and never a post that might be hidden.
 *
 * Free tiers (checked 2026-10-29; docs/branch-reports/social-read.md):
 * - Farcaster, through Neynar, with the site's NEYNAR_API_KEY: GET /v2/farcaster/feed, feed_type=filter,
 *   filter_type=embed_url, embed_url=snowmoon.party (casts whose embedded links start with it), no recasts, 100 a page.
 *   4 credits × 100 = 400 credits a look; one look per half hour is about 0.6M credits a month (the free plan has
 *   10M a month, 600 requests a minute per endpoint).
 * - Bluesky, through its public API without an account: GET api.bsky.app/xrpc/app.bsky.feed.searchPosts, q=*,
 *   domain=snowmoon.party, sort=latest, 100 a page. (public.api.bsky.app answers 403 to searchPosts; api.bsky.app
 *   answers. Without an account only the first page is served, so we read the latest 100.)
 */

const NEYNAR_FEED = 'https://api.neynar.com/v2/farcaster/feed';
const BSKY_SEARCH = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';
const TIMEOUT_MS = 5000;

/** On or off for this deployment: the setting, or SOCIAL_READ_PREVIEW=1 anywhere but production (tests). */
export function socialReadOn(): boolean {
  return SOCIAL_READ.show || (process.env.VERCEL_ENV !== 'production' && process.env.SOCIAL_READ_PREVIEW === '1');
}

/** A local file of posts in place of both networks, for check:ui only; ignored on production. */
function fixture(): SocialPost[] | null {
  const f = process.env.VERCEL_ENV !== 'production' ? process.env.SOCIAL_READ_FIXTURE : undefined;
  if (!f) return null;
  try {
    return JSON.parse(readFileSync(path.resolve(f), 'utf8')) as SocialPost[];
  } catch {
    return [];
  }
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function askFarcaster(): Promise<SocialPost[]> {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return [];
  const q = new URLSearchParams({ feed_type: 'filter', filter_type: 'embed_url', embed_url: SOCIAL_READ.hosts[0], with_recasts: 'false', limit: String(SOCIAL_READ.perLook) });
  try {
    return parseNeynarFeed(await getJson(`${NEYNAR_FEED}?${q}`, { 'x-api-key': key }));
  } catch (e) {
    console.error('social-read: Neynar did not answer', (e as Error).message);
    return [];
  }
}

async function askBluesky(): Promise<SocialPost[]> {
  const q = new URLSearchParams({ q: '*', domain: SOCIAL_READ.hosts[0], sort: 'latest', limit: String(SOCIAL_READ.perLook) });
  try {
    return parseBlueskySearch(await getJson(`${BSKY_SEARCH}?${q}`, {}));
  } catch (e) {
    console.error('social-read: Bluesky did not answer', (e as Error).message);
    return [];
  }
}

// One look per network per keepSeconds, for the whole site. A failed look is kept as "nothing" for the same time, so a
// network that is down is not asked again on every page view.
const farcaster = unstable_cache(askFarcaster, ['social-read', 'farcaster', 'v1'], { revalidate: SOCIAL_READ.keepSeconds, tags: ['social-read'] });
const bluesky = unstable_cache(askBluesky, ['social-read', 'bluesky', 'v1'], { revalidate: SOCIAL_READ.keepSeconds, tags: ['social-read'] });

/** Every post read, from both networks (or the fixture). Never throws. */
export async function allPosts(): Promise<SocialPost[]> {
  const f = fixture();
  if (f) return f;
  const [a, b] = await Promise.all([farcaster().catch(() => []), bluesky().catch(() => [])]);
  return [...a, ...b];
}

/** The hide list, or null when it can't be read (then nothing is shown). */
export async function hiddenPosts(): Promise<Hidden | null> {
  const sql = db();
  if (!sql) return null;
  try {
    const rows = await sql<{ network: string; post_id: string }[]>`select network, post_id from studio.social_hidden`;
    return hiddenFrom(rows);
  } catch (e) {
    console.error('social-read: the hide list could not be read', (e as { code?: string }).code ?? (e as Error).name);
    return null;
  }
}

/** The posts to show on one page (its path, e.g. /image/<id>): newest first, none hidden. Empty when off or unsure. */
export async function postsLinkingTo(page: string): Promise<SocialPost[]> {
  if (!socialReadOn()) return [];
  const hidden = await hiddenPosts();
  if (!hidden) return [];
  return postsForPage(await allPosts(), page, hidden);
}
