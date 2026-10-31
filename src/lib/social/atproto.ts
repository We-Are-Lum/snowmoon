import 'server-only';
import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign as signData, type JsonWebKey } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SOCIAL_SIGN_IN } from '../config';
import { sameString, seal, unseal } from './session';

/**
 * Bluesky sign-in: AT Protocol OAuth (atproto.com/specs/oauth), written against the spec with Node's own crypto (no
 * OAuth package is installed). A public client: PKCE (S256), pushed authorization requests (PAR) and DPoP-bound tokens
 * (ES256), scope "atproto" only, which proves who the person is and nothing more.
 *
 * Start (startBluesky): the handle (or DID) the person typed → their DID (DNS TXT _atproto.<handle>, else
 * https://<handle>/.well-known/atproto-did) → their DID document (plc.directory, or did:web) → their PDS → the PDS's
 * authorization server (/.well-known/oauth-protected-resource) → its metadata (/.well-known/oauth-authorization-server,
 * whose `issuer` must be that server). Then a PAR with a fresh PKCE verifier and a one-time DPoP key, and the browser
 * goes to the authorization endpoint. What the finish needs is sealed (session.ts) and kept by the page in this tab.
 *
 * Finish (finishBluesky), when the browser comes back with code, state and iss:
 * - the state must be the one sealed for this tab, and `iss` must be the authorization server we sent the person to;
 * - the code is exchanged at that server's token endpoint (DPoP, PKCE verifier);
 * - the answer's `sub` must be a DID (the one typed, if a handle or DID was typed), and that DID's own PDS must name
 *   this issuer as its authorization server (the spec's check that the server may speak for this DID);
 * - the handle is kept only if it resolves back to the same DID.
 * The access and refresh tokens are then dropped; nothing of the server's is kept.
 *
 * Every outside request is HTTPS to a public host name (no IP literal, no localhost), with a timeout, no redirects
 * and a size limit. `ATPROTO_HTTP` is replaced only by the tests.
 */
export const ATPROTO_HTTP: { fetch: typeof fetch; resolveTxt: (name: string) => Promise<string[][]> } = {
  fetch: (...a) => fetch(...a),
  resolveTxt: (name) => resolveTxt(name),
};

export class BlueskyRefused extends Error {
  constructor(public why: 'bad-handle' | 'no-did' | 'bad-did-doc' | 'no-pds' | 'no-auth-server' | 'bad-metadata' | 'par-failed' | 'bad-state' | 'bad-issuer' | 'token-failed' | 'bad-sub' | 'wrong-server') {
    super(why);
  }
}

const HANDLE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DID = /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$/;
export const isDid = (s: unknown): s is string => typeof s === 'string' && DID.test(s);

/** An https URL on a public host name, or null. */
export function publicHttps(u: unknown): URL | null {
  if (typeof u !== 'string' || u.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  const h = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || isIP(h.replace(/^\[|\]$/g, '')) || h === 'localhost' || !h.includes('.') || /\.(local|localhost|internal|lan|home|arpa)$/.test(h)) return null;
  return url;
}

async function getJson(u: string): Promise<Record<string, unknown>> {
  if (!publicHttps(u)) throw new Error('not a public https URL');
  const res = await ATPROTO_HTTP.fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(SOCIAL_SIGN_IN.bluesky.timeoutMs), redirect: 'error' });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const text = await res.text();
  if (text.length > 100_000) throw new Error('too large');
  return JSON.parse(text) as Record<string, unknown>;
}

/** A handle's DID: DNS TXT first, then HTTPS. Null when neither answers with a DID. */
export async function resolveHandle(handle: string): Promise<string | null> {
  const h = handle.toLowerCase().replace(/^@/, '');
  if (!HANDLE.test(h) || h.length > 253) return null;
  try {
    const recs = (await ATPROTO_HTTP.resolveTxt(`_atproto.${h}`)).map((r) => r.join(''));
    const dids = recs.filter((r) => r.startsWith('did=')).map((r) => r.slice(4));
    if (dids.length === 1 && isDid(dids[0])) return dids[0];
  } catch {
    /* no TXT record: try HTTPS */
  }
  try {
    const u = `https://${h}/.well-known/atproto-did`;
    if (!publicHttps(u)) return null;
    const res = await ATPROTO_HTTP.fetch(u, { signal: AbortSignal.timeout(SOCIAL_SIGN_IN.bluesky.timeoutMs), redirect: 'error' });
    if (!res.ok) return null;
    const d = (await res.text()).trim();
    return isDid(d) ? d : null;
  } catch {
    return null;
  }
}

