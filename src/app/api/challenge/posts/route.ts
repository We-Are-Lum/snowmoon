import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { CHALLENGE } from '~/lib/config';
import { isModerator } from '~/lib/challenge/moderators';
import { castFromHash, readPostAddress } from '~/lib/challenge/post-links';
import { addPost, POSTS_WORDING, postsFor, removeOwnPost, verifiedPost } from '~/lib/challenge/posts';
import { designByVersion } from '~/lib/images/designs';

/**
 * "Add where you posted it" (owner, 2026-10-31). POST { versionId, url } or { versionId, castHash } (the cast the
 * Farcaster app just made through composeCast). The address is only read: its host must be exactly one of the three
 * networks', and the post is then asked of that network's own API (src/lib/challenge/post-links.ts); the address
 * itself is never fetched. The post must link to the version's page. DELETE { id }: the person who added it, or a
 * moderator, removes it. Off (503) while CHALLENGE.posts is off.
 */
const no = (error: string, status: number) => NextResponse.json({ error }, { status });

/** GET ?versionId=: which listed posts the signed-in person may remove (the ones they added; all of them for a moderator). */
export async function GET(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ removable: [] });
  const sql = db();
  const versionId = new URL(request.url).searchParams.get('versionId') ?? '';
  if (!sql || !/^[0-9a-f-]{36}$/.test(versionId)) return NextResponse.json({ removable: [] });
  const posts = await postsFor(sql, versionId);
  return NextResponse.json({ removable: posts.filter((p) => p.addedBy === person || isModerator(person)).map((p) => p.id) });
}

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in to add where you posted it' }, { status: 401 });
  if (!CHALLENGE.posts) return no(POSTS_WORDING.off, 503);
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { versionId?: unknown; url?: unknown; castHash?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const versionId = typeof body.versionId === 'string' && /^[0-9a-f-]{36}$/.test(body.versionId) ? body.versionId : null;
  if (!versionId || !(await designByVersion(sql, versionId))) return no('No such version', 404);
  const read = body.castHash !== undefined ? castFromHash(body.castHash) : readPostAddress(body.url);
  if (!read.ok) return no(read.why, 400);
  const got = await verifiedPost(read.ref, versionId);
  if (!got.ok) return no(got.why, got.status);
  const r = await addPost(sql, { versionId, person, post: got.post });
  if (!r.ok) return no(r.why, r.status);
  revalidatePath(`/references/designs/${versionId}`);
  return NextResponse.json({ added: r.added, post: { network: got.post.network, handle: got.post.handle, at: got.post.at, url: got.post.url } });
}

export async function DELETE(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { id?: unknown; versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const id = typeof body.id === 'string' && /^[0-9]{1,18}$/.test(body.id) ? body.id : null;
  if (!id) return no('Bad request', 400);
  const removed = (await removeOwnPost(sql, id, person)) || (isModerator(person) && (await sql`delete from studio.version_posts where id = ${id} returning id`).length > 0);
  if (!removed) return no('Only the person who added it, or a moderator, can remove it', 403);
  if (typeof body.versionId === 'string' && /^[0-9a-f-]{36}$/.test(body.versionId)) revalidatePath(`/references/designs/${body.versionId}`);
  return NextResponse.json({ removed: true });
}
