import 'server-only';
import { createHash, createPublicKey, timingSafeEqual, constants as cryptoConstants, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import type postgres from 'postgres';
import { AGENTS } from '../config';
import { grantable, issueTokens, playFor, issuer, newToken, resourceUrl, sha256, sql, type Scope } from './core';

/**
 * OAuth 2.1 for "Add to Claude" and "Add to ChatGPT" (any MCP client): authorization code with PKCE
 * (S256 only), public clients (no secret), clients registered either by Dynamic Client Registration
 * (RFC 7591) or by a Client ID Metadata Document (an https client_id we fetch), refresh tokens replaced
 * on every use, and tokens bound to this site's connector address (RFC 8707). Research and sources:
 * docs/agents/research-connectors.md.
 */
type Sql = postgres.Sql;

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const SCOPE_TEXT: Record<Scope, string> = {
  read: 'read the book, published scenes and your own drafts',
  drafts: 'draft ideas, storyboards, frames and prompts, character versions, and revisions, for you to publish',
  images: 'bring in images it made elsewhere, with their declared recipe, for you to publish',
  notes: 'read feedback on your work and draft notes, for you to publish',
  // Shown only to the people agent play is open to (AGENTS.minpentaiPlay; the owner's approval of 2026-10-31).
  play: 'play Minpentai for you: start matches against the site computer, see only your side, and submit moves',
};

export function authServerMetadata() {
  const iss = issuer();
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/oauth/authorize`,
    token_endpoint: `${iss}/api/oauth/token`,
    registration_endpoint: `${iss}/api/oauth/register`,
    revocation_endpoint: `${iss}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    // none: public clients (Claude). private_key_jwt: a metadata-document client that signs its token requests
    // with a key it publishes (ChatGPT prefers this; owner, 2026-10-21). PKCE is required either way.
    // client_secret_basic and client_secret_post: a client that registers as confidential gets a secret (owner, 2026-10-21).
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post', 'private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: [...ASSERTION_ALGS],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [...grantable(), 'offline_access'],
    service_documentation: `${iss}/agents.md`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...grantable()],
    bearer_methods_supported: ['header'],
    resource_name: 'Snowmoon Party',
    resource_documentation: `${issuer()}/agents.md`,
  };
}

/** A redirect URI a client may register: https anywhere, or http only to this machine (loopback, any port). */
export function redirectOk(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash || u.username || u.password) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Loopback redirects match whatever their port (RFC 8252 §7.3); everything else exactly. */
function redirectMatches(asked: string, registered: string[]): boolean {
  if (registered.includes(asked)) return true;
  try {
    const a = new URL(asked);
    if (a.protocol !== 'http:') return false;
    return registered.some((r) => {
      const b = new URL(r);
      return b.protocol === 'http:' && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
    });
  } catch {
    return false;
  }
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80) : '');

const SECRET_METHODS = ['client_secret_basic', 'client_secret_post'] as const;
type SecretMethod = (typeof SECRET_METHODS)[number];

/**
 * Dynamic Client Registration (RFC 7591): a public client (no secret), or a confidential one
 * (client_secret_basic or client_secret_post), which gets a secret shown to it this once; only its sha256 is kept.
 */
