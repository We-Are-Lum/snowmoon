import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { API_HOSTS, bskyPostsRequest, firstRequest, linksToVersion, parseBskyPosts, parseLensPost, parseNeynarCast, parseResolveHandle, type Network, type Post, type PostRef } from './post-links';

/**
 * "Add where you posted it" and "Posted on" (owner, 2026-10-31), the server half. Off until CHALLENGE.posts is on
 * (after the owner's reread of docs/legal/remix-challenge-draft.md). The post is read from its network's own API
 * (post-links.ts builds every request; this file checks each one goes to API_HOSTS before sending it); the pasted
 * address is never fetched. Stored in studio.version_posts (NEXT_remix_challenge.sql): the network, the post's id, the
 * writer's handle, the date, our rebuilt address, who added it and when. Never its words, avatar or pictures.
 * Without the table, nothing is listed and adding says "not available yet".
 */
type Sql = postgres.Sql;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const TIMEOUT_MS = 5000;

export type Fetched = { ok: true; post: Post } | { ok: false; why: string; status: number };

export const POSTS_WORDING = {
  notFound: 'We couldn’t find that post on its network. Check the address, or try again in a minute.',
  unreachable: 'That network didn’t answer just now. Try again in a minute.',
  labelled: 'That post can’t be listed here: Bluesky marks it, or its account, as not for showing on other sites.',
  noLink: 'That post doesn’t link to this version’s page. Add the page’s link to your post, then add it here.',
  off: 'Adding where you posted it isn’t open yet.',
  notYet: 'Adding where you posted it isn’t available yet.',
  tooMany: `You can add ${CHALLENGE.postsPerPersonPerDay} posts a day. More tomorrow (00:00 UTC).`,
} as const;

