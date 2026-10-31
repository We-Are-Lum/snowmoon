/**
 * "Add where you posted it" (owner, 2026-10-31), the pure half: no network, no database, so scripts/test-challenge.ts
 * can prove every rule on stand-ins.
 *
 * 1. readPostAddress: the pasted address is only read, never fetched. It must be https, with no user name, password or
 *    port, on a host that is exactly one of the three networks' (NETWORK_HOSTS; no look-alikes, sub-domains or IPs),
 *    with a path of that network's post form. What comes out is the post's identity (a cast hash, a Bluesky
 *    actor and record key, a Lens post slug), never the address.
 * 2. apiRequests: the requests our server makes for that identity, built from fixed API addresses (API_HOSTS) and the
 *    identity's checked parts. The pasted address is not one of them.
 * 3. parse*: what each API answers becomes a Post: the network, the post's id, the writer's handle, the date, the
 *    links it carries, and the post's address as we rebuild it. Kept: nothing else (no avatar, name, picture,
 *    counts or words are kept or shown; principle 6).
 * 4. linksToVersion: the post must link to that version's page (snowmoon.party/references/designs/<id>) to be listed.
 */

export type Network = 'farcaster' | 'bluesky' | 'lens';
export const NETWORK_NAME: Record<Network, string> = { farcaster: 'Farcaster', bluesky: 'Bluesky', lens: 'Lens' };

/** The exact hosts a pasted post address may be on. Nothing else matches: not a sub-domain, not "www.", not an IP. */
export const NETWORK_HOSTS: Record<Network, readonly string[]> = {
  farcaster: ['farcaster.xyz', 'warpcast.com'],
  bluesky: ['bsky.app'],
  lens: ['hey.xyz'],
};

/** The only hosts our server asks about a post. Mutable only so the tests can point them at a stand-in. */
export const POST_APIS = {
  neynarCast: 'https://api.neynar.com/v2/farcaster/cast',
  bskyResolveHandle: 'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle',
  bskyGetPosts: 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts',
  lensGraphql: 'https://api.lens.xyz/graphql',
};
export const API_HOSTS = ['api.neynar.com', 'public.api.bsky.app', 'api.lens.xyz'] as const;

/** Our own hosts: a link to one of these counts as a link to this site. */
export const SITE_HOSTS = ['snowmoon.party', 'www.snowmoon.party'];

export type PostRef =
  | { network: 'farcaster'; username: string; hash: string }
  | { network: 'farcaster'; fullHash: string }
  | { network: 'bluesky'; actor: string; rkey: string }
  | { network: 'lens'; slug: string };

export type Read = { ok: true; ref: PostRef } | { ok: false; why: string };

const USERNAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const BSKY_HANDLE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const BSKY_DID = /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$/;
const RKEY = /^[a-z0-9]{1,64}$/i;
const LENS_SLUG = /^[a-z0-9]{1,64}$/i;
export const FULL_HASH = /^0x[0-9a-f]{40}$/i;

export const REFUSE = {
  notAddress: 'Paste the address of your post (it starts with https://).',
  notNetwork: 'That isn’t a post on Farcaster (farcaster.xyz), Bluesky (bsky.app) or Lens (hey.xyz).',
  notPost: 'That address isn’t a single post. Open the post itself and copy its address.',
};

/** Read a pasted address. Never fetches it. */
export function readPostAddress(raw: unknown): Read {
  if (typeof raw !== 'string') return { ok: false, why: REFUSE.notAddress };
  const s = raw.trim();
  // One line, no spaces or backslashes (which browsers and URL parsers read differently), and not too long.
  if (!s || s.length > 300 || /[\s\\\u0000-\u001f\u007f]/.test(s)) return { ok: false, why: REFUSE.notAddress };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, why: REFUSE.notAddress };
  }
  if (u.protocol !== 'https:') return { ok: false, why: REFUSE.notAddress };
  if (u.username || u.password || u.port || /@/.test(s.slice(8).split('/')[0])) return { ok: false, why: REFUSE.notNetwork };
  const host = u.hostname.toLowerCase();
  const network = (Object.keys(NETWORK_HOSTS) as Network[]).find((n) => NETWORK_HOSTS[n].includes(host));
  if (!network) return { ok: false, why: REFUSE.notNetwork };
  const path = u.pathname.replace(/\/+$/, '');
  let m: RegExpExecArray | null;
  if (network === 'farcaster') {
    m = /^\/([^/]+)\/(0x[0-9a-f]{8,40})$/i.exec(path);
    if (!m || !USERNAME.test(m[1])) return { ok: false, why: REFUSE.notPost };
    return { ok: true, ref: { network, username: m[1].toLowerCase(), hash: m[2].toLowerCase() } };
  }
  if (network === 'bluesky') {
    m = /^\/profile\/([^/]+)\/post\/([^/]+)$/.exec(path);
    const actor = m ? decodeURIComponent(m[1]).toLowerCase() : '';
    if (!m || !(BSKY_HANDLE.test(actor) || BSKY_DID.test(actor)) || !RKEY.test(m[2])) return { ok: false, why: REFUSE.notPost };
    return { ok: true, ref: { network, actor, rkey: m[2] } };
  }
  m = /^\/posts\/([^/]+)$/.exec(path);
  if (!m || !LENS_SLUG.test(m[1])) return { ok: false, why: REFUSE.notPost };
  return { ok: true, ref: { network: 'lens', slug: m[1].toLowerCase() } };
}

