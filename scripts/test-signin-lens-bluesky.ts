/**
 * Lens and Bluesky sign-in (branch signin-lens-bluesky, owner's item 5 of 2026-10-31). Fails (exit 1) on any problem.
 *
 *   npm run test:signin-lens-bluesky
 *
 * No network and no spend: Lens's API, the DNS, plc.directory, the PDS and the Bluesky authorization server are
 * stand-ins written here (real crypto: a real RSA key signs Lens's ID tokens, real wallets sign Lens's challenges, the
 * DPoP proofs and PKCE are checked by the stand-in server as the spec says). Every migration, NEXT_signin_lens_bluesky
 * included, runs in an in-memory Postgres (PGlite), talked to as studio_writer. Never a production database: the
 * database URL is set here, to the local one, before anything is imported.
 *
 * Each rule below is run on what the real routes and libraries answered, then proven to fail on a planted violation
 * (the check-principles pattern): a rule whose plant passes is itself a failure.
 *
 * Rules:
 *  L1 Lens: a challenge signed by the wallet that owns the account signs in, as that account, with its username.
 *  L2 Lens: a manager's signature signs in as the account it manages (act.sub), not as the manager.
 *  L3 Lens: refused: another wallet's signature (Lens's WrongSignerError), an ID token signed by a key not in Lens's
 *     JWKS, one for another App, an expired one, one naming another account than the ticket's, a changed ticket.
 *  B1 Bluesky: the loopback client starts (PAR with PKCE and DPoP, after Lens-style nonce retry) and the callback
 *     signs in as the DID, with the handle that resolves back to it.
 *  B2 Bluesky: refused: a changed state, another issuer, a changed sealed state, a token for another DID, a DID whose
 *     PDS names another authorization server. A handle that doesn't resolve back is not kept.
 *  B3 Bluesky: the site's client metadata (https only), and no request to an IP literal or localhost.
 *  F1 Free generations: a Bluesky-only account gets none (gate, Pictures, Remix, the count), and no balance.
 *  F2 Linked: a Bluesky account linked to a Farcaster account signs in as that FID and gets its free count; unlinked,
 *     none again. Linked to a Lens account: what that Lens account gets.
 *  F3 Lens: no free generations while the threshold is null; with a threshold, at or above it yes, below it no; Lens
 *     unreachable, no.
 *  F4 Wallet accounts are unchanged: they pay from the balance, never the free count.
 *  M1 The migration: dry run, migration and read-back in one file run in order; the drafts are the same blocks; nothing
 *     is readable by anon or authenticated; a realistic row can be added and deleted.
 *  S1 Off: with Lens and Bluesky off (SIGN_IN_METHODS, no local test), every Lens and Bluesky route answers 404.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync, sign as signRsa, verify as verifySig, type JsonWebKey } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');

// --- S1 runs in a child process with nothing turned on ---------------------------------------------------------
if (process.argv.includes('--off')) {
  delete process.env.NEXT_PUBLIC_SIGN_IN_ALL_FOUR;
  process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
  const out: Record<string, number> = {};
  const post = (u: string) => new Request(`http://127.0.0.1:3000${u}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  out.lensAccounts = (await (await import('../src/app/api/auth/lens/accounts/route')).GET(new Request('http://127.0.0.1:3000/api/auth/lens/accounts?wallet=0x' + '1'.repeat(40)))).status;
  out.lensChallenge = (await (await import('../src/app/api/auth/lens/challenge/route')).POST(post('/api/auth/lens/challenge'))).status;
  out.lensVerify = (await (await import('../src/app/api/auth/lens/verify/route')).POST(post('/api/auth/lens/verify'))).status;
  out.blueskyStart = (await (await import('../src/app/api/auth/bluesky/start/route')).POST(post('/api/auth/bluesky/start'))).status;
  out.blueskyCallback = (await (await import('../src/app/api/auth/bluesky/callback/route')).POST(post('/api/auth/bluesky/callback'))).status;
  out.metadata = (await (await import('../src/app/oauth/bluesky/client-metadata.json/route')).GET(new Request('https://snowmoon.party/oauth/bluesky/client-metadata.json'))).status;
  out.link = (await (await import('../src/app/api/social-link/route')).POST(post('/api/social-link'))).status;
  console.log(JSON.stringify(out));
  process.exit(0);
}

process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
process.env.NEXT_PUBLIC_SIGN_IN_ALL_FOUR = '1';
delete process.env.NEXT_PUBLIC_VERCEL_ENV;
delete process.env.VERCEL;
process.env.APP_LEGAL_PAGES = 'terms+privacy';
process.env.SNOWMOON_ALERT_URL = 'https://alerts.invalid/x';
const PORT = 54343;
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;

const { PGlite } = await import('@electric-sql/pglite');
const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
const { privateKeyToAccount } = await import('viem/accounts');
const { verifyMessage } = await import('viem');

type Problems = string[];
interface Rule<T> {
  id: string;
  name: string;
  load: () => Promise<T>;
  run: (c: T) => Problems;
  plant: (c: T) => void;
}
const rules: Rule<any>[] = [];
const add = <T,>(r: Rule<T>) => rules.push(r);

// --- The database ------------------------------------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
for (const f of migrations) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const { db } = await import('../src/lib/db');
const sql = db()!;
await sql`set role studio_writer`;

const config = await import('../src/lib/config');
const { SOCIAL_SIGN_IN } = config;
const lensCfg = SOCIAL_SIGN_IN.lens as { minScore: number | null; app: string };
const session = await import('../src/lib/social/session');
const lens = await import('../src/lib/social/lens');
const at = await import('../src/lib/social/atproto');
const accounts = await import('../src/lib/social/accounts');
const { freeFor } = await import('../src/lib/social/free');
const people = await import('../src/lib/people');
const { getPerson } = await import('../src/lib/auth');
const { mayGenerate } = await import('../src/lib/images/gate');
const imageLimits = await import('../src/lib/images/limits');
const remixLimits = await import('../src/lib/remix/limits');
type Sql = Parameters<typeof imageLimits.reserve>[0];
const S = sql as unknown as Sql;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const call = async (mod: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) => {
  const m = (await import(mod)) as Record<string, (r: Request) => Promise<Response>>;
  const res = await m[method](new Request(url, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
};

// ==================================================================================================================
// Lens: a stand-in for api.lens.xyz, with a real RSA key and real wallets.
// ==================================================================================================================
const owner = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const manager = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
const stranger = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const LENS_ACCOUNT = '0xAd2c0BEAdE60fb9f7ec5C87bDE8e4c126145F6E7';
const OTHER_ACCOUNT = '0x' + 'b'.repeat(40);
const lensKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const forgerKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'tag:auth.lens.dev,2024:lens-api';
const jwkOf = (k: typeof lensKey) => ({ ...(k.publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: KID, use: 'sig' });
const rs256 = (claims: object, key = lensKey) => {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID })).toString('base64url');
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${h}.${p}.${signRsa('RSA-SHA256', Buffer.from(`${h}.${p}`), key.privateKey).toString('base64url')}`;
};
const lensWorld = {
  challenges: new Map<string, { account: string; signer: string; role: 'owner' | 'manager'; text: string }>(),
  /** What the next ID token says, for the refusal cases. */
  tamper: null as null | ((claims: Record<string, unknown>) => { claims: Record<string, unknown>; key?: typeof lensKey }),
  jwks: [jwkOf(lensKey)] as object[],
  score: new Map<string, number>([[LENS_ACCOUNT.toLowerCase(), 9990]]),
  down: false,
  seen: [] as string[],
};
let n = 0;
lens.LENS_HTTP.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === SOCIAL_SIGN_IN.lens.jwks) return json({ keys: lensWorld.jwks });
  if (url !== SOCIAL_SIGN_IN.lens.api) throw new Error(`unexpected Lens URL ${url}`);
  if (lensWorld.down) throw new TypeError('fetch failed');
  const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, any> };
  lensWorld.seen.push(query.trim().split(/[({\s]/)[0] + ' ' + (query.match(/\{\s*(\w+)/)?.[1] ?? ''));
  if (query.includes('accountsAvailable')) return json({ data: { accountsAvailable: { items: variables.w.toLowerCase() === owner.address.toLowerCase() ? [{ __typename: 'AccountOwned', account: { address: LENS_ACCOUNT, username: { value: 'lens/stani' } } }] : [] } } });
  if (query.includes('challenge(')) {
    const r = variables.r as Record<string, { app: string; account: string; owner?: string; manager?: string }>;
    const role = r.accountOwner ? 'owner' : 'manager';
    const q = r.accountOwner ?? r.accountManager;
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    const origin = new URL((init?.headers as Record<string, string>).origin);
    const signer = (q.owner ?? q.manager)!;
    const text = `${origin.host} wants you to sign in with your Ethereum account:\n${signer}\n\nSign in with Ethereum to ${q.app}\n\nURI: ${origin.origin}/\nVersion: 1\nChain ID: 232\nNonce: ${id}\nIssued At: ${new Date().toISOString()}`;
    lensWorld.challenges.set(id, { account: q.account, signer, role, text });
    return json({ data: { challenge: { id, text } } });
  }
  if (query.includes('authenticate(')) {
    const c = lensWorld.challenges.get(variables.r.id);
    if (!c) return json({ data: { authenticate: { __typename: 'ExpiredChallengeError', reason: 'no such challenge' } } });
    const good = (await verifyMessage({ address: c.signer as `0x${string}`, message: c.text, signature: variables.r.signature }).catch(() => false));
    if (!good) return json({ data: { authenticate: { __typename: 'WrongSignerError', reason: 'wrong signer' } } });
    // As Lens does: a manager's challenge is good only for a wallet the account has made its manager.
    if (c.role === 'manager' && !(c.account.toLowerCase() === LENS_ACCOUNT.toLowerCase() && c.signer.toLowerCase() === manager.address.toLowerCase()))
      return json({ data: { authenticate: { __typename: 'ForbiddenError', reason: 'not a manager' } } });
    const now = Math.floor(Date.now() / 1000);
    let claims: Record<string, unknown> =
      c.role === 'owner'
        ? { sub: c.account, iss: 'https://api.lens.xyz', aud: lensCfg.app, iat: now, exp: now + 600, sid: 's', 'tag:lens.dev,2024:role': 'ACCOUNT_OWNER' }
        : { sub: c.signer, act: { sub: c.account }, iss: 'https://api.lens.xyz', aud: lensCfg.app, iat: now, exp: now + 600, sid: 's', 'tag:lens.dev,2024:role': 'ACCOUNT_MANAGER' };
    let key = lensKey;
    if (lensWorld.tamper) ({ claims, key = lensKey } = lensWorld.tamper(claims));
    return json({ data: { authenticate: { __typename: 'AuthenticationTokens', accessToken: 'a', refreshToken: 'r', idToken: rs256(claims, key) } } });
  }
  if (query.includes('username { value }')) return json({ data: { account: { username: variables.a.toLowerCase() === LENS_ACCOUNT.toLowerCase() ? { value: 'lens/stani' } : null } } });
  if (query.includes('score')) {
    const s = lensWorld.score.get(String(variables.a).toLowerCase());
    return json({ data: { account: s === undefined ? null : { score: s } } });
  }
  if (query.includes('owner')) {
    const a = String(variables.a).toLowerCase();
    if (a === LENS_ACCOUNT.toLowerCase()) return json({ data: { account: { owner: owner.address } } });
    if (a === OTHER_ACCOUNT) return json({ data: { account: { owner: stranger.address } } });
    return json({ data: { account: null } });
  }
  throw new Error(`unexpected Lens query ${query.slice(0, 60)}`);
}) as typeof fetch;

const ORIGIN = 'http://127.0.0.1:3000';
async function lensSignIn(signer: typeof owner, signWith: typeof owner = signer, account = LENS_ACCOUNT, ticketEdit?: (t: string) => string) {
  const c = await call('../src/app/api/auth/lens/challenge/route', 'POST', `${ORIGIN}/api/auth/lens/challenge`, { account, signer: signer.address });
  if (c.status !== 200) return { status: c.status, body: c.body, stage: 'challenge' };
  const signature = await signWith.signMessage({ message: c.body.text });
  const v = await call('../src/app/api/auth/lens/verify/route', 'POST', `${ORIGIN}/api/auth/lens/verify`, { ticket: ticketEdit ? ticketEdit(c.body.ticket) : c.body.ticket, signature });
  return { status: v.status, body: v.body, stage: 'verify', text: c.body.text as string };
}

// L1 + L2 ----------------------------------------------------------------------------------------------------------
add({
  id: 'L1',
  name: 'Lens: the owner wallet signs in as the account, with its username; the challenge is for this site',
  load: async () => {
    const acc = await call('../src/app/api/auth/lens/accounts/route', 'GET', `${ORIGIN}/api/auth/lens/accounts?wallet=${owner.address}`);
    const r = await lensSignIn(owner);
    return { accounts: acc.body.accounts as { address: string }[], r, session: session.readSocialSession(r.body.token) };
  },
  run: ({ accounts: list, r, session: s }) => {
    const p: Problems = [];
    if (list?.[0]?.address !== LENS_ACCOUNT) p.push(`the wallet's Lens accounts were not listed (${JSON.stringify(list)})`);
    if (r.status !== 200 || !s) p.push(`the owner's signature didn't sign in (${r.status} ${JSON.stringify(r.body).slice(0, 120)})`);
    else if (s.kind !== 'lens' || s.subject !== LENS_ACCOUNT.toLowerCase() || s.handle !== 'lens/stani') p.push(`signed in as the wrong account: ${JSON.stringify(s)}`);
    if (!r.text?.startsWith('127.0.0.1:3000 wants you to sign in')) p.push('the challenge was not for this site');
    return p;
  },
  plant: (c) => {
    c.session = { ...c.session!, subject: owner.address.toLowerCase() };
  },
});
add({
  id: 'L2',
  name: 'Lens: a manager signs in as the account it manages (act.sub), never as the manager',
  load: async () => {
    const r = await lensSignIn(manager);
    return { r, s: session.readSocialSession(r.body.token) };
  },
  run: ({ r, s }) => (r.status === 200 && s?.subject === LENS_ACCOUNT.toLowerCase() ? [] : [`a manager's sign-in gave ${r.status} as ${s?.subject}`]),
  plant: (c) => {
    c.s = { ...c.s!, subject: manager.address.toLowerCase() };
  },
});

// L3 ---------------------------------------------------------------------------------------------------------------
add({
  id: 'L3',
  name: 'Lens: wrong signer, forged key, another App, expired, another account and a changed ticket are all refused',
  load: async () => {
    const out: Record<string, { status: number; why?: string; token?: string }> = {};
    const one = async (label: string, f: () => Promise<{ status: number; body: Record<string, any> }>) => {
      const r = await f();
      out[label] = { status: r.status, why: r.body.reason, token: r.body.token };
      lensWorld.tamper = null;
      lensWorld.jwks = [jwkOf(lensKey)];
      lens.forgetLensKeys();
    };
    await one('another wallet signed', () => lensSignIn(owner, stranger));
    await one('a key not in the JWKS', () => ((lensWorld.tamper = (c) => ({ claims: c, key: forgerKey })), lensSignIn(owner)));
    await one('another App', () => ((lensWorld.tamper = (c) => ({ claims: { ...c, aud: '0x' + 'c'.repeat(40) } })), lensSignIn(owner)));
    await one('expired', () => ((lensWorld.tamper = (c) => ({ claims: { ...c, exp: Math.floor(Date.now() / 1000) - 5 } })), lensSignIn(owner)));
    await one('another account', () => ((lensWorld.tamper = (c) => ({ claims: { ...c, sub: OTHER_ACCOUNT } })), lensSignIn(owner)));
    await one('a builder token', () => ((lensWorld.tamper = (c) => ({ claims: { ...c, 'tag:lens.dev,2024:role': 'BUILDER' } })), lensSignIn(owner)));
    await one('a changed ticket', () => lensSignIn(owner, owner, LENS_ACCOUNT, (t) => t.slice(0, 10) + (t[10] === 'A' ? 'B' : 'A') + t.slice(11)));
    await one('a stranger asks for the account', () => lensSignIn(stranger));
    return out;
  },
  run: (out) => Object.entries(out).filter(([, r]) => r.status < 400 || r.token).map(([k, r]) => `${k}: accepted (${r.status})`),
  plant: (out) => {
    out['another wallet signed'] = { status: 200, token: 's1.x.y' };
  },
});
// ==================================================================================================================
// Bluesky: stand-ins for DNS, plc.directory, a PDS and its authorization server.
// ==================================================================================================================
const DID = 'did:plc:' + 'abcdefghijklmnopqrstuvwx';
const DID2 = 'did:plc:' + 'zyxwvutsrqponmlkjihgfedc';
const HANDLE = 'alice.example.com';
const PDS = 'https://pds.example.com';
const AS = 'https://auth.example.com';
const world = {
  par: [] as Record<string, string>[],
  codes: new Map<string, { challenge: string; clientId: string; redirectUri: string; jkt: string; sub: string }>(),
  nonce: 'n-1',
  /** The DID's document names this PDS; a second DID, another. */
  pdsAuthServer: new Map<string, string>([[PDS, AS], ['https://pds2.example.com', 'https://other-auth.example.com']]),
  didDocs: new Map<string, { pds: string; handle: string | null }>([
    [DID, { pds: PDS, handle: HANDLE }],
    [DID2, { pds: 'https://pds2.example.com', handle: 'bob.example.com' }],
  ]),
  txt: new Map<string, string>([[`_atproto.${HANDLE}`, `did=${DID}`]]),
  tokenSub: null as string | null,
  requested: [] as string[],
};
const jkt = (jwk: JsonWebKey) => createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
function checkDpop(proof: string | null, htm: string, htu: string): { ok: boolean; jkt?: string; nonce?: string } {
  if (!proof) return { ok: false };
  const [h, p, s] = proof.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256' || header.jwk?.d) return { ok: false };
  const ok = verifySig('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: header.jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return { ok: ok && payload.htm === htm && payload.htu === htu && typeof payload.jti === 'string', jkt: jkt(header.jwk), nonce: payload.nonce };
}
at.ATPROTO_HTTP.resolveTxt = async (name) => {
  const v = world.txt.get(name);
  if (!v) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  return [[v]];
};
at.ATPROTO_HTTP.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  world.requested.push(url);
  const u = new URL(url);
  if (u.origin === 'https://plc.directory') {
    const did = decodeURIComponent(u.pathname.slice(1));
    const d = world.didDocs.get(did);
    if (!d) return json({ message: 'not found' }, 404);
    return json({ id: did, alsoKnownAs: d.handle ? [`at://${d.handle}`] : [], service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: d.pds }] });
  }
  if (u.pathname === '/.well-known/atproto-did') return new Response('not found', { status: 404 });
  if (u.pathname === '/.well-known/oauth-protected-resource') {
    const as = world.pdsAuthServer.get(u.origin);
    return as ? json({ resource: u.origin, authorization_servers: [as] }) : json({}, 404);
  }
  if (u.pathname === '/.well-known/oauth-authorization-server') {
    return json({
      issuer: u.origin,
      authorization_endpoint: `${u.origin}/oauth/authorize`,
      token_endpoint: `${u.origin}/oauth/token`,
      pushed_authorization_request_endpoint: `${u.origin}/oauth/par`,
      dpop_signing_alg_values_supported: ['ES256'],
      scopes_supported: ['atproto', 'transition:generic'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      require_pushed_authorization_requests: true,
    });
  }
  const headers = new Headers(init?.headers);
  const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
  if (u.pathname === '/oauth/par') {
    const d = checkDpop(headers.get('dpop'), 'POST', url);
    if (!d.ok) return json({ error: 'invalid_dpop_proof' }, 400);
    if (d.nonce !== world.nonce) return json({ error: 'use_dpop_nonce' }, 400, { 'DPoP-Nonce': world.nonce });
    world.par.push(form);
    const code = `authcode-${world.par.length}`;
    world.codes.set(code, { challenge: form.code_challenge, clientId: form.client_id, redirectUri: form.redirect_uri, jkt: d.jkt!, sub: world.tokenSub ?? DID });
    return json({ request_uri: `urn:ietf:params:oauth:request_uri:req-${world.par.length}`, expires_in: 60 }, 201, { 'DPoP-Nonce': world.nonce });
  }
  if (u.pathname === '/oauth/token') {
    const d = checkDpop(headers.get('dpop'), 'POST', url);
    const c = world.codes.get(form.code);
    if (!d.ok || d.nonce !== world.nonce) return json({ error: 'invalid_dpop_proof' }, 400);
    if (!c || c.jkt !== d.jkt || c.clientId !== form.client_id || c.redirectUri !== form.redirect_uri || createHash('sha256').update(form.code_verifier ?? '').digest('base64url') !== c.challenge)
      return json({ error: 'invalid_grant' }, 400);
    world.codes.delete(form.code);
    return json({ access_token: 'at', token_type: 'DPoP', refresh_token: 'rt', scope: 'atproto', sub: c.sub, expires_in: 300 });
  }
  throw new Error(`unexpected request ${url}`);
}) as typeof fetch;

