import { NextResponse } from 'next/server';
import { getFid, getSocial } from '~/lib/auth';
import { signInOpen } from '~/lib/config';
import { db } from '~/lib/db';
import { linkSocial, unlinkFrom, unlinkSocial, type SocialLinkTarget } from '~/lib/social/accounts';
import { LINK_WORDING } from '~/lib/social/link-wording';
import { readSocialSession } from '~/lib/social/session';

/**
 * Link a Lens or Bluesky account to a Farcaster account, or a Bluesky account to a Lens account; or unlink (branch
 * signin-lens-bluesky). The way to free generations for a Bluesky account (src/lib/social/free.ts).
 *
 * POST, both proofs in one request, never taken from the page's word:
 * - the account being linked: its own sign-in in `X-Social-Session` (our signature, not expired);
 * - what it links to: a Farcaster sign-in as the bearer token (getFid), or, for a Bluesky account, a Lens sign-in as
 *   the bearer token. The body names what the page showed ({ fid } or { lens: true }); if the sign-in is now another
 *   account, nothing is linked.
 * The 30-day wait (owner, 2026-11-04): an account unlinked less than 30 days ago links only to the account it was
 * linked to before (409 'wait', with the date it can link elsewhere).
 * DELETE, unlink: the account's own sign-in (bearer or `X-Social-Session`); or, with `{ account }` in the body, the
 * Farcaster sign-in (or, for a Bluesky account, the Lens sign-in) it is linked to, which ends only its own link.
 * 404 while both Lens and Bluesky sign-in are off.
 */
const noStore = { 'Cache-Control': 'no-store' };
const no = (error: string, status: number, reason?: string) => NextResponse.json({ error, reason }, { status, headers: noStore });
const open = () => signInOpen('lens') || signInOpen('bluesky');

export async function POST(request: Request) {
  if (!open()) return new NextResponse('Not found', { status: 404 });
  const me = readSocialSession(request.headers.get('x-social-session'));
  if (!me) return NextResponse.json({ error: 'Sign in with Lens or Bluesky first' }, { status: 401, headers: noStore });
  const body = (await request.json().catch(() => ({}))) as { fid?: unknown; lens?: unknown };
  let target: SocialLinkTarget;
  if (body.lens === true) {
    const lens = getSocial(request);
    if (!lens || lens.kind !== 'lens') return NextResponse.json({ error: 'Sign in with Lens too' }, { status: 401, headers: noStore });
    if (me.kind !== 'bluesky') return no('Only a Bluesky account links to a Lens account.', 400, 'lens-to-lens');
    target = { lensAccount: lens.account };
  } else {
    const fid = await getFid(request);
    if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster too' }, { status: 401, headers: noStore });
    if (body.fid !== fid) return no('You are signed in with a different Farcaster account now. Reload the page and check again.', 409, 'other-fid');
    target = { fid };
  }
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const r = await linkSocial(sql, { id: me.account, kind: me.kind }, target);
  if (!r.ok) {
    if (r.why === 'same-network') return no(LINK_WORDING.sameNetwork(r.kind), 409, r.why);
    if (r.why === 'wait') return NextResponse.json({ error: LINK_WORDING.wait(r.until), reason: r.why, until: r.until }, { status: 409, headers: noStore });
    return no(r.why === 'linked-elsewhere' ? LINK_WORDING.linkedElsewhere : r.why === 'not-yet' ? LINK_WORDING.notYet : LINK_WORDING.cannot, r.why === 'not-yet' ? 503 : 409, r.why);
  }
  return NextResponse.json({ linked: true, created: r.created }, { headers: noStore });
}

export async function DELETE(request: Request) {
  if (!open()) return new NextResponse('Not found', { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { account?: unknown };
  if (body.account !== undefined) {
    // From the other side: the Farcaster account (or Lens account) this one is linked to.
    if (!Number.isInteger(body.account) || (body.account as number) <= 0) return no('Bad request', 400);
    const fid = await getFid(request);
    const lens = fid === null ? getSocial(request) : null;
    const side: SocialLinkTarget | null = fid !== null ? { fid } : lens?.kind === 'lens' ? { lensAccount: lens.account } : null;
    if (!side) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
    const sql = db();
    if (!sql) return no('Not available here', 503);
    const done = await unlinkFrom(sql, side, body.account as number);
    if (done === 'not-yet') return no(LINK_WORDING.notYet, 503, done);
    if (done === 'none') return no(LINK_WORDING.notLinked, 409, done);
    return NextResponse.json({ unlinked: true }, { headers: noStore });
  }
  const me = getSocial(request) ?? readSocialSession(request.headers.get('x-social-session'));
  if (!me) return NextResponse.json({ error: 'Sign in with the Lens or Bluesky account first' }, { status: 401, headers: noStore });
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const done = await unlinkSocial(sql, me.account);
  if (done === 'not-yet') return no(LINK_WORDING.notYet, 503, done);
  if (done === 'none') return no(LINK_WORDING.notLinked, 409, done);
  return NextResponse.json({ unlinked: true }, { headers: noStore });
}
