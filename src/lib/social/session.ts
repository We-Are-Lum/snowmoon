import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SOCIAL_SIGN_IN } from '../config';

/**
 * Lens and Bluesky sign-in sessions and the short-lived things a sign-in carries between its steps
 * (branch signin-lens-bluesky). Like the wallet's (src/lib/wallet/session.ts), everything is signed or sealed by our
 * server with keys derived from IMAGES_TICKET_SECRET, so no sign-in state is stored in the database:
 * - the session token, sent as a bearer header: "s1." + the account number, its kind, its DID or Lens account
 *   address, its handle and the expiry, signed;
 * - a Lens challenge ticket: the challenge's id and the account it is for, signed, ten minutes;
 * - a Bluesky sign-in in progress (PKCE verifier, the one-time DPoP key, the expected issuer…): sealed with AES-256-GCM
 *   and kept by the page in this tab (sessionStorage) until the browser comes back. Only our server can read or
 *   change it; the authorization server never sees it.
 */
export type SocialKind = 'lens' | 'bluesky';

function key(label: string): Buffer | null {
  const s = process.env.IMAGES_TICKET_SECRET;
  return s && s.length >= 32 ? createHmac('sha256', s).update(`social:${label}`).digest() : null;
}
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export interface SocialSession {
  /** studio.social_accounts.id. */
  account: number;
  kind: SocialKind;
  /** Lens: the account address, lowercase. Bluesky: the DID. */
  subject: string;
  /** Lens: "lens/<name>"; Bluesky: the handle. Null when there is none we could check. */
  handle: string | null;
  exp: number;
}

const SUBJECT = { lens: /^0x[0-9a-f]{40}$/, bluesky: /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$/ } as const;
export const subjectOk = (kind: SocialKind, subject: string) => SUBJECT[kind].test(subject);

export function signSocialSession(s: Omit<SocialSession, 'exp'>, hours: number = SOCIAL_SIGN_IN.sessionHours): string | null {
  const k = key('session');
  if (!k) return null;
  const exp = Math.floor(Date.now() / 1000 + hours * 3600);
  const body = Buffer.from(JSON.stringify({ ...s, exp })).toString('base64url');
  return `s1.${body}.${createHmac('sha256', k).update(body).digest('base64url')}`;
}

export function readSocialSession(token: string | null | undefined): SocialSession | null {
  const k = key('session');
  if (!k || !token?.startsWith('s1.')) return null;
  const [, body, sig] = token.split('.');
  if (!body || !sig || !same(Buffer.from(sig, 'base64url'), createHmac('sha256', k).update(body).digest())) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as SocialSession;
    if (!Number.isInteger(s.account) || s.account <= 0 || (s.kind !== 'lens' && s.kind !== 'bluesky') || !subjectOk(s.kind, s.subject)) return null;
    if (s.exp * 1000 <= Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** A signed, short-lived ticket (the Lens challenge's id and account). */
export function signTicket(label: string, data: Record<string, unknown>, minutes: number): string | null {
  const k = key(`ticket:${label}`);
  if (!k) return null;
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000 + minutes * 60) })).toString('base64url');
  return `${body}.${createHmac('sha256', k).update(body).digest('base64url')}`;
}
export function readTicket<T>(label: string, ticket: unknown): T | null {
  const k = key(`ticket:${label}`);
  if (!k || typeof ticket !== 'string' || ticket.length > 4000) return null;
  const [body, sig] = ticket.split('.');
  if (!body || !sig || !same(Buffer.from(sig, 'base64url'), createHmac('sha256', k).update(body).digest())) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp: number };
    return t.exp * 1000 > Date.now() ? t : null;
  } catch {
    return null;
  }
}

/** Sealed (encrypted and authenticated) with AES-256-GCM: v1.<iv>.<ciphertext>.<tag>, base64url. */
export function seal(label: string, data: Record<string, unknown>, minutes: number): string | null {
  const k = key(`seal:${label}`);
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000 + minutes * 60) })), c.final()]);
  return `v1.${iv.toString('base64url')}.${enc.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
}
export function unseal<T>(label: string, sealed: unknown): T | null {
  const k = key(`seal:${label}`);
  if (!k || typeof sealed !== 'string' || sealed.length > 8000) return null;
  const [v, iv, enc, tag] = sealed.split('.');
  if (v !== 'v1' || !iv || !enc || !tag) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    const t = JSON.parse(Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString()) as T & { exp: number };
    return t.exp * 1000 > Date.now() ? t : null;
  } catch {
    return null;
  }
}

/** Equal strings, in constant time. */
export function sameString(a: string, b: string): boolean {
  return same(Buffer.from(a), Buffer.from(b));
}
