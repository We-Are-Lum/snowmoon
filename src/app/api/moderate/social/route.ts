import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { ADMINS, MODERATOR_FIDS } from '~/lib/config';
import { type Network, byNewest, hideKey } from '~/lib/social/parse';
import { allPosts, hiddenPosts, socialReadOn } from '~/lib/social/read';

/**
 * "Posts that link here", for moderators and admins (P5b: they only hide): every post read from Farcaster and Bluesky,
 * newest first, each marked if hidden, and one action, Hide, with the reason: the person who wrote it asked (by email
 * to CONTACT_EMAIL), or it breaks the Terms. A hide is a row in studio.social_hidden (NEXT_social_read.sql); nothing
 * here can show, order or unhide a post.
 */
const mayHide = (fid: number) => MODERATOR_FIDS.includes(fid) || ADMINS.includes(fid);
const REASONS = ['writer_asked', 'terms'] as const;

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!mayHide(fid)) return NextResponse.json({ error: 'Moderators only' }, { status: 403 });
  // Off: no page shows posts, so there is nothing to hide, and neither network is asked.
  if (!socialReadOn()) return NextResponse.json({ on: false, ready: false, posts: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const hidden = await hiddenPosts();
  if (!hidden) return NextResponse.json({ on: true, ready: false, posts: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const posts = byNewest(await allPosts()).map((p) => ({ ...p, hidden: hidden.has(hideKey(p.network, p.id)) }));
  return NextResponse.json({ on: true, ready: true, posts }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!mayHide(fid)) return NextResponse.json({ error: 'Moderators only' }, { status: 403 });
  const sql = db();
  if (!sql || !socialReadOn()) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const { network, id, reason } = (await request.json().catch(() => ({}))) as { network?: unknown; id?: unknown; reason?: unknown };
  if (!REASONS.includes(reason as (typeof REASONS)[number])) return NextResponse.json({ error: 'Say why: the writer asked, or it breaks the Terms' }, { status: 400 });
  // Only a post that was read can be hidden: those are the only ones a page could show.
  const post = (await allPosts()).find((p) => p.network === network && p.id === id);
  if (!post) return NextResponse.json({ error: 'No such post among those read' }, { status: 404 });
  try {
    await sql`insert into studio.social_hidden ${sql({ network: post.network as Network, post_id: post.id, by_fid: fid, reason: reason as string })}
      on conflict (network, post_id) do nothing`;
  } catch (e) {
    console.error('social-read: could not hide', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: 'Not available yet' }, { status: 503 });
  }
  // Chapters and images are kept for a while (revalidate); adaptation pages are made on each request.
  revalidatePath('/chapter/[n]', 'page');
  revalidatePath('/image/[id]', 'page');
  return NextResponse.json({ done: 'hidden' });
}
