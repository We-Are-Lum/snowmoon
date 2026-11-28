import 'server-only';
import { API_HOSTS, POST_APIS, bskyPostsRequest, castFromHash, firstRequest, parseBskyPosts, parseLensPost, parseNeynarCast, parseResolveHandle, readPostAddress, type PostRef } from '../challenge/post-links';
import { blueskyProfile, farcasterProfile, lensProfile, linkParts, safeHttp } from './links';
import { signMedia } from './media';
import type { InlineNetwork, PostSlot, PostView, ProfileView } from './types';

/**
 * Posts and profiles read live for /admin/bounty (owner, 2026-11-27; branch bounty-inline; the principle 6 exception
 * for this admin-only page, docs/principles.md). Read when an admin opens the page, from the post's own network, through
 * the same fixed APIs and identity checks as Submit (src/lib/challenge/post-links.ts: every request built from the
 * checked post, sent only to API_HOSTS, never to an address someone pasted): Neynar for Farcaster (the site's key),
 * Bluesky's public API, Lens's API. Kept in memory for 5 minutes, never stored. Only what is shown is read: the words,
 * pictures and date of a post, and its writer's name, handle, bio and picture; never a like, recast, reply or follower
 * count. Pictures become signed addresses of the admin media route (src/lib/review/media.ts).
 */
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const TIMEOUT_MS = 6000;
const TTL_MS = 5 * 60_000;
const MAX_TEXT = 4000;
const MAX_BIO = 600;
const MAX_PICTURES = 4;

export const INLINE_WORDING = {
  notFound: 'The post couldn’t be found on its network.',
  unreachable: 'Its network didn’t answer just now.',
  labelled: 'Bluesky marks this post, or its account, as not for showing on other sites.',
  noKey: 'Farcaster posts and profiles can’t be read on this deployment (no Neynar key).',
} as const;