/** Every request goes through here: only to an API host, never following a redirect, never cached. */
async function ask(f: Fetch, url: string, init: RequestInit, headers: Record<string, string> = {}): Promise<Response> {
  const host = new URL(url).hostname;
  if (!(API_HOSTS as readonly string[]).includes(host)) throw new Error(`posts: refused to ask ${host}`);
  return f(url, { ...init, headers: { accept: 'application/json', ...((init.headers as Record<string, string>) ?? {}), ...headers }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** The post, from its network's API. Never throws. `f` is fetch, or a stand-in in the tests. */
export async function fetchPost(ref: PostRef, f: Fetch = fetch): Promise<Fetched> {
  try {
    const first = firstRequest(ref);
    if (ref.network === 'farcaster') {
      const key = process.env.NEYNAR_API_KEY;
      if (!key) return { ok: false, why: POSTS_WORDING.unreachable, status: 503 };
      const r = await ask(f, first.url, first.init, { 'x-api-key': key });
      if (r.status === 404 || r.status === 400) return { ok: false, why: POSTS_WORDING.notFound, status: 404 };
      if (!r.ok) return { ok: false, why: POSTS_WORDING.unreachable, status: 503 };
      const post = parseNeynarCast(await r.json());
      if (!post || ('hash' in ref && !post.id.startsWith(ref.hash)) || ('fullHash' in ref && post.id !== ref.fullHash) || ('username' in ref && post.handle !== ref.username))
        return { ok: false, why: POSTS_WORDING.notFound, status: 404 };
      return { ok: true, post };
    }
    if (ref.network === 'bluesky') {
      let did = ref.actor.startsWith('did:') ? ref.actor : null;
      let postsUrl = did ? first.url : null;
      if (!did) {
        const r = await ask(f, first.url, first.init);
        if (r.status === 400 || r.status === 404) return { ok: false, why: POSTS_WORDING.notFound, status: 404 };
        if (!r.ok) return { ok: false, why: POSTS_WORDING.unreachable, status: 503 };
        did = parseResolveHandle(await r.json());
        postsUrl = did ? bskyPostsRequest(did, ref.rkey) : null;
      }
      if (!postsUrl) return { ok: false, why: POSTS_WORDING.notFound, status: 404 };
      const r = await ask(f, postsUrl, { method: 'GET' });
      if (!r.ok) return { ok: false, why: r.status === 400 ? POSTS_WORDING.notFound : POSTS_WORDING.unreachable, status: r.status === 400 ? 404 : 503 };
      const post = parseBskyPosts(await r.json(), ref.rkey);
      if (post === 'labelled') return { ok: false, why: POSTS_WORDING.labelled, status: 422 };
      if (!post || !post.id.startsWith(`at://${did}/`)) return { ok: false, why: POSTS_WORDING.notFound, status: 404 };
      return { ok: true, post };
    }
    const r = await ask(f, first.url, first.init);
    if (!r.ok) return { ok: false, why: POSTS_WORDING.unreachable, status: 503 };
    const post = parseLensPost(await r.json(), ref.slug);
    return post ? { ok: true, post } : { ok: false, why: POSTS_WORDING.notFound, status: 404 };
  } catch (e) {
    console.error('posts: the network did not answer', (e as Error).name);
    return { ok: false, why: POSTS_WORDING.unreachable, status: 503 };
  }
}

/** The post, read and checked: it must link to this version's page. */
export async function verifiedPost(ref: PostRef, versionId: string, f: Fetch = fetch): Promise<Fetched> {
  const got = await fetchPost(ref, f);
  if (!got.ok) return got;
  if (!linksToVersion(got.post, versionId)) return { ok: false, why: POSTS_WORDING.noLink, status: 422 };
  return got;
}

// ---------------------------------------------------------------------------------------------
// Stored: studio.version_posts
// ---------------------------------------------------------------------------------------------
export interface ShownPost {
  id: string;
  network: Network;
  handle: string;
  at: string;
  url: string;
  /** The person who added it (FID, or minus a wallet account), so they can remove it. Never shown. */
  addedBy: number;
}

let missingUntil = 0;
const missing = (e: unknown) => (e as { code?: string }).code === '42P01';

/** The posts listed on a version's page: newest first (the only order), at most CHALLENGE.postsPerVersion. Empty without the table. */
export async function postsFor(sql: Sql, versionId: string): Promise<ShownPost[]> {
  if (Date.now() < missingUntil) return [];
  try {
    const rows = await sql<{ id: string; network: Network; handle: string; posted_at: Date; url: string; fid: string }[]>`
      select id::text, network, handle, posted_at, url, fid from studio.version_posts
      where version_id = ${versionId} order by posted_at desc, id desc limit ${CHALLENGE.postsPerVersion}`;
    return rows.map((r) => ({ id: r.id, network: r.network, handle: r.handle, at: new Date(r.posted_at).toISOString(), url: r.url, addedBy: Number(r.fid) }));
  } catch (e) {
    if (missing(e)) missingUntil = Date.now() + 60_000;
    else console.error('posts: none read', (e as { code?: string }).code ?? (e as Error).name);
    return [];
  }
}

export type AddResult = { ok: true; added: boolean } | { ok: false; why: string; status: number };

/** Keep a checked post for a version. Once per post per version; a few a day per person. */
export async function addPost(sql: Sql, p: { versionId: string; person: number; post: Post }): Promise<AddResult> {
  try {
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from studio.version_posts where fid = ${p.person} and added_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
    if (Number(n?.n ?? 0) >= CHALLENGE.postsPerPersonPerDay) return { ok: false, why: POSTS_WORDING.tooMany, status: 429 };
    const rows = await sql`insert into studio.version_posts ${sql({ version_id: p.versionId, network: p.post.network, post_id: p.post.id, handle: p.post.handle, posted_at: p.post.at, url: p.post.url, fid: p.person })}
      on conflict (version_id, network, post_id) do nothing returning id`;
    return { ok: true, added: rows.length > 0 };
  } catch (e) {
    if (missing(e)) return { ok: false, why: POSTS_WORDING.notYet, status: 503 };
    throw e;
  }
}

/** Remove a listed post: the person who added it may. (Moderators remove through removePostAsModerator.) */
export async function removeOwnPost(sql: Sql, id: string, person: number): Promise<boolean> {
  if (!/^[0-9]{1,18}$/.test(id)) return false;
  const rows = await sql`delete from studio.version_posts where id = ${id} and fid = ${person} returning id`;
  return rows.length > 0;
}
