import { NextResponse } from 'next/server';
import { getFid, signedInAccount } from '~/lib/auth';
import { LINKED_ACCOUNTS } from '~/lib/config';
import { db } from '~/lib/db';
import { missingNetworks, type Kind } from '~/lib/linked/accounts';
import * as v2 from '~/lib/linked/v2';
import { socialPerson } from '~/lib/people';
import { readSocialSession } from '~/lib/social/session';
import { readSession } from '~/lib/wallet/session';

/**
 * Linked accounts v2 (LINKED_ACCOUNTS, off: 404; src/lib/linked/v2.ts; docs/proposals/linked-accounts-v2.md).
 * DRAFT. Every change goes through v2, which decides who may do it (the main sign-in, or any sign-in for itself).
 *
 * GET: the Snowmoon account of this sign-in: its sign-ins (kind and number only), the main, the networks it could
 * still link, and a pending request for a new main (the banner on every sign-in).
 * POST { action, … }, by the signed-in sign-in (the bearer token; 401 without one):
 * - 'link' { account }: the main links a sign-in; that sign-in's own fresh proof is in `X-Link-Session` (a Quick Auth
 *   token, a `w1.` wallet session or an `s1.` Lens or Bluesky session, each checked here), and the body names the
 *   account the page showed; if the proof is now another account, nothing is linked;
 * - 'join': the main joins its Snowmoon account with another; the other account's MAIN signs in `X-Link-Session`;
 * - 'main' { account }: the main chooses another main;
 * - 'request' { account? }: a sign-in that isn't main asks for a new main (itself by default); no notification;
 * - 'cancel': the main cancels a pending request.
 * DELETE { account, next? }: unlink: any sign-in itself (the main names the next main), or the main another.
 * Each refusal names its reason (`reason`) with DRAFT words for the person (src/lib/linked/v2-wording.ts).
 */
const noStore = { 'Cache-Control': 'no-store' };
const off = () => new NextResponse('Not found', { status: 404 });
const signInFirst = () => NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
const STATUS: Partial<Record<v2.Refused['why'], number>> = { 'not-main': 403, 'only-main-cancels': 403, 'not-linked': 404, attempts: 429, off: 404 };
const answer = (r: v2.Result<object>, ok: Record<string, unknown> = {}) =>
  r.ok
    ? NextResponse.json({ done: true, ...ok }, { headers: noStore })
    : NextResponse.json({ error: r.message, reason: r.why, ...(r.until ? { until: r.until.toISOString() } : {}) }, { status: STATUS[r.why] ?? 409, headers: noStore });

/** The sign-in in `X-Link-Session`, checked: its number, kind and (a wallet) address. */
async function otherSignIn(request: Request): Promise<{ account: number; kind: Kind; address?: string } | null> {
  const token = request.headers.get('x-link-session')?.trim();
  if (!token) return null;
  const w = readSession(token);
  if (w) return { account: -w.account, kind: 'wallet', address: w.address };
  const s = readSocialSession(token);
  if (s) return { account: socialPerson(s.account), kind: s.kind };
  const fid = await getFid(new Request(request.url, { headers: { authorization: `Bearer ${token}`, host: request.headers.get('host') ?? '' } }));
  return fid !== null ? { account: fid, kind: 'farcaster' } : null;
}

const database = () => {
  const sql = db();
  return sql ? v2.fromPostgres(sql) : null;
};
const unavailable = () => NextResponse.json({ error: 'Not available here' }, { status: 503, headers: noStore });

export async function GET(request: Request) {
  if (!LINKED_ACCOUNTS.enabled) return off();
  const me = await signedInAccount(request);
  if (!me) return signInFirst();
  const d = database();
  if (!d) return unavailable();
  const now = new Date();
  const r = await v2.signIn(d, me.account, now);
  if (!r.ok) return answer(r);
  const members = (await v2.signInsOf(d, r.person)).map((x) => ({ kind: x.kind, account: x.account }));
  return NextResponse.json(
    {
      accounts: members,
      main: await v2.mainOf(d, r.person, now),
      canLink: missingNetworks(members),
      walletsLeft: LINKED_ACCOUNTS.maxWallets - members.filter((m) => m.kind === 'wallet').length,
      request: await v2.pendingRequest(d, r.person, now),
    },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  if (!LINKED_ACCOUNTS.enabled) return off();
  const me = await signedInAccount(request);
  if (!me) return signInFirst();
  const d = database();
  if (!d) return unavailable();
  const now = new Date();
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; account?: unknown };
  const account = Number.isSafeInteger(body.account) && body.account !== 0 ? (body.account as number) : null;
  switch (body.action ?? 'link') {
    case 'link': {
      const added = await otherSignIn(request);
      if (!added) return NextResponse.json({ error: 'Sign in with the account to link too' }, { status: 401, headers: noStore });
      if (account !== added.account) return NextResponse.json({ error: 'You are signed in with a different account now. Reload the page and check again.', reason: 'other-account' }, { status: 409, headers: noStore });
      return answer(await v2.link(d, { actor: me.account, add: added.account, now, address: added.address }));
    }
    case 'join': {
      const other = await otherSignIn(request);
      if (!other) return NextResponse.json({ error: 'Sign in with the other account\'s main sign-in too' }, { status: 401, headers: noStore });
      return answer(await v2.join(d, { actor: me.account, other: other.account, now }));
    }
    case 'main':
      if (account === null) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: noStore });
      return answer(await v2.chooseMain(d, { actor: me.account, to: account, now }));
    case 'request':
      return answer(await v2.requestMain(d, { actor: me.account, newMain: account ?? undefined, now }));
    case 'cancel':
      return answer(await v2.cancelRequest(d, { actor: me.account, now }));
    default:
      return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  if (!LINKED_ACCOUNTS.enabled) return off();
  const me = await signedInAccount(request);
  if (!me) return signInFirst();
  const d = database();
  if (!d) return unavailable();
  const body = (await request.json().catch(() => ({}))) as { account?: unknown; next?: unknown };
  if (!Number.isSafeInteger(body.account) || body.account === 0) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: noStore });
  const next = Number.isSafeInteger(body.next) && body.next !== 0 ? (body.next as number) : undefined;
  return answer(await v2.unlink(d, { actor: me.account, target: body.account as number, now: new Date(), nextMain: next }));
}
