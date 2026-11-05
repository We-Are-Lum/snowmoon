import { NextResponse } from 'next/server';
import { getFid, signedInAccount } from '~/lib/auth';
import { LINKED_ACCOUNTS } from '~/lib/config';
import { db } from '~/lib/db';
import { link, missingNetworks, personOf, unlink, type Kind } from '~/lib/linked/accounts';
import { LINKED_WORDING } from '~/lib/linked/wording';
import { socialPerson } from '~/lib/people';
import { readSocialSession } from '~/lib/social/session';
import { readSession } from '~/lib/wallet/session';

/**
 * Linked accounts (LINKED_ACCOUNTS, off: 404; src/lib/linked/accounts.ts; docs/proposals/linked-accounts.md).
 *
 * GET: the signed-in person's accounts (kind and number only) and the networks they could still link.
 * POST: link. Both proofs in one request, never taken from the page's word:
 * - the person: their sign-in as the bearer token (Farcaster Quick Auth, a wallet's or a Lens or Bluesky session);
 * - the account being added: its own fresh sign-in in `X-Link-Session` (a Quick Auth token, a `w1.` wallet session or
 *   an `s1.` Lens or Bluesky session, each checked here);
 * - the body names the account the page showed ({ account }); if the sign-in is now another account, nothing is linked.
 * DELETE { account }: unlink one of the person's accounts, by any of the person's sign-ins.
 * Each refusal names its rule (A1–A8) in `reason`, with words for the person.
 */
const noStore = { 'Cache-Control': 'no-store' };
const no = (error: string, status: number, reason?: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, reason, ...extra }, { status, headers: noStore });
const off = () => new NextResponse('Not found', { status: 404 });

/** The account in `X-Link-Session`, checked: its number, kind and (a wallet) address. */
async function addedAccount(request: Request): Promise<{ account: number; kind: Kind; address?: string } | null> {
  const token = request.headers.get('x-link-session')?.trim();
  if (!token) return null;
  const w = readSession(token);
  if (w) return { account: -w.account, kind: 'wallet', address: w.address };
  const s = readSocialSession(token);
  if (s) return { account: socialPerson(s.account), kind: s.kind };
  const fid = await getFid(new Request(request.url, { headers: { authorization: `Bearer ${token}`, host: request.headers.get('host') ?? '' } }));
  return fid !== null ? { account: fid, kind: 'farcaster' } : null;
}

export async function GET(request: Request) {
  if (!LINKED_ACCOUNTS.enabled) return off();
  const me = await signedInAccount(request);
  if (!me) return no('Sign in first', 401);
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const p = await personOf(sql, me.account, me.kind);
  return NextResponse.json({ accounts: p.members, canLink: missingNetworks(p.members), walletsLeft: LINKED_ACCOUNTS.maxWallets - p.members.filter((m) => m.kind === 'wallet').length }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!LINKED_ACCOUNTS.enabled) return off();
  const me = await signedInAccount(request);
  if (!me) return no('Sign in first', 401);
  const added = await addedAccount(request);
  if (!added) return no('Sign in with the account to link too', 401);
  const body = (await request.json().catch(() => ({}))) as { account?: unknown };
  if (body.account !== added.account) return no('You are signed in with a different account now. Reload the page and check again.', 409, 'other-account');
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const r = await link(sql, me, added, 'signed');
  if (!r.ok) {
    const words = r.why === 'wait' ? LINKED_WORDING.link.wait(r.until) : LINKED_WORDING.link[r.why];
    return no(words, r.why === 'attempts' ? 429 : 409, r.why, r.why === 'wait' ? { until: r.until } : {});
  }
  return NextResponse.json({ linked: true, created: r.created }, { headers: noStore });
}

export async function DELETE(request: Request) {
  if (!LINKED_ACCOUNTS.enabled) return off();
  const me = await signedInAccount(request);
  if (!me) return no('Sign in first', 401);
  const body = (await request.json().catch(() => ({}))) as { account?: unknown };
  if (!Number.isSafeInteger(body.account) || body.account === 0) return no('Bad request', 400);
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const r = await unlink(sql, me.account, body.account as number);
  if (!r.ok) return no(LINKED_WORDING.unlink[r.why], r.why === 'none' ? 404 : 409, r.why);
  return NextResponse.json({ unlinked: true }, { headers: noStore });
}