export async function registerClient(body: Record<string, unknown>) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!uris.length || uris.length > 10 || !uris.every(redirectOk)) throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be https, or http to localhost');
  const auth = body.token_endpoint_auth_method ?? 'none';
  if (auth !== 'none' && !SECRET_METHODS.includes(auth as SecretMethod)) throw new OAuthError('invalid_client_metadata', 'token_endpoint_auth_method must be none, client_secret_basic or client_secret_post');
  const name = cleanName(body.client_name) || new URL(uris[0]).hostname;
  const clientId = newToken('dcr_');
  const secret = auth === 'none' ? null : newToken('scs_');
  await sql()`insert into studio.oauth_clients (client_id, how, name, redirect_uris, auth_method, secret_hash) values (${clientId}, 'dcr', ${name}, ${uris}, ${auth as string}, ${secret ? sha256(secret) : null})`;
  return {
    client_id: clientId, client_name: name, redirect_uris: uris, token_endpoint_auth_method: auth, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

/** An https client_id that isn't a private or local address, for fetching its metadata document. */
function cimdUrlOk(id: string): boolean {
  try {
    const u = new URL(id);
    if (u.protocol !== 'https:' || u.port || u.username || u.hash) return false;
    const h = u.hostname;
    return !/^(localhost|.*\.local|.*\.internal)$/i.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && !h.includes(':') && h.includes('.');
  } catch {
    return false;
  }
}

/**
 * Off Vercel only, for the tests: https://cimd.test/… is served by the test's stand-in (AGENTS_TEST_CIMD_URL),
 * so metadata documents and key sets can be tried without the internet.
 */
const viaTest = (url: string) => {
  const base = process.env.VERCEL ? null : process.env.AGENTS_TEST_CIMD_URL;
  return base && url.startsWith('https://cimd.test/') ? base + url.slice('https://cimd.test'.length) : url;
};

/** A small JSON document from a client's own https address (its metadata document, or its keys). */
async function fetchJson(url: string, what: string, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  if (!cimdUrlOk(url)) throw new OAuthError('invalid_client', `the ${what} address isn’t usable`);
  const res = await fetcher(viaTest(url), { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } }).catch(() => null);
  const text = res?.ok ? await res.text().catch(() => '') : '';
  if (!text || text.length > 20_000) throw new OAuthError('invalid_client', `the ${what} could not be read`);
  try {
    const doc = JSON.parse(text);
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) return doc as Record<string, unknown>;
  } catch {}
  throw new OAuthError('invalid_client', `the ${what} is not JSON`);
}

/** How a metadata-document client authenticates at the token endpoint: none (public) or private_key_jwt (signed with its published keys). */
type CimdAuth = { method: 'none' } | { method: 'private_key_jwt'; jwksUri: string | null; jwks: JsonWebKey[] | null };

async function metadataDocument(clientId: string, fetcher?: typeof fetch) {
  const doc = await fetchJson(clientId, 'client metadata document', fetcher);
  if (doc.client_id !== clientId) throw new OAuthError('invalid_client', 'the document’s client_id must be its own address');
  const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!uris.length || !uris.every(redirectOk)) throw new OAuthError('invalid_client', 'the document has no usable redirect_uris');
  const method = doc.token_endpoint_auth_method ?? 'none';
  let auth: CimdAuth;
  if (method === 'none') auth = { method: 'none' };
  else if (method === 'private_key_jwt') {
    // Its keys: inline (jwks) or at an https address (jwks_uri), never both.
    const inline = doc.jwks && typeof doc.jwks === 'object' && Array.isArray((doc.jwks as { keys?: unknown }).keys) ? ((doc.jwks as { keys: JsonWebKey[] }).keys) : null;
    const jwksUri = typeof doc.jwks_uri === 'string' ? doc.jwks_uri : null;
    if (!inline === !jwksUri) throw new OAuthError('invalid_client', 'a private_key_jwt client must publish its keys (jwks or jwks_uri, one of them)');
    if (jwksUri && !cimdUrlOk(jwksUri)) throw new OAuthError('invalid_client', 'the jwks_uri must be a public https address');
    auth = { method: 'private_key_jwt', jwksUri, jwks: inline };
  } else throw new OAuthError('invalid_client', 'token_endpoint_auth_method must be none or private_key_jwt');
  return { doc, uris, auth };
}

