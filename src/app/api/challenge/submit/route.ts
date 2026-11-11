import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid, getPerson, getSocial } from '~/lib/auth';
import { isWalletPerson } from '~/lib/people';
import { db } from '~/lib/db';
import { mySubmissions, submitEntry, SUBMIT_WORDING, withdrawEntry } from '~/lib/challenge/entries';
import { castFromHash, readPostAddress, writerCheck } from '~/lib/challenge/post-links';
import { verifiedPost } from '~/lib/challenge/posts';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * Submit (the remix challenge, owner 2026-11-04): a remix becomes an entry only when its maker presses Submit here.
 * POST { versionId, url } (or { versionId, castHash }, the cast the Farcaster app just made): the post is read from its
 * network's own API and must link to the version's page, exactly as "Add where you posted it" checks it (the pasted
 * address itself is never fetched) and must be the submitter's own (writerCheck: a cast by the Farcaster account they
 * are signed in with, a Bluesky post by the Bluesky account, a Lens post by the Lens account; others refused until
 * linked accounts exist); then,
 * under a lock, one a Pacific day (CHALLENGE.submissionsPerDay; a withdrawn one still uses its day), and the post is listed and the
 * submission kept. DELETE { versionId }: withdraw it, until entries close.
 * GET: how many more the signed-in maker may submit, and which versions they submitted (their own only).
 * While the challenge is admin-only (CHALLENGE.public off; owner, 2026-11-04), every method answers 404 to everyone but
 * an admin, as /challenge does.
 */
const no = (error: string, status: number) => NextResponse.json({ error }, { status });
const hidden = (fid: number | null) => (challengeVisibleTo(fid) ? null : NextResponse.json({ error: 'Not found' }, { status: 404 }));
const asVersion = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v : null);

/** Who submits: the signed-in person (a FID, or a Lens or Bluesky account's person number). */
const who = (request: Request) => getPerson(request);

export async function GET(request: Request) {
  const fid = await who(request);
  const no404 = hidden(fid);
  if (no404) return no404;
  const sql = db();
  if (fid === null || !sql) return NextResponse.json({ left: null, versions: [], person: null }, { headers: { 'Cache-Control': 'no-store' } });
  // `person`: the asker's own person number (a FID, or a Lens or Bluesky account's), so the page can tell a remix is theirs.
  return NextResponse.json({ ...(await mySubmissions(sql, fid)), person: fid }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const fid = await who(request);
  const no404 = hidden(fid);
  if (no404) return no404;
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster to submit your remix' }, { status: 401 });
  if (isWalletPerson(fid)) return no(SUBMIT_WORDING.walletCantSubmit, 403);
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { versionId?: unknown; url?: unknown; castHash?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const versionId = asVersion(body.versionId);
  if (!versionId) return no('Bad request', 400);
  if (body.url === undefined && body.castHash === undefined) return no(SUBMIT_WORDING.needsPost, 400);
  const read = body.castHash !== undefined ? castFromHash(body.castHash) : readPostAddress(body.url);
  if (!read.ok) return no(read.why, 400);
  const got = await verifiedPost(read.ref, versionId);
  if (!got.ok) return no(got.why, got.status);
  // The post must be the submitter's own (owner, 2026-11-04, answer 9.4): a cast by the Farcaster account they are
  // signed in with; a Bluesky post by the Bluesky account they are signed in with (its DID); a Lens post by the Lens
  // account they are signed in with (its author). Others are refused until linked accounts exist (overnight run
  // 2026-11-05, item 4).
  const social = getSocial(request);
  const farcaster = await getFid(request);
  const mine = writerCheck(got.post, {
    fid: farcaster ?? 0,
    blueskyDids: social?.kind === 'bluesky' ? [social.subject] : [],
    lensAccounts: social?.kind === 'lens' ? [social.subject] : [],
  });
  if (mine === 'not-yours') return no(SUBMIT_WORDING.notYourPost, 403);
  if (mine === 'unknown') return no(got.post.network === 'lens' ? SUBMIT_WORDING.lensUnknown : SUBMIT_WORDING.blueskyUnknown, 403);
  const r = await submitEntry(sql, fid, versionId, got.post);
  if (!r.ok) return no(r.why, r.status);
  revalidatePath('/challenge');
  revalidatePath(`/references/designs/${versionId}`);
  return NextResponse.json({ submitted: versionId, left: r.left });
}

export async function DELETE(request: Request) {
  const fid = await who(request);
  const no404 = hidden(fid);
  if (no404) return no404;
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster first' }, { status: 401 });
  const sql = db();
  if (!sql) return no('Not set up on this deployment', 503);
  let body: { versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const versionId = asVersion(body.versionId);
  if (!versionId) return no('Bad request', 400);
  const r = await withdrawEntry(sql, fid, versionId);
  if (!r.ok) return no(r.why, r.status);
  revalidatePath('/challenge');
  revalidatePath(`/references/designs/${versionId}`);
  return NextResponse.json({ withdrawn: versionId, left: r.left });
}
