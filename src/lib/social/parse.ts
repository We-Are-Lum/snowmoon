import { SOCIAL_READ } from '../config';

/**
 * "Posts that link here": the pure half (no network, no database), so scripts/test-social-read.ts can check it on
 * fixtures. What a post becomes, which page of ours it links to, and the order: newest first, nothing else (P5f).
 */

export type Network = 'farcaster' | 'bluesky';

export interface SocialPost {
  network: Network;
  /** The network's own id: a cast's hash (0x…), or a Bluesky post's at:// URI. What a hide names. */
  id: string;
  /** The author's handle, without the @. */
  handle: string;
  /** The post's text, plain, cut to SOCIAL_READ.maxChars. */
  text: string;
  /** When it was posted (ISO). For Bluesky, the earlier of the post's own date and when Bluesky first saw it. */
  at: string;
  /** The post on its network. */
  url: string;
  /** The pages of ours it links to, as pageKey() gives them. */
  pages: string[];
}

export const NETWORK_NAME: Record<Network, string> = { farcaster: 'Farcaster', bluesky: 'Bluesky' };

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * One key per page, so every way of linking to a page finds it: /@name/12-any-words and /adaptation/12/by/name are
 * both "/@name/12"; a fixed version is "/@name/12/v/3"; a chapter is "/chapter/3" (its #block and ?view don't matter);
 * an image is "/image/<id>". Anything else is its own path, lower case, without a trailing slash.
 */
export function pageKey(pathname: string): string {
  const p = safeDecode(pathname).toLowerCase().replace(/\/+$/, '') || '/';
  let m = /^\/chapter\/0*(\d{1,3})$/.exec(p);
  if (m) return `/chapter/${Number(m[1])}`;
  m = /^\/image\/([0-9a-f-]{36})$/.exec(p);
  if (m) return `/image/${m[1]}`;
  m = /^\/@([^/]+)\/(\d{1,9})(?:-[a-z0-9-]*)?(?:\/v\/(\d{1,9}))?$/.exec(p);
  if (m) return `/@${m[1]}/${Number(m[2])}${m[3] ? `/v/${Number(m[3])}` : ''}`;
  m = /^\/adaptation\/(\d{1,9})(?:-[a-z0-9-]*)?\/by\/([^/]+)(?:\/v\/(\d{1,9}))?$/.exec(p);
  if (m) return `/@${m[2]}/${Number(m[1])}${m[3] ? `/v/${Number(m[3])}` : ''}`;
  return p;
}

/** The page keys of the links that are ours, each once. */
export function ourPages(links: unknown[]): string[] {
  const keys = new Set<string>();
  for (const l of links) {
    if (typeof l !== 'string') continue;
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(l) ? l : `https://${l}`);
    } catch {
      continue;
    }
    if (!(SOCIAL_READ.hosts as readonly string[]).includes(u.hostname.toLowerCase())) continue;
    keys.add(pageKey(u.pathname));
  }
  return [...keys];
}

/** Plain text: no control characters, runs of blank lines folded, cut to maxChars with "…". */
export function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const t = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const chars = [...t];
  return chars.length > SOCIAL_READ.maxChars ? `${chars.slice(0, SOCIAL_READ.maxChars - 1).join('').trimEnd()}…` : t;
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const HANDLE = /^[a-z0-9][a-z0-9._-]{0,252}$/i;

/**
 * Neynar's feed filtered by embed URL (GET /v2/farcaster/feed?feed_type=filter&filter_type=embed_url): its `casts`.
 * Kept: the hash, the author's username, the text, the time, and which of our pages its embeds (or text) link to.
 * Never kept: avatars, display names, counts of likes, recasts or replies, scores.
 */