/** A cast the person just made in the Farcaster app (composeCast's answer): its full hash. */
export function castFromHash(hash: unknown): Read {
  return typeof hash === 'string' && FULL_HASH.test(hash) ? { ok: true, ref: { network: 'farcaster', fullHash: hash.toLowerCase() } } : { ok: false, why: REFUSE.notPost };
}

/** The first request for a post: always to one of API_HOSTS, built from the checked identity, never the pasted address. */
export function firstRequest(ref: PostRef): { url: string; init: RequestInit } {
  if (ref.network === 'farcaster') {
    // Neynar looks a cast up by its full hash, or by its address on Farcaster's client, which we rebuild from the
    // checked user name and hash (Neynar's API reads it; neither we nor Neynar is sent what was pasted).
    const q = 'fullHash' in ref ? new URLSearchParams({ identifier: ref.fullHash, type: 'hash' }) : new URLSearchParams({ identifier: `https://farcaster.xyz/${ref.username}/${ref.hash}`, type: 'url' });
    return { url: `${POST_APIS.neynarCast}?${q}`, init: { method: 'GET' } };
  }
  if (ref.network === 'bluesky') {
    if (ref.actor.startsWith('did:')) return { url: `${POST_APIS.bskyGetPosts}?${new URLSearchParams({ uris: `at://${ref.actor}/app.bsky.feed.post/${ref.rkey}` })}`, init: { method: 'GET' } };
    return { url: `${POST_APIS.bskyResolveHandle}?${new URLSearchParams({ handle: ref.actor })}`, init: { method: 'GET' } };
  }
  return {
    url: POST_APIS.lensGraphql,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: LENS_QUERY, variables: { p: ref.slug } }),
    },
  };
}

/** Bluesky's second request, once the handle is resolved to its DID. */
export function bskyPostsRequest(did: string, rkey: string): string | null {
  if (!BSKY_DID.test(did) || !RKEY.test(rkey)) return null;
  return `${POST_APIS.bskyGetPosts}?${new URLSearchParams({ uris: `at://${did}/app.bsky.feed.post/${rkey}` })}`;
}

export const LENS_QUERY = `query($p: PostId!) { post(request: { post: $p }) { __typename ... on Post { id slug timestamp author { username { localName } } metadata { __typename ... on TextOnlyMetadata { content } ... on LinkMetadata { content sharingLink } ... on ImageMetadata { content } ... on VideoMetadata { content } ... on ArticleMetadata { content } } } } }`;

