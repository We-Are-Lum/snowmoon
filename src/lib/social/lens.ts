import 'server-only';
import { createPublicKey, verify as verifySig, type JsonWebKey } from 'node:crypto';
import { SOCIAL_SIGN_IN } from '../config';

/**
 * Lens sign-in and the Lens score, against Lens's public API (branch signin-lens-bluesky).
 *
 * Sign-in is Lens's own authentication (lens.xyz/docs/protocol/authentication):
 * 1. challenge: our server asks for a challenge for { app, account, owner } (or { app, account, manager }). The
 *    challenge is a Sign-In with Ethereum message for our domain (taken from the Origin we send), Lens Chain (232),
 *    with Lens's nonce.
 * 2. The wallet that owns or manages the account signs it, in the browser.
 * 3. authenticate: our server sends the challenge's id and the signature. Lens answers AuthenticationTokens (or
 *    WrongSignerError, ExpiredChallengeError, ForbiddenError). We check the ID token's signature (RS256, against
 *    Lens's JWKS), its issuer, its audience (our App), its expiry and its role, and read the account from it:
 *    `act.sub` when a manager signed, else `sub`. The account must be the one the challenge was for.
 * Lens's access and refresh tokens are dropped at once; nothing of Lens's is kept.
 *
 * The score (Lens's "Account Score", lens.xyz/docs/protocol/accounts/fetch: "a probability-based measure that
 * evaluates an account's signal strength … calculated using a set of ML algorithms that consider factors like
 * follower graphs, content, and other variables") is read from `account { score }`, with only the account address.
 *
 * `LENS_HTTP.fetch` is replaced only by the tests.
 */
export const LENS_HTTP: { fetch: typeof fetch } = { fetch: (...a) => fetch(...a) };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (a: unknown): a is `0x${string}` => typeof a === 'string' && ADDRESS.test(a);

async function gql<T>(query: string, variables: Record<string, unknown>, origin?: string): Promise<T> {
  const res = await LENS_HTTP.fetch(SOCIAL_SIGN_IN.lens.api, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SOCIAL_SIGN_IN.lens.timeoutMs),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`lens http ${res.status}`);
  const out = (await res.json()) as { data?: T; errors?: { message?: string }[] };
  if (out.errors?.length || !out.data) throw new Error(`lens: ${String(out.errors?.[0]?.message ?? 'no data').slice(0, 80)}`);
  return out.data;
}

export interface LensAccountChoice {
  address: `0x${string}`;
  /** "lens/<name>", or null. */
  username: string | null;
  role: 'owner' | 'manager';
}

/** The Lens accounts this wallet owns or manages (Lens's accountsAvailable), at most ten. */
export async function lensAccountsFor(wallet: string): Promise<LensAccountChoice[]> {
  if (!isAddress(wallet)) return [];
  const d = await gql<{ accountsAvailable: { items: { __typename: string; account: { address: string; username: { value: string } | null } }[] } }>(
    `query($w: EvmAddress!) { accountsAvailable(request: { managedBy: $w, includeOwned: true, hiddenFilter: NONE_HIDDEN, pageSize: TEN }) {
      items { __typename ... on AccountOwned { account { address username { value } } } ... on AccountManaged { account { address username { value } } } } } }`,
    { w: wallet },
  );
  return d.accountsAvailable.items
    .filter((i) => isAddress(i.account?.address))
    .map((i) => ({ address: i.account.address as `0x${string}`, username: i.account.username?.value ?? null, role: i.__typename === 'AccountOwned' ? 'owner' : 'manager' }));
}

/** A challenge for this account and the wallet that owns (or manages) it. Lens says which from its own records. */
export async function lensChallenge(account: string, signer: string, origin: string): Promise<{ id: string; text: string }> {
  if (!isAddress(account) || !isAddress(signer)) throw new Error('bad address');
  const a = await gql<{ account: { owner: string } | null }>('query($a: EvmAddress!) { account(request: { address: $a }) { owner } }', { a: account });
  if (!a.account) throw new LensRefused('no-account');
  const role = a.account.owner.toLowerCase() === signer.toLowerCase() ? 'accountOwner' : 'accountManager';
  const who = role === 'accountOwner' ? { owner: signer } : { manager: signer };
  const d = await gql<{ challenge: { id: string; text: string } }>(
    'mutation($r: ChallengeRequest!) { challenge(request: $r) { id text } }',
    { r: { [role]: { app: SOCIAL_SIGN_IN.lens.app, account, ...who } } },
    origin,
  );
  if (!/^[0-9a-f-]{36}$/i.test(d.challenge?.id ?? '') || typeof d.challenge.text !== 'string') throw new Error('lens: bad challenge');
  return d.challenge;
}

export class LensRefused extends Error {
  constructor(public why: 'no-account' | 'wrong-signer' | 'expired' | 'forbidden' | 'bad-token' | 'other-account') {
    super(why);
  }
}

