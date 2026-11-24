/**
 * Fail closed in an outage (owner, 2026-11-23), for scripts/test-sessions.ts: run in its own process with the database
 * address set to a closed port, so every read of studio.session_ends fails at once (ECONNREFUSED), as in an outage.
 * Calls the real routes and prints what each did as JSON; test-sessions.ts checks it.
 */
const F = await import('../../src/lib/farcaster-session');
const Wl = await import('../../src/lib/wallet/session');
const So = await import('../../src/lib/social/session');
const SE = await import('../../src/lib/session-ends');
const A = await import('../../src/lib/auth');
const me = await import('../../src/app/api/auth/me/route');
const activity = await import('../../src/app/api/admin/activity/route');
const endAll = await import('../../src/app/api/auth/sign-out-everywhere/route');
const hide = await import('../../src/app/api/remix/[id]/hide/route');
const { ADMINS } = await import('../../src/lib/config');
const req = (url: string, token: string, method = 'GET') => new Request(`http://localhost${url}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
const outcome = async (p: Promise<unknown>) => p.then((v) => (v instanceof Response ? v.status : v), (e: unknown) => (e instanceof SE.SessionCheckUnavailable ? 'unavailable' : `other: ${(e as Error).name}`));
const fc = F.signFarcasterSession(777001)!;
const admin = F.signFarcasterSession(ADMINS[0])!;
const wallet = Wl.signSession(5, '0x' + 'ab'.repeat(20))!;
const lens = So.signSocialSession({ account: 41, kind: 'lens', subject: '0x' + '12'.repeat(20), handle: 'lens/x' })!;
console.log(JSON.stringify({
  getFid: await outcome(A.getFid(req('/x', fc))),
  me: await outcome(me.GET(req('/api/auth/me', fc))),
  admin: await outcome(activity.GET(req('/api/admin/activity?days=7', admin))),
  wallet: await outcome(A.getWallet(req('/x', wallet))),
  walletSide: await outcome(A.walletFrom(wallet)),
  lens: await outcome(A.getSocial(req('/x', lens))),
  hide: await outcome(hide.POST(req('/api/remix/1/hide', fc, 'POST'), { params: Promise.resolve({ id: '1' }) })),
  endAll: await outcome(endAll.POST(req('/api/auth/sign-out-everywhere', fc, 'POST'))),
}));
process.exit(0);