/** The client: a registered one, or one whose client_id is the address of its metadata document (CIMD), fetched and kept. */
export async function findClient(clientId: string, fetcher: typeof fetch = fetch): Promise<{ client_id: string; name: string; redirect_uris: string[] }> {
  const s = sql();
  const [known] = await s<{ client_id: string; name: string; redirect_uris: string[]; how: string; created_at: Date }[]>`
    select client_id, name, redirect_uris, how, created_at from studio.oauth_clients where client_id = ${clientId}`;
  // A metadata document is fetched again after a day, in case the client changed its redirects.
  if (known && (known.how === 'dcr' || Date.now() - new Date(known.created_at).getTime() < 86_400_000)) return known;
  if (!cimdUrlOk(clientId)) throw new OAuthError('invalid_client', 'unknown client');
  const { doc, uris } = await metadataDocument(clientId, fetcher);
  const name = cleanName(doc.client_name) || new URL(clientId).hostname;
  await s`insert into studio.oauth_clients (client_id, how, name, redirect_uris) values (${clientId}, 'cimd', ${name}, ${uris})
    on conflict (client_id) do update set name = excluded.name, redirect_uris = excluded.redirect_uris, created_at = now()`;
  return { client_id: clientId, name, redirect_uris: uris };
}

export interface AuthorizeAsk {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: Scope[];
  resource: string;
}

/** Checks an authorization request. Errors before the redirect is trusted are shown on our page, never redirected. */
export async function checkAuthorize(q: URLSearchParams, fetcher?: typeof fetch): Promise<AuthorizeAsk> {
  const clientId = q.get('client_id') ?? '';
  const client = await findClient(clientId, fetcher);
  const redirectUri = q.get('redirect_uri') ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '');
  if (!redirectMatches(redirectUri, client.redirect_uris)) throw new OAuthError('invalid_request', 'this redirect address isn’t registered for the client');
  if (q.get('response_type') !== 'code') throw new OAuthError('unsupported_response_type', 'only response_type=code');
  const challenge = q.get('code_challenge') ?? '';
  if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new OAuthError('invalid_request', 'PKCE with S256 is required');
  const resource = q.get('resource') ?? resourceUrl();
  if (resource !== resourceUrl()) throw new OAuthError('invalid_target', `the resource must be ${resourceUrl()}`);
  const asked = (q.get('scope') ?? '').split(/\s+/).filter(Boolean);
  const known = asked.filter((s): s is Scope => (grantable() as string[]).includes(s));
  const scopes = known.length ? known : [...AGENTS.scopes];
  if (!scopes.includes('read')) scopes.unshift('read');
  return { clientId, clientName: client.name, redirectUri, state: q.get('state'), codeChallenge: challenge, scopes, resource };
}

/**
 * The person agreed: their agent is made (or their earlier agent from this same client renewed, so
 * reconnecting doesn't use up one of their three), and a one-time code goes back to the client.
 */
