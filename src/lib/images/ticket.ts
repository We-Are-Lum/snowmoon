import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IMAGES } from '../config';

/**
 * A draft image is never stored on the server (docs/proposals/add-an-image.md, section 5). The
 * server hands the person's device the image and this record of how it was made, signed with
 * IMAGES_TICKET_SECRET. At Publish the device sends both back; the signature proves the record
 * is the server's own, so the recipe written then is exactly what was sent to the model.
 */
export interface Ticket {
  v: 1;
  fid: number;
  chapter: number;
  start: number;
  end: number;
  /** The person's own prompt, as they wrote it. */
  userPrompt: string;
  /** The style chosen, if any, and its text as sent (model-drafted, so recorded in assist). */
  style: { id: string; text: string } | null;
  /** The exact final string sent to the model. */
  prompt: string;
  model: string;
  endpoint: string;
  host: string;
  settings: Record<string, unknown>;
  seed: number | null;
  requestId: string | null;
  sha256: string;
  width: number;
  height: number;
  costUsd: number;
  guard: { model: string; verdict: 'ok' };
  at: string;
}

function secret(): Buffer {
  const s = process.env.IMAGES_TICKET_SECRET;
  if (!s || s.length < 32) throw new Error('IMAGES_TICKET_SECRET is not set');
  return Buffer.from(s);
}

const b64 = (b: Buffer) => b.toString('base64url');

export function signTicket(t: Ticket): string {
  const body = b64(Buffer.from(JSON.stringify(t)));
  return `${body}.${b64(createHmac('sha256', secret()).update(body).digest())}`;
}

/** The record, if the signature is the server's and it has not expired; otherwise null. */
export function readTicket(token: string): Ticket | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as Ticket;
  if (t.v !== 1 || Date.now() - Date.parse(t.at) > IMAGES.ticketHours * 3600_000) return null;
  return t;
}
