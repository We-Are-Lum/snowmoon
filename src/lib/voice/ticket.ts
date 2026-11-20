import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed records the device holds between steps (a conversion, a word check), so nothing is stored until Accept, and
 * Accept can't be handed a recipe we didn't make. HMAC-SHA256 with VOICE_TICKET_SECRET, or IMAGES_TICKET_SECRET under a
 * different label (so a picture's ticket is never a voice ticket).
 */
const secret = () => process.env.VOICE_TICKET_SECRET || (process.env.IMAGES_TICKET_SECRET ? `voice-ticket:v1:${process.env.IMAGES_TICKET_SECRET}` : '');
export const ticketsReady = () => secret().length >= 16;

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signTicket(payload: object): string {
  const body = b64(JSON.stringify(payload));
  const mac = createHmac('sha256', secret()).update(`voice:${body}`).digest('base64url');
  return `${body}.${mac}`;
}
export function verifyTicket<T>(s: string): T | null {
  if (!ticketsReady() || typeof s !== 'string') return null;
  const [body, mac] = s.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', secret()).update(`voice:${body}`).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
export const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
