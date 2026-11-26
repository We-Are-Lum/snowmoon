import { createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';

/**
 * Discord's request signature (Ed25519 over timestamp + raw body, with the app's public key) and X's OAuth 1.0a
 * signature (HMAC-SHA1). Pure functions; the keys come from the caller.
 */

/** DER prefix that turns a raw 32-byte Ed25519 public key into an SPKI key Node can read. */
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
/** A request older than this is refused, so a captured one can't be replayed later. */
export const MAX_AGE_SECONDS = 5 * 60;

export function verifyDiscord(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, body: string, now = Date.now()): boolean {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !signatureHex || !/^[0-9a-f]{128}$/i.test(signatureHex) || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

/** RFC 3986 percent-encoding, as OAuth 1.0a requires. */
export const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type OAuthKeys = { consumerKey: string; consumerSecret: string; token: string; tokenSecret: string };

/**
 * The OAuth 1.0a signature of a request. `params` are the query and form parameters (a JSON body is not signed, as X
 * documents). Exported with its inputs so the test can check it against X's published example.
 */
export function oauthSignature(method: string, url: string, params: Record<string, string>, consumerSecret: string, tokenSecret: string): string {
  const pairs = Object.entries(params).map(([k, v]) => [pct(k), pct(v)] as const).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  const base = [method.toUpperCase(), pct(url), pct(pairs.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  return createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`).update(base).digest('base64');
}

/** The Authorization header for a request to X as the account whose token this is. */
export function oauthHeader(method: string, url: string, keys: OAuthKeys, extra: Record<string, string> = {}, nonce = randomBytes(16).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000))): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: keys.token,
    oauth_version: '1.0',
  };
  const u = new URL(url);
  const query = Object.fromEntries(u.searchParams);
  const signature = oauthSignature(method, `${u.origin}${u.pathname}`, { ...query, ...extra, ...oauth }, keys.consumerSecret, keys.tokenSecret);
  return 'OAuth ' + Object.entries({ ...oauth, oauth_signature: signature }).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}