/** Send the signed challenge; the Lens account it proves (lowercase), or LensRefused. */
export async function lensAuthenticate(challengeId: string, signature: string, expectedAccount: string): Promise<`0x${string}`> {
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^0x[0-9a-fA-F]{130,}$/.test(signature) || signature.length > 4000) throw new LensRefused('wrong-signer');
  const d = await gql<{ authenticate: { __typename: string; idToken?: string; reason?: string } }>(
    `mutation($r: SignedAuthChallenge!) { authenticate(request: $r) { __typename
      ... on AuthenticationTokens { idToken } ... on WrongSignerError { reason } ... on ExpiredChallengeError { reason } ... on ForbiddenError { reason } } }`,
    { r: { id: challengeId, signature } },
  );
  const a = d.authenticate;
  if (a.__typename === 'WrongSignerError') throw new LensRefused('wrong-signer');
  if (a.__typename === 'ExpiredChallengeError') throw new LensRefused('expired');
  if (a.__typename !== 'AuthenticationTokens' || !a.idToken) throw new LensRefused('forbidden');
  const claims = await verifyLensIdToken(a.idToken);
  const account = (claims.act?.sub ?? claims.sub).toLowerCase();
  if (account !== expectedAccount.toLowerCase()) throw new LensRefused('other-account');
  return account as `0x${string}`;
}

interface LensClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  act?: { sub: string };
  'tag:lens.dev,2024:role'?: string;
}

let jwks: { keys: (JsonWebKey & { kid?: string })[]; at: number } | null = null;
async function lensKeys(fresh = false) {
  if (!fresh && jwks && Date.now() - jwks.at < 3600_000) return jwks.keys;
  const res = await LENS_HTTP.fetch(SOCIAL_SIGN_IN.lens.jwks, { signal: AbortSignal.timeout(SOCIAL_SIGN_IN.lens.timeoutMs), redirect: 'error' });
  if (!res.ok) throw new Error(`lens jwks ${res.status}`);
  const keys = ((await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] }).keys ?? [];
  jwks = { keys, at: Date.now() };
  return keys;
}
/** Only the tests: forget the cached keys. */
export const forgetLensKeys = () => {
  jwks = null;
  scores.clear();
};

/** The ID token's claims, if Lens signed it (RS256) for our App, unexpired, as an account owner or manager. */
export async function verifyLensIdToken(token: string): Promise<LensClaims> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new LensRefused('bad-token');
  let header: { alg?: string; kid?: string };
  let claims: LensClaims;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString());
    claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    throw new LensRefused('bad-token');
  }
  if (header.alg !== 'RS256') throw new LensRefused('bad-token');
  const pick = (keys: (JsonWebKey & { kid?: string })[]) => keys.find((k) => k.kty === 'RSA' && (!header.kid || k.kid === header.kid));
  const jwk = pick(await lensKeys()) ?? pick(await lensKeys(true));
  if (!jwk) throw new LensRefused('bad-token');
  const ok = verifySig('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new LensRefused('bad-token');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const role = claims['tag:lens.dev,2024:role'];
  if (
    claims.iss !== SOCIAL_SIGN_IN.lens.issuer ||
    !aud.some((a) => typeof a === 'string' && a.toLowerCase() === SOCIAL_SIGN_IN.lens.app.toLowerCase()) ||
    !(claims.exp * 1000 > Date.now()) ||
    (role !== 'ACCOUNT_OWNER' && role !== 'ACCOUNT_MANAGER') ||
    !isAddress(claims.sub) ||
    (claims.act !== undefined && !isAddress(claims.act?.sub))
  )
    throw new LensRefused('bad-token');
  return claims;
}

/** The account's username ("lens/<name>"), or null. Never throws. */
export async function lensUsername(account: string): Promise<string | null> {
  try {
    const d = await gql<{ account: { username: { value: string } | null } | null }>('query($a: EvmAddress!) { account(request: { address: $a }) { username { value } } }', { a: account });
    const v = d.account?.username?.value ?? null;
    return v && /^[a-z0-9/_.-]{1,100}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
}

const scores = new Map<string, { score: number; at: number }>();
/** The Lens score of an account, kept in memory for scoreCacheMinutes; null when Lens can't be reached. */
export async function lensScore(account: string): Promise<number | null> {
  const a = account.toLowerCase();
  const hit = scores.get(a);
  if (hit && Date.now() - hit.at < SOCIAL_SIGN_IN.lens.scoreCacheMinutes * 60_000) return hit.score;
  try {
    const d = await gql<{ account: { score: number } | null }>('query($a: EvmAddress!) { account(request: { address: $a }) { score } }', { a });
    const score = d.account?.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;
    scores.set(a, { score, at: Date.now() });
    return score;
  } catch {
    return null;
  }
}