async function blueskyStart(handle = HANDLE) {
  return call('../src/app/api/auth/bluesky/start/route', 'POST', `${ORIGIN}/api/auth/bluesky/start`, { handle });
}
async function blueskyFinish(start: { body: Record<string, any> }, edit: (p: Record<string, unknown>) => Record<string, unknown> = (p) => p) {
  const par = world.par[world.par.length - 1];
  const code = `authcode-${world.par.length}`;
  return call('../src/app/api/auth/bluesky/callback/route', 'POST', `${ORIGIN}/api/auth/bluesky/callback`, edit({ code, state: par.state, iss: AS, sealed: start.body.sealed }));
}

add({
  id: 'B1',
  name: 'Bluesky: the loopback client signs in as the DID, with the handle that resolves back to it',
  load: async () => {
    const s = await blueskyStart();
    const par = world.par[world.par.length - 1];
    const f = await blueskyFinish(s);
    return { start: s, par, finish: f, session: session.readSocialSession(f.body.token) };
  },
  run: ({ start, par, finish, session: s }) => {
    const p: Problems = [];
    const want = `http://localhost?redirect_uri=${encodeURIComponent('http://127.0.0.1:3000/sign-in/bluesky')}&scope=atproto`;
    if (start.status !== 200) p.push(`start answered ${start.status} ${JSON.stringify(start.body)}`);
    else {
      const u = new URL(start.body.url);
      if (u.origin + u.pathname !== `${AS}/oauth/authorize` || u.searchParams.get('client_id') !== want || !u.searchParams.get('request_uri')?.startsWith('urn:')) p.push(`the browser is sent to ${start.body.url}`);
      if (JSON.stringify(start.body).includes('"verifier"')) p.push('the PKCE verifier reached the page in the clear');
    }
    if (par?.client_id !== want || par?.redirect_uri !== 'http://127.0.0.1:3000/sign-in/bluesky' || par?.code_challenge_method !== 'S256' || par?.scope !== 'atproto') p.push(`the PAR was ${JSON.stringify(par)}`);
    if (finish.status !== 200 || s?.kind !== 'bluesky' || s.subject !== DID || s.handle !== HANDLE) p.push(`the callback gave ${finish.status} ${JSON.stringify(s ?? finish.body)}`);
    return p;
  },
  plant: (c) => {
    c.session = { ...c.session!, subject: DID2 };
  },
});

