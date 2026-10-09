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
  /**
   * Picked styles and character sheets added to this image (step 4): each version, its name, maker
   * and the exact text added to the prompt. Published as 'uses' links. Absent on older drafts.
   */
  designs?: TicketDesign[];
  /** Pictures sent to the edit model as references (a picked sheet's views), if any. */
  references?: { url: string; sha256: string }[];
}

export interface TicketDesign {
  versionId: string;
  kind: 'style' | 'character';
  /** The style's or the character's name (the entity). */
  entity: string;
  title: string;
  by: string;
  versionNo: number;
  text: string;
  /** Set when the text was drafted by a model (the project's starting style), as recipes record it. */
  assist: unknown;
}

/**
 * A sample picture for a style, or a view for a character sheet (step 4), made before the design is
 * published. Like a draft image it is kept on the person's device, never on the server; this signed
 * record says how it was made, and that it was made with exactly this text.
 */
export interface SampleTicket {
  v: 1;
  kind: 'design-sample';
  fid: number;
  /** style: a sample; front, side, back: a sheet's views. */
  slot: 'sample' | 'front' | 'side' | 'back';
  /** The design text the picture was made with; publishing needs the same text. */
  text: string;
  /** The fixed subject (samples) or view wording, as shown on the screen. */
  subject: string;
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
  /** For side and back: the front view it was made from. */
  references?: { sha256: string }[];
  guard: { model: string; verdict: 'ok' };
  at: string;
}

function secret(): Buffer {
  const s = process.env.IMAGES_TICKET_SECRET;
  if (!s || s.length < 32) throw new Error('IMAGES_TICKET_SECRET is not set');
  return Buffer.from(s);
}

const b64 = (b: Buffer) => b.toString('base64url');

function sign(t: object): string {
  const body = b64(Buffer.from(JSON.stringify(t)));
  return `${body}.${b64(createHmac('sha256', secret()).update(body).digest())}`;
}

function read(token: string): (Record<string, unknown> & { v?: unknown; at?: string }) | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const t = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (t.v !== 1 || Date.now() - Date.parse(t.at) > IMAGES.ticketHours * 3600_000) return null;
  return t;
}

export function signTicket(t: Ticket): string {
  return sign(t);
}

/** The record, if the signature is the server's and it has not expired; otherwise null. A sample's record is not an image's. */
export function readTicket(token: string): Ticket | null {
  const t = read(token);
  return t && !('kind' in t) ? (t as unknown as Ticket) : null;
}

export function signSampleTicket(t: SampleTicket): string {
  return sign(t);
}

/** A sample's or view's record, if it is the server's, unexpired, and a sample's (never an image's). */
export function readSampleTicket(token: string): SampleTicket | null {
  const t = read(token);
  return t && t.kind === 'design-sample' ? (t as unknown as SampleTicket) : null;
}