export async function approve(ask: AuthorizeAsk, person: number): Promise<string> {
  // "play" only for the people agent play is open to (AGENTS.minpentaiPlay); for anyone else it is left out. For them it
  // is added even when the app didn't ask for it (Claude asks for the scopes /mcp names, which predate it); the Allow
  // screen lists it for them (authorize/consent.tsx), and the token's scope says what was granted.
  if (!playFor(person)) ask = { ...ask, scopes: ask.scopes.filter((x) => x !== 'play') };
  else if (!ask.scopes.includes('play')) ask = { ...ask, scopes: [...ask.scopes, 'play'] };
  const s = sql();
  const code = newToken('sc1_');
  await s.begin(async (tx) => {
    const t = tx as unknown as Sql;
    // The same client again (Claude registers a new client on every fresh connection, so also the same
    // name with the same redirect address): its agent is renewed rather than a new one made.
    const [old] = await t<{ id: string }[]>`select a.id from studio.agents a left join studio.oauth_clients c on c.client_id = a.client_id
      where a.person = ${person} and a.route = 'oauth' and a.revoked_at is null and a.expires_at > now()
        and (a.client_id = ${ask.clientId} or (c.name = ${ask.clientName} and ${ask.redirectUri} = any(c.redirect_uris)))
      order by a.created_at limit 1`;
    let agentId = old?.id;
    if (agentId) {
      await t`update studio.agents set scopes = ${ask.scopes}, expires_at = now() + make_interval(days => ${AGENTS.linkDays}), name = ${ask.clientName}, client_id = ${ask.clientId} where id = ${agentId}`;
    } else {
      const [live] = await t<{ n: number }[]>`select count(*)::int as n from studio.agents where person = ${person} and revoked_at is null and expires_at > now()`;
      if (live.n >= AGENTS.perPerson) throw new OAuthError('access_denied', `you already have ${AGENTS.perPerson} agents; disconnect one on your Dashboard first`, 409);
      [{ id: agentId }] = await t<{ id: string }[]>`insert into studio.agents (person, route, name, client_id, scopes, expires_at)
        values (${person}, 'oauth', ${ask.clientName}, ${ask.clientId}, ${ask.scopes}, now() + make_interval(days => ${AGENTS.linkDays})) returning id`;
    }
    await t`insert into studio.oauth_codes (code_hash, client_id, agent_id, redirect_uri, code_challenge, resource, expires_at)
      values (${sha256(code)}, ${ask.clientId}, ${agentId}, ${ask.redirectUri}, ${ask.codeChallenge}, ${ask.resource}, now() + interval '5 minutes')`;
    await t`update studio.oauth_clients set last_used_at = now() where client_id = ${ask.clientId}`;
  });
  const u = new URL(ask.redirectUri);
  u.searchParams.set('code', code);
  if (ask.state !== null) u.searchParams.set('state', ask.state);
  u.searchParams.set('iss', issuer());
  return u.toString();
}

export function deniedRedirect(ask: AuthorizeAsk): string {
  const u = new URL(ask.redirectUri);
  u.searchParams.set('error', 'access_denied');
  if (ask.state !== null) u.searchParams.set('state', ask.state);
  u.searchParams.set('iss', issuer());
  return u.toString();
}

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const ASSERTION_ALGS = ['RS256', 'PS256', 'ES256', 'EdDSA'] as const;
const b64json = (part: string) => {
  try {
    const v = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Checks a client assertion (RFC 7523 §3) against the client's published keys: signature, iss = sub = client, our token endpoint as audience, and a short life. */
function assertionOk(jwt: string, clientId: string, keys: JsonWebKey[]): boolean {
  const parts = jwt.split('.');
  if (parts.length !== 3 || jwt.length > 8000) return false;
  const header = b64json(parts[0]);
  const claims = b64json(parts[1]);
  const alg = header?.alg as (typeof ASSERTION_ALGS)[number] | undefined;
  if (!header || !claims || !alg || !ASSERTION_ALGS.includes(alg)) return false;
  const now = Date.now() / 1000;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const endpoint = `${issuer()}/api/oauth/token`;
  if (claims.iss !== clientId || claims.sub !== clientId || !aud.some((a) => a === endpoint || a === issuer())) return false;
  if (typeof claims.exp !== 'number' || claims.exp < now - 30 || claims.exp > now + 600) return false;
  if (typeof claims.iat === 'number' && claims.iat > now + 60) return false;
  if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return false;
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], 'base64url');
  const kty = { RS256: 'RSA', PS256: 'RSA', ES256: 'EC', EdDSA: 'OKP' }[alg];
  const candidates = keys.filter((k) => k.kty === kty && (!header.kid || (k as { kid?: string }).kid === header.kid) && !(k as { d?: string }).d);
  return candidates.some((jwk) => {
    try {
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      if (alg === 'RS256') return cryptoVerify('sha256', data, key, sig);
      if (alg === 'PS256') return cryptoVerify('sha256', data, { key, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, sig);
      if (alg === 'ES256') return cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
      return cryptoVerify(null, data, key, sig);
    } catch {
      return false;
    }
  });
}

/**
 * Who is asking at the token endpoint. A public client names itself (client_id). A metadata-document client
 * whose document says private_key_jwt must prove it with a fresh assertion signed by a key it publishes;
 * its document and keys are read again for every token request, so a key it withdraws stops working at once.
 */
/** HTTP Basic client credentials (RFC 6749 §2.3.1): form-urlencoded id and secret. */
function basicCredentials(header: string | null): { id: string; secret: string } | null {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header ?? '');
  if (!m) return null;
  const raw = Buffer.from(m[1], 'base64').toString('utf8');
  const at = raw.indexOf(':');
  if (at < 0) return null;
  try {
    return { id: decodeURIComponent(raw.slice(0, at).replace(/\+/g, ' ')), secret: decodeURIComponent(raw.slice(at + 1).replace(/\+/g, ' ')) };
  } catch {
    return null;
  }
}