/** Every request goes through here: only to an API host, never following a redirect, never cached. */
async function ask(f: Fetch, url: string, init: RequestInit = { method: 'GET' }, headers: Record<string, string> = {}): Promise<Response> {
  const host = new URL(url).hostname;
  if (!(API_HOSTS as readonly string[]).includes(host)) throw new Error(`inline: refused to ask ${host}`);
  return f(url, { ...init, headers: { accept: 'application/json', ...((init.headers as Record<string, string>) ?? {}), ...headers }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const pictures = (urls: unknown[]): string[] => [...new Set(urls.filter((u): u is string => typeof u === 'string'))].map((u) => signMedia(u)).filter((u): u is string => Boolean(u)).slice(0, MAX_PICTURES);
const IMAGE_URL = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** A Neynar user (from a cast's author or the address lookup): name, username, bio, picture. Never its counts. */
export function neynarProfile(u: unknown): ProfileView | null {
  const o = u as { fid?: unknown; username?: unknown; display_name?: unknown; pfp_url?: unknown; profile?: { bio?: { text?: unknown } } } | null;
  if (!o || typeof o.fid !== 'number' || !Number.isSafeInteger(o.fid) || o.fid <= 0) return null;
  const handle = typeof o.username === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(o.username) ? o.username.toLowerCase() : null;
  return { network: 'farcaster', name: str(o.display_name, 120), handle, bio: str(o.profile?.bio?.text, MAX_BIO), picture: signMedia(str(o.pfp_url, 2000)), url: farcasterProfile(o.fid, handle) };
}

async function farcasterPost(ref: PostRef, f: Fetch): Promise<PostSlot> {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return { ok: false, why: INLINE_WORDING.noKey, url: null };
  const first = firstRequest(ref);
  const r = await ask(f, first.url, first.init, { 'x-api-key': key });
  if (r.status === 404 || r.status === 400) return { ok: false, why: INLINE_WORDING.notFound, url: null };
  if (!r.ok) return { ok: false, why: INLINE_WORDING.unreachable, url: null };
  const body = (await r.json()) as { cast?: { text?: unknown; author?: unknown; embeds?: { url?: unknown; metadata?: { content_type?: unknown } }[] } };
  // The same identity checks as Submit (its hash, its writer's name), then only the fields shown.
  const post = parseNeynarCast(body);
  if (!post || ('hash' in ref && !post.id.startsWith(ref.hash)) || ('fullHash' in ref && post.id !== ref.fullHash) || ('username' in ref && post.handle !== ref.username)) return { ok: false, why: INLINE_WORDING.notFound, url: null };
  const c = body.cast!;
  const imgs = (Array.isArray(c.embeds) ? c.embeds : []).filter((e) => typeof e?.url === 'string' && (String(e.metadata?.content_type ?? '').startsWith('image/') || IMAGE_URL.test(e.url as string))).map((e) => e.url);
  return { ok: true, post: { network: 'farcaster', url: post.url, at: post.at, text: str(c.text, MAX_TEXT) ?? '', pictures: pictures(imgs), author: neynarProfile(c.author) } };
}

async function blueskyPost(ref: Extract<PostRef, { network: 'bluesky' }>, f: Fetch): Promise<PostSlot> {
  let did = ref.actor.startsWith('did:') ? ref.actor : null;
  if (!did) {
    const first = firstRequest(ref);
    const r = await ask(f, first.url, first.init);
    if (r.status === 400 || r.status === 404) return { ok: false, why: INLINE_WORDING.notFound, url: null };
    if (!r.ok) return { ok: false, why: INLINE_WORDING.unreachable, url: null };
    did = parseResolveHandle(await r.json());
  }
  const postsUrl = did ? bskyPostsRequest(did, ref.rkey) : null;
  if (!did || !postsUrl) return { ok: false, why: INLINE_WORDING.notFound, url: null };
  const r = await ask(f, postsUrl);
  if (!r.ok) return { ok: false, why: r.status === 400 ? INLINE_WORDING.notFound : INLINE_WORDING.unreachable, url: null };
  const body = (await r.json()) as { posts?: { record?: { text?: unknown }; embed?: { $type?: unknown; images?: { fullsize?: unknown }[]; media?: { images?: { fullsize?: unknown }[] } } }[] };
  const post = parseBskyPosts(body, ref.rkey);
  if (post === 'labelled') return { ok: false, why: INLINE_WORDING.labelled, url: null };
  if (!post || !post.id.startsWith(`at://${did}/`)) return { ok: false, why: INLINE_WORDING.notFound, url: null };
  const p = body.posts![0];
  const imgs = [...(p.embed?.images ?? []), ...(p.embed?.media?.images ?? [])].map((i) => i?.fullsize);
  // The writer's profile: Bluesky's public getProfiles (same host), by the DID the post's own address names.
  let author: ProfileView | null = null;
  const pr = await ask(f, `${new URL(POST_APIS.bskyGetPosts).origin}/xrpc/app.bsky.actor.getProfiles?${new URLSearchParams({ actors: did })}`).catch(() => null);
  if (pr?.ok) {
    const a = ((await pr.json()) as { profiles?: { did?: unknown; handle?: unknown; displayName?: unknown; description?: unknown; avatar?: unknown; labels?: unknown }[] }).profiles?.[0];
    if (a && a.did === did && !(Array.isArray(a.labels) && a.labels.length)) {
      const handle = typeof a.handle === 'string' && a.handle !== 'handle.invalid' ? a.handle.toLowerCase() : null;
      author = { network: 'bluesky', name: str(a.displayName, 120), handle, bio: str(a.description, MAX_BIO), picture: signMedia(str(a.avatar, 2000)), url: blueskyProfile(handle, did) };
    }
  }
  return { ok: true, post: { network: 'bluesky', url: post.url, at: post.at, text: str(p.record?.text, MAX_TEXT) ?? '', pictures: pictures(imgs), author } };
}

/** Lens: the post with its author's name, bio and picture, and its images (validated against Lens's API, 2026-11-27). */
export const REVIEW_LENS_QUERY = `query($p: PostId!) { post(request: { post: $p }) { __typename ... on Post { id slug timestamp author { address username { localName } metadata { name bio picture } } metadata { __typename ... on TextOnlyMetadata { content } ... on ImageMetadata { content image { item } attachments { ... on MediaImage { item } } } ... on LinkMetadata { content sharingLink } ... on VideoMetadata { content } ... on ArticleMetadata { content } } } } }`;

async function lensPost(ref: Extract<PostRef, { network: 'lens' }>, f: Fetch): Promise<PostSlot> {
  const r = await ask(f, POST_APIS.lensGraphql, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: REVIEW_LENS_QUERY, variables: { p: ref.slug } }) });
  if (!r.ok) return { ok: false, why: INLINE_WORDING.unreachable, url: null };
  const body = (await r.json()) as { data?: { post?: { author?: { username?: { localName?: unknown }; metadata?: { name?: unknown; bio?: unknown; picture?: unknown } }; metadata?: { content?: unknown; image?: { item?: unknown }; attachments?: { item?: unknown }[] } } } };
  // Its identity, as Submit checks it (the shape is a superset of Submit's query).
  const post = parseLensPost(body, ref.slug);
  if (!post) return { ok: false, why: INLINE_WORDING.notFound, url: null };
  const p = body.data!.post!;
  const name = typeof p.author?.username?.localName === 'string' ? p.author.username.localName : null;
  const handle = name ? `lens/${name}` : null;
  const author: ProfileView = { network: 'lens', name: str(p.author?.metadata?.name, 120), handle, bio: str(p.author?.metadata?.bio, MAX_BIO), picture: signMedia(str(p.author?.metadata?.picture, 2000)), url: lensProfile(handle) };
  const imgs = [p.metadata?.image?.item, ...(p.metadata?.attachments ?? []).map((a) => a?.item)];
  return { ok: true, post: { network: 'lens', url: post.url, at: post.at, text: str(p.metadata?.content, MAX_TEXT) ?? '', pictures: pictures(imgs), author } };
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, make: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await make();
  if (keep(value)) cache.set(key, { at: Date.now(), value });
  if (cache.size > 2000) for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k);
  return value;
}
/** For the tests: forget what was kept. */
export const forgetInline = () => cache.clear();