export interface Post {
  network: Network;
  /** The network's own id: a cast's full hash, a Bluesky at:// URI, a Lens post id. */
  id: string;
  /** The writer's handle, without the @. */
  handle: string;
  /** When it was posted (ISO). */
  at: string;
  /** The post on its network, as we rebuild it from the checked parts (never the pasted text). */
  url: string;
  /** Every link the post carries (its embeds, link cards and the addresses in its text). Not stored. */
  links: string[];
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const textLinks = (t: unknown): string[] => (typeof t === 'string' ? (t.match(/(?:https?:\/\/)?(?:www\.)?snowmoon\.party\/[^\s<>"')\]]*/gi) ?? []) : []);

/** Neynar's GET /v2/farcaster/cast answer: { cast: { hash, author: { username }, text, timestamp, embeds: [{ url }] } }. */
export function parseNeynarCast(body: unknown): Post | null {
  const c = (body as { cast?: Record<string, unknown> } | null)?.cast;
  if (!c) return null;
  const hash = typeof c.hash === 'string' && FULL_HASH.test(c.hash) ? c.hash.toLowerCase() : null;
  const username = (c.author as { username?: unknown } | undefined)?.username;
  const at = isoOrNull(c.timestamp);
  if (!hash || typeof username !== 'string' || !USERNAME.test(username) || !at) return null;
  const embeds = Array.isArray(c.embeds) ? (c.embeds as { url?: unknown }[]).map((e) => e?.url).filter((x): x is string => typeof x === 'string') : [];
  return { network: 'farcaster', id: hash, handle: username.toLowerCase(), at, url: `https://farcaster.xyz/${username.toLowerCase()}/${hash.slice(0, 10)}`, links: [...embeds, ...textLinks(c.text)] };
}

/** Bluesky's resolveHandle answer: { did }. */
export function parseResolveHandle(body: unknown): string | null {
  const did = (body as { did?: unknown } | null)?.did;
  return typeof did === 'string' && BSKY_DID.test(did) ? did : null;
}

/**
 * Bluesky's app.bsky.feed.getPosts answer: { posts: [{ uri, author: { handle, labels }, record: { text, createdAt,
 * facets, embed }, indexedAt, labels }] }. A labelled post or author (moderation labels, or "!no-unauthenticated":
 * don't show me to signed-out readers) is refused.
 */
export function parseBskyPosts(body: unknown, rkey: string): Post | null | 'labelled' {
  const posts = (body as { posts?: unknown } | null)?.posts;
  if (!Array.isArray(posts) || posts.length !== 1) return null;
  const p = posts[0] as Record<string, unknown>;
  const uri = typeof p.uri === 'string' ? p.uri : '';
  const m = /^at:\/\/(did:[a-z0-9]+:[a-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([a-z0-9]{1,64})$/i.exec(uri);
  const author = (p.author ?? {}) as { handle?: unknown; labels?: unknown };
  const record = (p.record ?? {}) as { text?: unknown; createdAt?: unknown; facets?: unknown; embed?: unknown };
  if (!m || m[2] !== rkey) return null;
  if ((Array.isArray(p.labels) && p.labels.length > 0) || (Array.isArray(author.labels) && author.labels.length > 0)) return 'labelled';
  const handle = typeof author.handle === 'string' && BSKY_HANDLE.test(author.handle) && author.handle !== 'handle.invalid' ? author.handle.toLowerCase() : null;
  const created = isoOrNull(record.createdAt);
  const indexed = isoOrNull(p.indexedAt);
  if (!handle || !(created || indexed)) return null;
  // A post can claim any date; one dated after Bluesky first saw it is placed when Bluesky saw it.
  const at = created && indexed ? (created < indexed ? created : indexed) : (created ?? indexed)!;
  const links: string[] = [];
  for (const f of Array.isArray(record.facets) ? (record.facets as { features?: unknown }[]) : []) {
    for (const x of Array.isArray(f?.features) ? (f.features as { $type?: unknown; uri?: unknown }[]) : []) {
      if (x?.$type === 'app.bsky.richtext.facet#link' && typeof x.uri === 'string') links.push(x.uri);
    }
  }
  const embed = record.embed as { external?: { uri?: unknown }; media?: { external?: { uri?: unknown } } } | undefined;
  for (const u of [embed?.external?.uri, embed?.media?.external?.uri]) if (typeof u === 'string') links.push(u);
  links.push(...textLinks(record.text));
  return { network: 'bluesky', id: uri, handle, at, url: `https://bsky.app/profile/${m[1]}/post/${m[2]}`, links };
}

/** Lens's post query answer: { data: { post: { __typename: 'Post', id, slug, timestamp, author, metadata } } }. A repost is refused. */
export function parseLensPost(body: unknown, slug: string): Post | null {
  const p = (body as { data?: { post?: Record<string, unknown> | null } } | null)?.data?.post;
  if (!p || p.__typename !== 'Post') return null;
  const id = typeof p.id === 'string' && /^[0-9a-z]{1,100}$/i.test(p.id) ? p.id : null;
  const s = typeof p.slug === 'string' ? p.slug.toLowerCase() : '';
  const handle = (p.author as { username?: { localName?: unknown } | null } | undefined)?.username?.localName;
  const at = isoOrNull(p.timestamp);
  if (!id || s !== slug || typeof handle !== 'string' || !USERNAME.test(handle) || !at) return null;
  const meta = (p.metadata ?? {}) as { content?: unknown; sharingLink?: unknown };
  const links = [...textLinks(meta.content), ...(typeof meta.sharingLink === 'string' ? [meta.sharingLink] : [])];
  return { network: 'lens', id, handle: handle.toLowerCase(), at, url: `https://hey.xyz/posts/${s}`, links };
}

/** The path of a version's page. */
export const versionPath = (versionId: string) => `/references/designs/${versionId.toLowerCase()}`;

/** Does the post link to this version's page? Its host must be ours exactly, its path that page (a trailing / allowed). */
export function linksToVersion(post: Pick<Post, 'links'>, versionId: string): boolean {
  const want = versionPath(versionId);
  return post.links.some((l) => {
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(l) ? l : `https://${l}`);
    } catch {
      return false;
    }
    return SITE_HOSTS.includes(u.hostname.toLowerCase()) && !u.username && !u.password && u.pathname.toLowerCase().replace(/\/+$/, '') === want;
  });
}