/** Constant-time comparison of a presented secret with the stored sha256. */
const secretMatches = (secret: string, storedHash: string) => timingSafeEqual(Buffer.from(sha256(secret), 'hex'), Buffer.from(storedHash, 'hex'));

async function tokenClient(form: URLSearchParams, authorization: string | null = null): Promise<string> {
  const assertion = form.get('client_assertion');
  const assertionType = form.get('client_assertion_type');
  const basic = basicCredentials(authorization);
  const postSecret = form.get('client_secret');
  let clientId = form.get('client_id') ?? basic?.id ?? '';
  if (basic && form.get('client_id') && form.get('client_id') !== basic.id) throw new OAuthError('invalid_client', 'client_id and the Basic credentials name different clients', 401);
  if (basic && postSecret !== null) throw new OAuthError('invalid_request', 'send the client secret one way, not both');
  if (!clientId && assertion) clientId = String(b64json(assertion.split('.')[1] ?? '')?.sub ?? '');
  if (clientId.startsWith('dcr_')) {
    if (assertion || assertionType) throw new OAuthError('invalid_client', 'a registered client authenticates with its secret, or not at all', 401);
    const [c] = await sql()<{ auth_method: string; secret_hash: string | null }[]>`select auth_method, secret_hash from studio.oauth_clients where client_id = ${clientId}`;
    if (!c) throw new OAuthError('invalid_client', 'unknown client', 401);
    const secret = basic?.secret ?? postSecret;
    if (c.auth_method === 'none') {
      if (secret) throw new OAuthError('invalid_client', 'this client is public: no client secret', 401);
      return clientId;
    }
    // A confidential client: its secret, by Basic or in the form (either is accepted), compared in constant time.
    if (!secret || !c.secret_hash || !secretMatches(secret, c.secret_hash)) throw new OAuthError('invalid_client', 'the client secret is missing or wrong', 401);
    return clientId;
  }
  if (!cimdUrlOk(clientId)) {
    if (assertion || assertionType || basic || postSecret) throw new OAuthError('invalid_client', 'unknown client', 401);
    return clientId;
  }
  if (basic || postSecret) throw new OAuthError('invalid_client', 'a metadata-document client has no client secret', 401);
  const { auth } = await metadataDocument(clientId);
  if (auth.method === 'none') {
    if (assertion || assertionType) throw new OAuthError('invalid_client', 'this client is public: no client assertion', 401);
    return clientId;
  }
  if (assertionType !== ASSERTION_TYPE || !assertion) throw new OAuthError('invalid_client', 'this client must authenticate with private_key_jwt', 401);
  const keys = auth.jwks ?? ((await fetchJson(auth.jwksUri!, 'client key set')).keys as JsonWebKey[] | undefined) ?? [];
  if (!Array.isArray(keys) || !assertionOk(assertion, clientId, keys)) throw new OAuthError('invalid_client', 'the client assertion is not valid', 401);
  return clientId;
}