add({
  id: 'B2',
  name: 'Bluesky: a bad state, a bad issuer, a changed seal, another DID, the wrong server are refused',
  load: async () => {
    const out: Record<string, { status: number; why?: string; token?: string }> = {};
    const rec = (k: string, r: { status: number; body: Record<string, any> }) => (out[k] = { status: r.status, why: r.body.reason, token: r.body.token });
    rec('a changed state', await blueskyFinish(await blueskyStart(), (p) => ({ ...p, state: 'x' + String(p.state).slice(1) })));
    rec('another issuer', await blueskyFinish(await blueskyStart(), (p) => ({ ...p, iss: 'https://evil.example.com' })));
    rec('no issuer', await blueskyFinish(await blueskyStart(), (p) => ({ ...p, iss: undefined })));
    rec('a changed seal', await blueskyFinish(await blueskyStart(), (p) => ({ ...p, sealed: String(p.sealed).slice(0, -3) + 'AAA' })));
    rec('a seal from another tab', await (async () => {
      const first = await blueskyStart();
      const second = await blueskyStart();
      void second;
      return blueskyFinish(first);
    })());
    world.tokenSub = DID2;
    rec('a token for another DID', await blueskyFinish(await blueskyStart()));
    world.tokenSub = null;
    // DID2's PDS names another authorization server: typing DID2 but being sent to our AS is refused at the end.
    world.didDocs.set(DID, { pds: 'https://pds2.example.com', handle: HANDLE });
    const s = await (async () => {
      world.didDocs.set(DID, { pds: PDS, handle: HANDLE });
      const st = await blueskyStart();
      world.didDocs.set(DID, { pds: 'https://pds2.example.com', handle: HANDLE });
      return st;
    })();
    rec('the DID’s PDS names another server', await blueskyFinish(s));
    world.didDocs.set(DID, { pds: PDS, handle: HANDLE });
    return out;
  },
  run: (out) => {
    const p = Object.entries(out).filter(([, r]) => r.status < 400 || r.token).map(([k, r]) => `${k}: accepted (${r.status})`);
    if (out['a changed state']?.why !== 'bad-state') p.push(`a changed state: refused for ${out['a changed state']?.why}, not bad-state`);
    if (out['another issuer']?.why !== 'bad-issuer') p.push(`another issuer: refused for ${out['another issuer']?.why}, not bad-issuer`);
    return p;
  },
  plant: (out) => {
    out['another issuer'] = { status: 200, token: 's1.x.y' };
  },
});