const refKey = (ref: PostRef) => JSON.stringify(ref);

/** One post, by its checked reference, read from its network (or the last 5 minutes' answer). Never throws. */
export async function postView(ref: PostRef, f: Fetch = fetch): Promise<PostSlot> {
  return cached(`post:${refKey(ref)}`, async () => {
    try {
      if (ref.network === 'farcaster') return await farcasterPost(ref, f);
      if (ref.network === 'bluesky') return await blueskyPost(ref, f);
      return await lensPost(ref, f);
    } catch (e) {
      console.error('inline: the network did not answer', (e as Error).name);
      return { ok: false as const, why: INLINE_WORDING.unreachable, url: null };
    }
  }, (v) => v.ok || v.why !== INLINE_WORDING.unreachable);
}

/** The posts a claim's description links (Farcaster, Bluesky or Lens), read through readPostAddress, at most three. */
export function postRefsIn(text: string): PostRef[] {
  const out: PostRef[] = [];
  for (const part of linkParts(text)) {
    if (!('href' in part)) continue;
    const r = readPostAddress(part.href);
    if (r.ok && !out.some((x) => refKey(x) === refKey(r.ref))) out.push(r.ref);
    if (out.length >= 3) break;
  }
  return out;
}

/** A stored post (studio.version_posts) as a reference: a cast by its full hash; others by their rebuilt address. */
export function storedRef(network: string, postId: string, url: string): PostRef | null {
  if (network === 'farcaster') {
    const r = castFromHash(postId);
    return r.ok ? r.ref : null;
  }
  const r = readPostAddress(url);
  return r.ok ? r.ref : null;
}

/** Farcaster profiles for these addresses (custody or verified), one Neynar call for up to 350. Never throws. */
export async function profilesByAddress(addresses: string[], f: Fetch = fetch): Promise<{ profiles: Map<string, ProfileView>; note: string | null }> {
  const want = [...new Set(addresses.map((a) => a.toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a)))].sort();
  const profiles = new Map<string, ProfileView>();
  if (!want.length) return { profiles, note: null };
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return { profiles, note: INLINE_WORDING.noKey };
  return cached(`addr:${want.join(',')}`, async () => {
    try {
      for (let i = 0; i < want.length; i += 350) {
        const chunk = want.slice(i, i + 350);
        const r = await ask(f, `${new URL(POST_APIS.neynarCast).origin}/v2/farcaster/user/bulk-by-address?${new URLSearchParams({ addresses: chunk.join(',') })}`, { method: 'GET' }, { 'x-api-key': key });
        if (r.status === 404) continue;
        if (!r.ok) return { profiles, note: INLINE_WORDING.unreachable };
        const body = (await r.json()) as Record<string, unknown>;
        for (const [addr, users] of Object.entries(body ?? {})) {
          const a = addr.toLowerCase();
          if (!chunk.includes(a) || !Array.isArray(users)) continue;
          // A custody address names one account; a verified address may name several: the first that verified it.
          const p = neynarProfile(users[0]);
          if (p) profiles.set(a, p);
        }
      }
      return { profiles, note: null };
    } catch (e) {
      console.error('inline: Neynar did not answer', (e as Error).name);
      return { profiles, note: INLINE_WORDING.unreachable };
    }
  }, (v) => v.note === null);
}

/** Network names shown on the page. */
export const NETWORK_LABEL: Record<InlineNetwork, string> = { farcaster: 'Farcaster', bluesky: 'Bluesky', lens: 'Lens' };
export const postLink = (p: PostView) => safeHttp(p.url);
