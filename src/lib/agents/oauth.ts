import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { AGENTS } from '../config';
import { issueTokens, issuer, newToken, resourceUrl, sha256, sql, type Scope } from './core';

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
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [...AGENTS.scopes, 'offline_access'],
    service_documentation: `${iss}/agents.md`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...AGENTS.scopes],
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

/** Dynamic Client Registration (RFC 7591): a public client, its name and redirect URIs. */
export async function registerClient(body: Record<string, unknown>) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!uris.length || uris.length > 10 || !uris.every(redirectOk)) throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be https, or http to localhost');
  const auth = body.token_endpoint_auth_method ?? 'none';
  if (auth !== 'none') throw new OAuthError('invalid_client_metadata', 'only public clients (token_endpoint_auth_method "none")');
  const name = cleanName(body.client_name) || new URL(uris[0]).hostname;
  const clientId = newToken('dcr_');
  await sql()`insert into studio.oauth_clients (client_id, how, name, redirect_uris) values (${clientId}, 'dcr', ${name}, ${uris})`;
  return { client_id: clientId, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
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

/** The client: a registered one, or one whose client_id is the address of its metadata document (CIMD), fetched and kept. */
export async function findClient(clientId: string, fetcher: typeof fetch = fetch): Promise<{ client_id: string; name: string; redirect_uris: string[] }> {
  const s = sql();
  const [known] = await s<{ client_id: string; name: string; redirect_uris: string[]; how: string; created_at: Date }[]>`
    select client_id, name, redirect_uris, how, created_at from studio.oauth_clients where client_id = ${clientId}`;
  // A metadata document is fetched again after a day, in case the client changed its redirects.
  if (known && (known.how === 'dcr' || Date.now() - new Date(known.created_at).getTime() < 86_400_000)) return known;
  if (!cimdUrlOk(clientId)) throw new OAuthError('invalid_client', 'unknown client');
  const res = await fetcher(clientId, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } }).catch(() => null);
  const text = res?.ok ? await res.text().catch(() => '') : '';
  if (!text || text.length > 10_000) throw new OAuthError('invalid_client', 'the client metadata document could not be read');
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new OAuthError('invalid_client', 'the client metadata document is not JSON');
  }
  if (doc.client_id !== clientId) throw new OAuthError('invalid_client', 'the document’s client_id must be its own address');
  const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!uris.length || !uris.every(redirectOk)) throw new OAuthError('invalid_client', 'the document has no usable redirect_uris');
  if ((doc.token_endpoint_auth_method ?? 'none') !== 'none') throw new OAuthError('invalid_client', 'only public clients');
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
  const known = asked.filter((s): s is Scope => (AGENTS.scopes as readonly string[]).includes(s));
  const scopes = known.length ? known : [...AGENTS.scopes];
  if (!scopes.includes('read')) scopes.unshift('read');
  return { clientId, clientName: client.name, redirectUri, state: q.get('state'), codeChallenge: challenge, scopes, resource };
}

/**
 * The person agreed: their agent is made (or their earlier agent from this same client renewed, so
 * reconnecting doesn't use up one of their three), and a one-time code goes back to the client.
 */
export async function approve(ask: AuthorizeAsk, person: number): Promise<string> {
  const s = sql();
  const code = newToken('sc1_');
  await s.begin(async (tx) => {
    const t = tx as unknown as Sql;
    const [old] = await t<{ id: string }[]>`select id from studio.agents
      where person = ${person} and route = 'oauth' and client_id = ${ask.clientId} and revoked_at is null and expires_at > now() limit 1`;
    let agentId = old?.id;
    if (agentId) {
      await t`update studio.agents set scopes = ${ask.scopes}, expires_at = now() + make_interval(days => ${AGENTS.linkDays}), name = ${ask.clientName} where id = ${agentId}`;
    } else {
      const [live] = await t<{ n: number }[]>`select count(*)::int as n from studio.agents where person = ${person} and revoked_at is null and expires_at > now()`;
      if (live.n >= AGENTS.perPerson) throw new OAuthError('access_denied', `you already have ${AGENTS.perPerson} agents; disconnect one on your You page first`, 409);
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

/** The token endpoint: a code (with its PKCE verifier) or a refresh token, for a new access token. */
export async function token(form: URLSearchParams) {
  const s = sql();
  const grant = form.get('grant_type');
  const clientId = form.get('client_id') ?? '';
  const resource = form.get('resource') ?? resourceUrl();
  if (resource !== resourceUrl()) throw new OAuthError('invalid_target', `the resource must be ${resourceUrl()}`);
  if (grant === 'authorization_code') {
    const code = form.get('code') ?? '';
    const verifier = form.get('code_verifier') ?? '';
    return await s.begin(async (tx) => {
      const t = tx as unknown as Sql;
      const [c] = await t<{ client_id: string; agent_id: string; redirect_uri: string; code_challenge: string; resource: string; used: boolean; live: boolean }[]>`
        select client_id, agent_id, redirect_uri, code_challenge, resource, used_at is not null as used, expires_at > now() as live
        from studio.oauth_codes where code_hash = ${sha256(code)} for update`;
      if (!c || !c.live || c.client_id !== clientId) throw new OAuthError('invalid_grant', 'the code is unknown, expired or for another client');
      if (c.used) {
        // A code used twice: the agent's tokens are withdrawn (RFC 6749 §4.1.2).
        await t`update studio.agent_tokens set revoked_at = now() where agent_id = ${c.agent_id} and revoked_at is null`;
        throw new OAuthError('invalid_grant', 'the code was already used');
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
  }
  if (grant === 'refresh_token') {
    const refresh = form.get('refresh_token') ?? '';
    return await s.begin(async (tx) => {
      const t = tx as unknown as Sql;
      const [r] = await t<{ agent_id: string; used: boolean; live: boolean; client_id: string; scopes: string[] }[]>`
        select t.agent_id, t.used_at is not null as used, (t.expires_at > now() and t.revoked_at is null and a.revoked_at is null and a.expires_at > now()) as live, a.client_id, a.scopes
        from studio.agent_tokens t join studio.agents a on a.id = t.agent_id
        where t.token_hash = ${sha256(refresh)} and t.kind = 'refresh' and t.resource = ${resource} for update of t`;
      if (!r || !r.live || r.client_id !== clientId) throw new OAuthError('invalid_grant', 'the refresh token is unknown, expired or withdrawn');
      if (r.used) {
        // A refresh token used twice was probably stolen: everything of this agent's is withdrawn.
        await t`update studio.agent_tokens set revoked_at = now() where agent_id = ${r.agent_id} and revoked_at is null`;
        throw new OAuthError('invalid_grant', 'the refresh token was already used');
      }
      await t`update studio.agent_tokens set used_at = now() where token_hash = ${sha256(refresh)}`;
      return { ...(await issueTokens(t, r.agent_id, resource, true)), scope: r.scopes.join(' ') };
    });
  }
  throw new OAuthError('unsupported_grant_type', 'authorization_code or refresh_token');
}

/** Token revocation (RFC 7009): always answers 200. */
export async function revokeToken(tokenValue: string) {
  await sql()`update studio.agent_tokens set revoked_at = now() where token_hash = ${sha256(tokenValue)} and revoked_at is null`;
}