add({
  id: 'B2b',
  name: 'Bluesky: a handle that doesn’t resolve back to the DID is not kept',
  load: async () => {
    // The DID document claims a handle whose DNS points elsewhere.
    world.didDocs.set(DID, { pds: PDS, handle: 'mallory.example.com' });
    world.txt.set('_atproto.mallory.example.com', `did=${DID2}`);
    const f = await blueskyFinish(await call('../src/app/api/auth/bluesky/start/route', 'POST', `${ORIGIN}/api/auth/bluesky/start`, { handle: DID }));
    world.didDocs.set(DID, { pds: PDS, handle: HANDLE });
    return { status: f.status, s: session.readSocialSession(f.body.token) };
  },
  run: ({ status, s }) => (status === 200 && s?.subject === DID && s.handle === null ? [] : [`gave ${status} with handle ${s?.handle}`]),
  plant: (c) => {
    c.s = { ...c.s!, handle: 'mallory.example.com' };
  },
});

add({
  id: 'B3',
  name: 'Bluesky: the site serves https client metadata; no request goes to an IP literal or localhost',
  load: async () => ({
    meta: await call('../src/app/oauth/bluesky/client-metadata.json/route', 'GET', 'https://snowmoon.party/oauth/bluesky/client-metadata.json'),
    httpMeta: (await call('../src/app/oauth/bluesky/client-metadata.json/route', 'GET', 'http://example.com/oauth/bluesky/client-metadata.json')).status,
    unsafe: ['https://127.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'http://pds.example.com', 'https://pds.local/x', 'https://10.0.0.1/x'].filter((u) => at.publicHttps(u) !== null),
    requested: world.requested.filter((u) => !at.publicHttps(u)),
  }),
  run: ({ meta, httpMeta, unsafe, requested }) => {
    const p: Problems = [];
    const m = meta.body;
    if (meta.status !== 200 || m.client_id !== 'https://snowmoon.party/oauth/bluesky/client-metadata.json' || m.redirect_uris?.[0] !== 'https://snowmoon.party/sign-in/bluesky' || m.token_endpoint_auth_method !== 'none' || m.dpop_bound_access_tokens !== true || m.scope !== 'atproto')
      p.push(`the metadata is ${meta.status} ${JSON.stringify(m)}`);
    if (httpMeta !== 404) p.push(`a plain-http origin got metadata (${httpMeta})`);
    if (unsafe.length) p.push(`allowed: ${unsafe.join(', ')}`);
    if (requested.length) p.push(`requested: ${requested.join(', ')}`);
    return p;
  },
  plant: (c) => {
    c.unsafe = ['https://127.0.0.1/x'];
  },
});

// ==================================================================================================================
// Free generations.
// ==================================================================================================================
const bearer = (t: string) => new Request(`${ORIGIN}/api/you`, { headers: { authorization: `Bearer ${t}` } });
add({
  id: 'F1',
  name: 'Free generations: a Bluesky-only account gets none anywhere, and has no balance',
  load: async () => {
    const r = await blueskyFinish(await blueskyStart());
    const person = (await getPerson(bearer(r.body.token)))!;
    const gate = await mayGenerate(S, person);
    const pic = await imageLimits.reserve(S, person);
    const rem = await remixLimits.reserve(S, person, { model: { id: 'm', host: 'h' }, reserveUsd: 0.01 });
    return {
      person,
      social: people.isSocialPerson(person),
      gate: gate.ok ? 'ok' : gate.reason,
      pictures: pic.ok ? 'ok' : pic.refusal,
      remix: rem.ok ? 'ok' : rem.refusal,
      left: await imageLimits.generationsLeft(S, person),
      remixLeft: await remixLimits.generationsLeft(S, person, 0.01),
      funded: imageLimits.fundedBy(person),
    };
  },
  run: (c) => {
    const p: Problems = [];
    if (!c.social) p.push(`a Bluesky-only sign-in is person ${c.person}, not a Lens/Bluesky person`);
    if (c.gate !== 'link-needed') p.push(`the gate said ${c.gate}`);
    if (c.pictures !== 'no-free') p.push(`Pictures said ${c.pictures}`);
    if (c.remix !== 'no-free') p.push(`Remix said ${c.remix}`);
    if (c.left !== 0 || c.remixLeft !== 0) p.push(`it has ${c.left} Pictures and ${c.remixLeft} Remix left`);
    return p;
  },
  plant: (c) => {
    c.pictures = 'ok';
  },
});

add({
  id: 'F2',
  name: 'Free generations: linked to Farcaster, the FID’s free count; unlinked, none; linked to Lens, what Lens gets',
  load: async () => {
    const b = await blueskyFinish(await blueskyStart());
    const bs = session.readSocialSession(b.body.token)!;
    const l = await lensSignIn(owner);
    const ls = session.readSocialSession(l.body.token)!;
    const out: Record<string, unknown> = {};
    // Linked to FID 6786 (invited, so the gate asks Neynar nothing), as the route would after checking both sign-ins.
    out.link = await accounts.linkSocial(S, { id: bs.account, kind: 'bluesky' }, { fid: 6786 });
    out.asFid = await getPerson(bearer(b.body.token));
    out.gate = (await mayGenerate(S, out.asFid as number)).ok;
    const r = await imageLimits.reserve(S, out.asFid as number);
    out.counted = r.ok;
    out.linkedTwice = await accounts.linkSocial(S, { id: bs.account, kind: 'bluesky' }, { fid: 1234 });
    out.unlink = await accounts.unlinkSocial(S, bs.account);
    out.after = await getPerson(bearer(b.body.token));
    out.afterFree = (await freeFor(S, out.after as number)).free;
    // Linked to the Lens account, through the route: the Bluesky sign-in in X-Social-Session, the Lens one as bearer.
    const route = await call('../src/app/api/social-link/route', 'POST', `${ORIGIN}/api/social-link`, { lens: true }, { 'x-social-session': b.body.token, authorization: `Bearer ${l.body.token}` });
    out.route = route.status;
    out.asLens = await getPerson(bearer(b.body.token));
    out.lensPerson = people.socialPerson(ls.account);
    lensCfg.minScore = null;
    out.lensNull = (await freeFor(S, out.asLens as number)).free;
    lensCfg.minScore = 5000;
    out.lensSet = (await freeFor(S, out.asLens as number)).free;
    lensCfg.minScore = null;
    // A Lens account can't be linked to another Lens account; nor through the route with only one sign-in.
    out.lensToLens = await accounts.linkSocial(S, { id: ls.account, kind: 'lens' }, { lensAccount: bs.account });
    out.routeAlone = (await call('../src/app/api/social-link/route', 'POST', `${ORIGIN}/api/social-link`, { lens: true }, { 'x-social-session': b.body.token })).status;
    await accounts.unlinkSocial(S, bs.account);
    return out;
  },
  run: (c) => {
    const p: Problems = [];
    if (c.asFid !== 6786 || c.gate !== true || c.counted !== true) p.push(`linked to FID 6786: person ${c.asFid}, gate ${c.gate}, counted ${c.counted}`);
    if ((c.linkedTwice as { ok: boolean }).ok) p.push('a second link to another FID was made without unlinking');
    if (c.unlink !== 'done' || !people.isSocialPerson(c.after as number) || c.afterFree !== false) p.push(`after unlinking: ${c.unlink}, person ${c.after}, free ${c.afterFree}`);
    if (c.route !== 200 || c.asLens !== c.lensPerson) p.push(`linked to Lens through the route: ${c.route}, person ${c.asLens} (want ${c.lensPerson})`);
    if (c.lensNull !== false || c.lensSet !== true) p.push(`linked to a Lens account scoring 9990: free ${c.lensNull} with no threshold (want false), ${c.lensSet} with 5000 (want true)`);
    if ((c.lensToLens as { ok: boolean }).ok) p.push('a Lens account was linked to another account as if it were Lens');
    if (c.routeAlone !== 401) p.push(`the route linked with one sign-in (${c.routeAlone})`);
    return p;
  },
  plant: (c) => {
    c.afterFree = true;
  },
});

add({
  id: 'F3',
  name: 'Lens: no free generations while the threshold is null; at or above it yes, below no, Lens down no',
  load: async () => {
    const l = await lensSignIn(owner);
    const person = (await getPerson(bearer(l.body.token)))!;
    const out: Record<string, string> = {};
    const d = async () => {
      lens.forgetLensKeys();
      const f = await freeFor(S, person);
      return f.free ? 'free' : f.reason;
    };
    lensCfg.minScore = null;
    out.null = await d();
    out.gateNull = await mayGenerate(S, person).then((g) => (g.ok ? 'ok' : g.reason));
    lensCfg.minScore = 9990;
    out.equal = await d();
    lensCfg.minScore = 9991;
    out.below = await d();
    lensCfg.minScore = 100;
    lensWorld.down = true;
    out.down = await d();
    lensWorld.down = false;
    out.reserve = await imageLimits.reserve(S, person).then((r) => (r.ok ? 'ok' : r.refusal));
    lensCfg.minScore = null;
    out.reserveNull = await imageLimits.reserve(S, person).then((r) => (r.ok ? 'ok' : r.refusal));
    return out;
  },
  run: (o) => {
    const want: Record<string, string> = { null: 'lens-not-open', gateNull: 'lens-not-open', equal: 'free', below: 'lens-score', down: 'lens-unreachable', reserve: 'ok', reserveNull: 'no-free' };
    return Object.entries(want).filter(([k, v]) => o[k] !== v).map(([k, v]) => `${k}: ${o[k]} (want ${v})`);
  },
  plant: (o) => {
    o.null = 'free';
  },
});

add({
  id: 'F4',
  name: 'Wallet accounts are unchanged: they pay from their balance, never the free count',
  load: async () => {
    const [w] = await sql`insert into studio.wallet_accounts (address) values (${'0x' + '7'.repeat(40)}) returning id::int as id`;
    const person = -w.id;
    return { wallet: people.isWalletPerson(person), social: people.isSocialPerson(person), funded: imageLimits.fundedBy(person), remixFunded: remixLimits.fundedBy(person), reserve: await imageLimits.reserve(S, person).then((r) => (r.ok ? 'ok' : r.refusal)) };
  },
  run: (c) => (c.wallet && !c.social && c.funded === 'prepaid' && c.remixFunded === 'prepaid' && c.reserve === 'balance' ? [] : [`a wallet account: ${JSON.stringify(c)}`]),
  plant: (c) => {
    c.funded = 'free';
  },
});

// ==================================================================================================================
// The migration and the switch.
// ==================================================================================================================
add({
  id: 'M1',
  name: 'Migration: dry run, migration and read-back in order; the drafts are the same; private; a real row fits',
  load: async () => {
    const file = readFileSync(path.join(ROOT, 'supabase/migrations/NEXT_signin_lens_bluesky.sql'), 'utf8');
    const dry = readFileSync(path.join(ROOT, 'supabase/drafts/NEXT_signin_lens_bluesky.DRY-RUN.sql'), 'utf8');
    const rb = readFileSync(path.join(ROOT, 'supabase/drafts/READ-BACK-signin_lens_bluesky.sql'), 'utf8');
    const block = (s: string, from: string, to: string) => s.slice(s.indexOf(from), s.indexOf(to, s.indexOf(from)));
    const a = block(file, '-- A. DRY RUN', '-- B. THE MIGRATION');
    const b = block(file, '-- B. THE MIGRATION', '-- C. READ-BACK');
    const body = (s: string) => s.slice(s.indexOf('begin;'), s.lastIndexOf(s.includes('commit;') ? 'commit;' : 'rollback;'));
    // Fresh database: every migration but this one, then the dry run alone must leave nothing.
    const fresh = new PGlite();
    await fresh.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
    for (const f of migrations.filter((f) => !f.startsWith('NEXT_signin'))) await fresh.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
    await fresh.exec(a);
    const afterDry = (await fresh.query<{ n: number }>(`select count(*)::int as n from pg_tables where schemaname = 'studio' and tablename like 'social_%'`)).rows[0].n;
    await fresh.exec(b);
    const afterMig = (await fresh.query<{ n: number }>(`select count(*)::int as n from pg_tables where schemaname = 'studio' and tablename like 'social_%'`)).rows[0].n;
    // The read-back's realistic rows: as studio_writer, then deleted; every check row says ok.
    const rbBlock = file.slice(file.indexOf('-- C. READ-BACK'));
    const results = await fresh.exec(rbBlock);
    const oks = results.flatMap((r) => r.rows as { what?: string; ok?: boolean }[]).filter((r) => 'ok' in r);
    const kept = (await fresh.query<{ n: number }>(`select count(*)::int as n from studio.social_accounts`)).rows[0].n;
    // Anon and authenticated read nothing.
    await fresh.exec(`insert into studio.social_accounts (kind, subject, handle) values ('lens', '0x${'1'.repeat(40)}', 'lens/x')`);
    const leaks: string[] = [];
    for (const role of ['anon', 'authenticated'])
      for (const t of ['social_accounts', 'social_links']) {
        await fresh.exec(`set role ${role}`);
        try {
          const r = await fresh.query<{ n: number }>(`select count(*)::int as n from studio.${t}`);
          if (r.rows[0].n > 0) leaks.push(`${role} reads ${t}`);
        } catch {
          /* permission denied: private */
        }
        await fresh.exec('reset role');
      }
    // The app can't change a link's target or delete an account.
    await fresh.exec('set role studio_writer');
    const refused: string[] = [];
    for (const q of [`delete from studio.social_accounts`, `update studio.social_accounts set subject = '0x${'2'.repeat(40)}'`, `update studio.social_links set fid = 1`]) {
      try {
        await fresh.exec(q);
      } catch {
        refused.push(q);
      }
    }
    await fresh.exec('reset role');
    await fresh.close();
    return { sameDry: body(a) === body(dry.slice(dry.indexOf('-- A. DRY RUN'))), sameMig: body(a) === body(b), rbSame: rb.includes(rbBlock.trim().slice(0, 400)), dryEndsRollback: /rollback;\s*$/.test(a.trim() + '\n'), afterDry, afterMig, oks, kept, leaks, refused: refused.length };
  },
  run: (c) => {
    const p: Problems = [];
    if (!c.sameDry || !c.sameMig || !c.rbSame) p.push(`the blocks differ (dry run as draft ${c.sameDry}, dry run = migration ${c.sameMig}, read-back as draft ${c.rbSame})`);
    if (!c.dryEndsRollback || c.afterDry !== 0) p.push(`the dry run kept ${c.afterDry} tables`);
    if (c.afterMig !== 2) p.push(`the migration made ${c.afterMig} tables, not 2`);
    if (c.oks.length < 4 || c.oks.some((r: { ok?: boolean }) => r.ok !== true)) p.push(`read-back: ${JSON.stringify(c.oks)}`);
    if (c.kept !== 0) p.push(`the read-back kept ${c.kept} rows`);
    if (c.leaks.length) p.push(c.leaks.join(', '));
    if (c.refused !== 3) p.push(`the app could change or delete ${3 - c.refused} things it shouldn't`);
    return p;
  },
  plant: (c) => {
    c.leaks = ['anon reads social_accounts'];
  },
});

add({
  id: 'S1',
  name: 'Off: with Lens and Bluesky off, every Lens and Bluesky route answers 404',
  load: async () => {
    const env = { ...process.env };
    delete env.NEXT_PUBLIC_SIGN_IN_ALL_FOUR;
    delete env.STUDIO_DATABASE_URL;
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--conditions=react-server', path.join(ROOT, 'scripts/test-signin-lens-bluesky.ts'), '--off'], { cwd: ROOT, env, encoding: 'utf8' });
    return JSON.parse(out.trim().split('\n').pop()!) as Record<string, number>;
  },
  run: (o) => {
    const want = ['lensAccounts', 'lensChallenge', 'lensVerify', 'blueskyStart', 'blueskyCallback', 'metadata', 'link'];
    return want.filter((k) => o[k] !== 404).map((k) => `${k} answered ${o[k]} while off`);
  },
  plant: (o) => {
    o.blueskyStart = 200;
  },
});

// ==================================================================================================================
let failed = 0;
for (const r of rules) {
  let c: unknown;
  try {
    c = await r.load();
  } catch (e) {
    console.log(`FAIL ${r.id} ${r.name}\n     load threw: ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`);
    failed++;
    continue;
  }
  const problems = r.run(c);
  const copy = structuredClone(c);
  r.plant(copy);
  const planted = r.run(copy);
  if (problems.length) {
    failed++;
    console.log(`FAIL ${r.id} ${r.name}`);
    for (const p of problems) console.log(`     ${p}`);
  } else if (!planted.length) {
    failed++;
    console.log(`FAIL ${r.id} ${r.name}\n     the planted violation was not caught`);
  } else console.log(`ok   ${r.id} ${r.name} (planted violation caught: ${planted[0].slice(0, 70)})`);
}
await sql.end({ timeout: 1 });
await server.stop();
await pg.close();
console.log(`\n${rules.length - failed} of ${rules.length} rules pass, each proven to fail on a planted violation.`);
process.exit(failed ? 1 : 0);