/** The token endpoint: a code (with its PKCE verifier) or a refresh token, for a new access token. */
export async function token(form: URLSearchParams, authorization: string | null = null) {
  const s = sql();
  const grant = form.get('grant_type');
  const clientId = await tokenClient(form, authorization);
  const resource = form.get('resource') ?? resourceUrl();
  if (resource !== resourceUrl()) throw new OAuthError('invalid_target', `the resource must be ${resourceUrl()}`);
  if (grant === 'authorization_code') {
    const code = form.get('code') ?? '';
    const verifier = form.get('code_verifier') ?? '';
    let withdraw: string | null = null;
    const out = await s.begin(async (tx) => {
      const t = tx as unknown as Sql;
      const [c] = await t<{ client_id: string; agent_id: string; redirect_uri: string; code_challenge: string; resource: string; used: boolean; live: boolean }[]>`
        select client_id, agent_id, redirect_uri, code_challenge, resource, used_at is not null as used, expires_at > now() as live
        from studio.oauth_codes where code_hash = ${sha256(code)} for update`;
      if (!c || !c.live || c.client_id !== clientId) throw new OAuthError('invalid_grant', 'the code is unknown, expired or for another client');
      if (c.used) {
        // A code used twice: the agent's tokens are withdrawn (RFC 6749 §4.1.2), outside this transaction.
        withdraw = c.agent_id;
        return null;
      }
      const redirect = form.get('redirect_uri');
      if (redirect !== null && redirect !== c.redirect_uri) throw new OAuthError('invalid_grant', 'redirect_uri doesn’t match');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || s256(verifier) !== c.code_challenge) throw new OAuthError('invalid_grant', 'the PKCE verifier doesn’t match');
      if (c.resource !== resource) throw new OAuthError('invalid_target', 'the resource doesn’t match the authorization');
      await t`update studio.oauth_codes set used_at = now() where code_hash = ${sha256(code)}`;
      const [a] = await t<{ scopes: string[] }[]>`select scopes from studio.agents where id = ${c.agent_id} and revoked_at is null`;
      if (!a) throw new OAuthError('invalid_grant', 'the agent was disconnected');
      return { ...(await issueTokens(t, c.agent_id, resource, true)), scope: a.scopes.join(' ') };
    });
    if (withdraw) {
      await s`update studio.agent_tokens set revoked_at = now() where agent_id = ${withdraw} and revoked_at is null`;
      throw new OAuthError('invalid_grant', 'the code was already used');
    }
    return out!;
  }
  if (grant === 'refresh_token') {
    const refresh = form.get('refresh_token') ?? '';
    let withdraw: string | null = null;
    const out = await s.begin(async (tx) => {
      const t = tx as unknown as Sql;
      const [r] = await t<{ agent_id: string; used: boolean; live: boolean; client_id: string; scopes: string[] }[]>`
        select t.agent_id, t.used_at is not null as used, (t.expires_at > now() and t.revoked_at is null and a.revoked_at is null and a.expires_at > now()) as live, a.client_id, a.scopes
        from studio.agent_tokens t join studio.agents a on a.id = t.agent_id
        where t.token_hash = ${sha256(refresh)} and t.kind = 'refresh' and t.resource = ${resource} for update of t`;
      if (!r || !r.live || r.client_id !== clientId) throw new OAuthError('invalid_grant', 'the refresh token is unknown, expired or withdrawn');
      if (r.used) {
        // A refresh token used twice was probably stolen: everything of this agent's is withdrawn (below).
        withdraw = r.agent_id;
        return null;
      }
      await t`update studio.agent_tokens set used_at = now() where token_hash = ${sha256(refresh)}`;
      return { ...(await issueTokens(t, r.agent_id, resource, true)), scope: r.scopes.join(' ') };
    });
    if (withdraw) {
      await s`update studio.agent_tokens set revoked_at = now() where agent_id = ${withdraw} and revoked_at is null`;
      throw new OAuthError('invalid_grant', 'the refresh token was already used');
    }
    return out!;
  }
  throw new OAuthError('unsupported_grant_type', 'authorization_code or refresh_token');
}

/** Token revocation (RFC 7009): always answers 200. */
export async function revokeToken(tokenValue: string) {
  await sql()`update studio.agent_tokens set revoked_at = now() where token_hash = ${sha256(tokenValue)} and revoked_at is null`;
}