/** A DID's PDS and the handle its document claims (not yet checked the other way). */
export async function resolveDid(did: string): Promise<{ pds: string; claimedHandle: string | null }> {
  if (!isDid(did)) throw new BlueskyRefused('no-did');
  const url = did.startsWith('did:plc:') ? `${SOCIAL_SIGN_IN.bluesky.plcDirectory}/${did}` : `https://${did.slice('did:web:'.length)}/.well-known/did.json`;
  let doc: Record<string, unknown>;
  try {
    doc = await getJson(url);
  } catch {
    throw new BlueskyRefused('bad-did-doc');
  }
  if (doc.id !== did) throw new BlueskyRefused('bad-did-doc');
  const services = Array.isArray(doc.service) ? (doc.service as { id?: string; type?: string; serviceEndpoint?: unknown }[]) : [];
  const pds = services.find((s) => (s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`) && s.type === 'AtprotoPersonalDataServer');
  const pdsUrl = publicHttps(pds?.serviceEndpoint);
  if (!pdsUrl) throw new BlueskyRefused('no-pds');
  const aka = Array.isArray(doc.alsoKnownAs) ? (doc.alsoKnownAs as unknown[]).find((x) => typeof x === 'string' && x.startsWith('at://')) : undefined;
  return { pds: pdsUrl.origin, claimedHandle: typeof aka === 'string' ? aka.slice(5).toLowerCase() : null };
}

/** The authorization server a PDS names. */
export async function authServerOf(pds: string): Promise<string> {
  try {
    const pr = await getJson(`${pds}/.well-known/oauth-protected-resource`);
    const as = Array.isArray(pr.authorization_servers) ? pr.authorization_servers[0] : null;
    const u = publicHttps(as);
    if (!u || u.origin !== as) throw new Error('not an origin');
    return u.origin;
  } catch {
    throw new BlueskyRefused('no-auth-server');
  }
}

export interface AsMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  pushed_authorization_request_endpoint: string;
}
/** The authorization server's metadata, checked: its issuer is itself, and it supports what this client uses. */
export async function asMetadata(issuer: string): Promise<AsMetadata> {
  let m: Record<string, unknown>;
  try {
    m = await getJson(`${issuer}/.well-known/oauth-authorization-server`);
  } catch {
    throw new BlueskyRefused('bad-metadata');
  }
  const has = (k: string, v: string) => Array.isArray(m[k]) && (m[k] as unknown[]).includes(v);
  const ok =
    m.issuer === issuer &&
    publicHttps(m.authorization_endpoint) &&
    publicHttps(m.token_endpoint) &&
    publicHttps(m.pushed_authorization_request_endpoint) &&
    has('dpop_signing_alg_values_supported', 'ES256') &&
    has('scopes_supported', 'atproto') &&
    has('code_challenge_methods_supported', 'S256') &&
    m.authorization_response_iss_parameter_supported === true;
  if (!ok) throw new BlueskyRefused('bad-metadata');
  return m as unknown as AsMetadata;
}

// --- DPoP (RFC 9449) ------------------------------------------------------------------------------------------------

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function dpopProof(privateJwk: JsonWebKey, htm: string, htu: string, nonce?: string): string {
  const { d: _d, ...pub } = privateJwk;
  void _d;
  const header = b64u(JSON.stringify({ typ: 'dpop+jwt', alg: 'ES256', jwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } }));
  const payload = b64u(JSON.stringify({ jti: randomBytes(16).toString('base64url'), htm, htu, iat: Math.floor(Date.now() / 1000), ...(nonce ? { nonce } : {}) }));
  const sig = signData('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey({ key: privateJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64u(sig)}`;
}

/** A form POST with a DPoP proof; once more with the server's nonce if it asks for one (use_dpop_nonce). */
async function dpopPost(url: string, form: Record<string, string>, key: JsonWebKey, nonce?: string): Promise<{ status: number; body: Record<string, unknown>; nonce?: string }> {
  let n = nonce;
  for (let i = 0; i < 2; i++) {
    const res = await ATPROTO_HTTP.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', DPoP: dpopProof(key, 'POST', url, n) },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(SOCIAL_SIGN_IN.bluesky.timeoutMs),
      redirect: 'error',
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const next = res.headers.get('dpop-nonce') ?? undefined;
    if (res.status === 400 && body.error === 'use_dpop_nonce' && next && i === 0) {
      n = next;
      continue;
    }
    return { status: res.status, body, nonce: next ?? n };
  }
  throw new Error('unreachable');
}

// --- The client ---------------------------------------------------------------------------------------------------

/**
 * Who this client is, from the page's origin: a loopback client (http://127.0.0.1 or http://localhost, never on
 * Vercel) or the site's client metadata document. Null when the origin is neither.
 */
export function clientFor(origin: string): { clientId: string; redirectUri: string } | null {
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return null;
  }
  const { scope, redirectPath, metadataPath } = SOCIAL_SIGN_IN.bluesky;
  if (o.protocol === 'http:' && (o.hostname === '127.0.0.1' || o.hostname === 'localhost')) {
    if (process.env.VERCEL) return null;
    // The spec's loopback client: client_id http://localhost, the redirect on 127.0.0.1 (never "localhost").
    const redirectUri = `http://127.0.0.1${o.port ? `:${o.port}` : ''}${redirectPath}`;
    return { clientId: `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`, redirectUri };
  }
  if (o.protocol === 'https:' && publicHttps(o.origin)) return { clientId: `${o.origin}${metadataPath}`, redirectUri: `${o.origin}${redirectPath}` };
  return null;
}

/** The client metadata document the site serves at SOCIAL_SIGN_IN.bluesky.metadataPath (its URL is the client_id). */
export function clientMetadata(origin: string) {
  const c = clientFor(origin);
  if (!c || c.clientId.startsWith('http://')) return null;
  return {
    client_id: c.clientId,
    client_name: 'Snowmoon Party',
    client_uri: origin,
    redirect_uris: [c.redirectUri],
    scope: SOCIAL_SIGN_IN.bluesky.scope,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  };
}

interface Started {
  state: string;
  verifier: string;
  key: JsonWebKey;
  iss: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  /** The DID typed (or the handle's), which the token's sub must equal. */
  did: string;
  nonce?: string;
}

/** Start: where to send the browser, and the sealed state the page keeps in this tab. */
export async function startBluesky(input: string, origin: string): Promise<{ url: string; sealed: string }> {
  const client = clientFor(origin);
  if (!client) throw new BlueskyRefused('bad-handle');
  const typed = input.trim().toLowerCase().replace(/^@/, '');
  const did = isDid(typed) ? typed : await resolveHandle(typed);
  if (!did) throw new BlueskyRefused(HANDLE.test(typed) ? 'no-did' : 'bad-handle');
  const { pds } = await resolveDid(did);
  const iss = await authServerOf(pds);
  const m = await asMetadata(iss);
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const key = privateKey.export({ format: 'jwk' });
  const par = await dpopPost(m.pushed_authorization_request_endpoint, {
    client_id: client.clientId,
    response_type: 'code',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state,
    redirect_uri: client.redirectUri,
    scope: SOCIAL_SIGN_IN.bluesky.scope,
    login_hint: isDid(typed) ? did : typed,
  }, key);
  const requestUri = par.body.request_uri;
  if (par.status !== 201 && par.status !== 200) throw new BlueskyRefused('par-failed');
  if (typeof requestUri !== 'string' || !requestUri.startsWith('urn:')) throw new BlueskyRefused('par-failed');
  const started: Started = { state, verifier, key, iss, tokenEndpoint: m.token_endpoint, clientId: client.clientId, redirectUri: client.redirectUri, did, nonce: par.nonce };
  const sealed = seal('bluesky', started as unknown as Record<string, unknown>, SOCIAL_SIGN_IN.bluesky.startMinutes);
  if (!sealed) throw new Error('no IMAGES_TICKET_SECRET');
  const url = new URL(m.authorization_endpoint);
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('request_uri', requestUri);
  return { url: url.toString(), sealed };
}

/** Finish: the DID proven, and its handle if the handle resolves back to it. Throws BlueskyRefused otherwise. */
export async function finishBluesky(p: { code?: unknown; state?: unknown; iss?: unknown; sealed?: unknown }): Promise<{ did: string; handle: string | null }> {
  const s = unseal<Started>('bluesky', p.sealed);
  if (!s || typeof p.state !== 'string' || !sameString(p.state, s.state)) throw new BlueskyRefused('bad-state');
  if (typeof p.iss !== 'string' || p.iss !== s.iss) throw new BlueskyRefused('bad-issuer');
  if (typeof p.code !== 'string' || p.code.length < 8 || p.code.length > 2000) throw new BlueskyRefused('token-failed');
  const t = await dpopPost(s.tokenEndpoint, {
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: s.redirectUri,
    code_verifier: s.verifier,
    client_id: s.clientId,
  }, s.key, s.nonce);
  if (t.status !== 200 || typeof t.body.access_token !== 'string') throw new BlueskyRefused('token-failed');
  const scopes = typeof t.body.scope === 'string' ? t.body.scope.split(' ') : [];
  if (t.body.token_type !== 'DPoP' || !scopes.includes('atproto')) throw new BlueskyRefused('token-failed');
  const sub = t.body.sub;
  if (!isDid(sub) || sub !== s.did) throw new BlueskyRefused('bad-sub');
  // The spec's check: the DID's own PDS must name this issuer as its authorization server.
  const { pds, claimedHandle } = await resolveDid(sub);
  if ((await authServerOf(pds)) !== s.iss) throw new BlueskyRefused('wrong-server');
  const handle = claimedHandle && (await resolveHandle(claimedHandle)) === sub ? claimedHandle : null;
  return { did: sub, handle };
}
