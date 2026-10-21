import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { IMAGES } from '../config';

/**
 * Wallet sign-in (owner, 2026-10-13): Sign-In with Ethereum (EIP-4361). Both halves are signed by
 * our server with a key derived from IMAGES_TICKET_SECRET, so nothing is stored for them:
 * - the nonce in the message the wallet signs: random, good for ten minutes;
 * - the session token sent back as a bearer header: the account number and address, good for
 *   IMAGES.prepaid.sessionHours. It starts with "w1." so it is never mistaken for a Farcaster token.
 * A wallet session is accepted only by the image routes, consent and "Make your own" (src/lib/auth.ts getPerson).
 */
const NONCE_MINUTES = 10;

function key(label: string): Buffer | null {
  const s = process.env.IMAGES_TICKET_SECRET;
  return s && s.length >= 32 ? createHmac('sha256', s).update(`wallet:${label}`).digest() : null;
}
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** A nonce for one sign-in: 16 random bytes, its expiry, and our signature, all hex (EIP-4361 wants alphanumeric). */
export function newNonce(): string | null {
  const k = key('nonce');
  if (!k) return null;
  const body = randomBytes(16).toString('hex') + Math.floor(Date.now() / 1000 + NONCE_MINUTES * 60).toString(16).padStart(10, '0');
  return body + createHmac('sha256', k).update(body).digest('hex').slice(0, 32);
}

export function nonceOk(nonce: string): boolean {
  const k = key('nonce');
  if (!k || !/^[0-9a-f]{74}$/.test(nonce)) return false;
  const body = nonce.slice(0, 42);
  if (!same(Buffer.from(nonce.slice(42), 'hex'), createHmac('sha256', k).update(body).digest().subarray(0, 16))) return false;
  return parseInt(body.slice(32), 16) * 1000 > Date.now();
}

export interface WalletSession {
  /** studio.wallet_accounts.id; the person number in the image tables is minus this. */
  account: number;
  /** Lowercase 0x address. */
  address: `0x${string}`;
  /** Seconds since the epoch. */
  exp: number;
}

export function signSession(account: number, address: string): string | null {
  const k = key('session');
  if (!k) return null;
  const exp = Math.floor(Date.now() / 1000 + IMAGES.prepaid.sessionHours * 3600);
  const body = Buffer.from(JSON.stringify({ account, address: address.toLowerCase(), exp })).toString('base64url');
  return `w1.${body}.${createHmac('sha256', k).update(body).digest('base64url')}`;
}

export function readSession(token: string | null | undefined): WalletSession | null {
  const k = key('session');
  if (!k || !token?.startsWith('w1.')) return null;
  const [, body, sig] = token.split('.');
  if (!body || !sig || !same(Buffer.from(sig, 'base64url'), createHmac('sha256', k).update(body).digest())) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as WalletSession;
    if (!Number.isInteger(s.account) || s.account <= 0 || !/^0x[0-9a-f]{40}$/.test(s.address) || s.exp * 1000 <= Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** How a wallet is shown as a byline: 0x1234…abcd. */
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