export function parseNeynarFeed(body: unknown): SocialPost[] {
  const casts = (body as { casts?: unknown })?.casts;
  if (!Array.isArray(casts)) return [];
  const out: SocialPost[] = [];
  for (const c of casts as Record<string, unknown>[]) {
    const hash = typeof c?.hash === 'string' && /^0x[0-9a-f]{40}$/i.test(c.hash) ? c.hash.toLowerCase() : null;
    const username = (c?.author as { username?: unknown } | undefined)?.username;
    const at = isoOrNull(c?.timestamp);
    if (!hash || typeof username !== 'string' || !HANDLE.test(username) || !at) continue;
    const embeds = Array.isArray(c.embeds) ? (c.embeds as { url?: unknown }[]).map((e) => e?.url) : [];
    const inText = typeof c.text === 'string' ? (c.text.match(/(?:https?:\/\/)?(?:www\.)?snowmoon\.party\/[^\s<>"')\]]*/gi) ?? []) : [];
    const pages = ourPages([...embeds, ...inText]);
    if (!pages.length) continue;
    out.push({ network: 'farcaster', id: hash, handle: username, text: cleanText(c.text), at, url: `https://farcaster.xyz/${username}/${hash.slice(0, 10)}`, pages });
  }
  return out;
}

/**
 * Bluesky's app.bsky.feed.searchPosts (domain=snowmoon.party, sort=latest): its `posts`. A post or author that carries
 * any label (moderation labels, or the author's own, such as "!no-unauthenticated": don't show me to signed-out
 * readers) is left out. Kept: the at:// URI, the handle, the text, the time, and which of our pages it links to (its
 * link facets and its link card). Never kept: avatars, display names, counts, images.
 */
export function parseBlueskySearch(body: unknown): SocialPost[] {
  const posts = (body as { posts?: unknown })?.posts;
  if (!Array.isArray(posts)) return [];
  const out: SocialPost[] = [];
  for (const p of posts as Record<string, unknown>[]) {
    const uri = typeof p?.uri === 'string' ? p.uri : '';
    const m = /^at:\/\/(did:[a-z0-9]+:[a-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([a-z0-9]{1,64})$/i.exec(uri);
    const author = (p.author ?? {}) as { did?: unknown; handle?: unknown; labels?: unknown };
    const record = (p.record ?? {}) as { text?: unknown; createdAt?: unknown; facets?: unknown; embed?: unknown };
    const labelled = (Array.isArray(p.labels) && p.labels.length > 0) || (Array.isArray(author.labels) && author.labels.length > 0);
    const handle = typeof author.handle === 'string' && HANDLE.test(author.handle) && author.handle !== 'handle.invalid' ? author.handle : null;
    const created = isoOrNull(record.createdAt);
    const indexed = isoOrNull(p.indexedAt);
    if (!m || labelled || !handle || !(created || indexed)) continue;
    // A post can claim any date; one dated after Bluesky first saw it is placed when Bluesky saw it.
    const at = created && indexed ? (created < indexed ? created : indexed) : (created ?? indexed)!;
    const links: unknown[] = [];
    for (const f of Array.isArray(record.facets) ? (record.facets as { features?: unknown }[]) : []) {
      for (const x of Array.isArray(f?.features) ? (f.features as { $type?: unknown; uri?: unknown }[]) : []) {
        if (x?.$type === 'app.bsky.richtext.facet#link') links.push(x.uri);
      }
    }
    const embed = record.embed as { external?: { uri?: unknown }; media?: { external?: { uri?: unknown } } } | undefined;
    links.push(embed?.external?.uri, embed?.media?.external?.uri);
    const pages = ourPages(links);
    if (!pages.length) continue;
    out.push({ network: 'bluesky', id: uri, handle, text: cleanText(record.text), at, url: `https://bsky.app/profile/${m[1]}/post/${m[2]}`, pages });
  }
  return out;
}

/** The hide list, as read: one key per hidden post (hideKey). */
export type Hidden = ReadonlySet<string>;
export const hiddenFrom = (rows: { network: string; post_id: string }[]): Hidden => new Set(rows.map((r) => hideKey(r.network as Network, r.post_id)));
export const isHidden = (p: SocialPost, h: Hidden) => h.has(hideKey(p.network, p.id));

/** The posts for one page: not hidden, each once, newest first (the only order; P5f), at most perPage. */
export function postsForPage(all: SocialPost[], page: string, hidden: Hidden): SocialPost[] {
  const key = pageKey(page);
  const seen = new Set<string>();
  const mine = all.filter((p) => {
    const k = hideKey(p.network, p.id);
    if (!p.pages.includes(key) || isHidden(p, hidden) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return mine.sort(newestFirst).slice(0, SOCIAL_READ.perPage);
}

/** Newest first; the same time falls back to the id, so the order never changes between views. */
export function newestFirst(a: SocialPost, b: SocialPost): number {
  return a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export const hideKey = (network: Network, id: string) => `${network} ${id}`;

/** Every post read, newest first: what moderators see on /moderate, to hide any of them. */
export const byNewest = (all: SocialPost[]): SocialPost[] => [...all].sort(newestFirst);
