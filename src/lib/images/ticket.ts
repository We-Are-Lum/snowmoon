import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IMAGES } from '../config';
import { SHORTHAND_ASSIST_SOURCE } from './sheets';
import type { SheetModelId } from './sheet-models';

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
  /**
   * Sheets as text (2026-10-10): the characters in this image and its place (slugs of
   * content/snowmoon/designs), as the person left them chosen from "In this passage", and the
   * project's shorthand text added for those without a picked sheet. Absent on older drafts.
   */
  sheets?: TicketSheets;
  /**
   * A remix challenge picture (branch challenge-moments, 2026-11-05), made on the remix screen (/challenge/make): the
   * character remixed, the moment (its id, and the scene line sent, this edition's, drafted by the coding agent), and
   * the version it started from (a base sheet, published as a 'uses' link through `designs`, or a challenge picture,
   * published as a 'remixed_from' link). Recorded in the recipe's params.challenge. Absent on every other image.
   */
  challenge?: TicketChallenge;
}

export interface TicketChallenge {
  character: string;
  moment: string;
  scene: string;
  from: string;
  fromKind: 'sheet' | 'picture';
}

export interface TicketSheets {
  characters: string[];
  place: string | null;
  /** Each text added, exactly; the edition's invented look, drafted by the coding agent. */
  added: { kind: 'character' | 'place'; slug: string; name: string; text: string }[];
}

export interface TicketDesign {
  versionId: string;
  kind: 'style' | 'character' | 'location';
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
  /** For a sheet's views: the published style version whose text is in the prompt. */
  style?: { versionId: string; title: string; text: string };
  /** For a remix's front view (owner, 2026-11-04): the version remixed, whose front view was sent as a reference picture. */
  source?: { versionId: string; sha256: string };
  /** For a sheet's views counted as a remix: the remix's id (src/lib/images/remixes.ts). */
  remix?: string;
  /** The sheet's model choice (src/lib/images/sheet-models.ts), set only when it isn't the open default; absent means 'open'. */
  choice?: SheetModelId;
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

/** Which inputs a model drafted: the file style's text, a model-drafted design's text, the project's shorthand. */
export function recipeAssist(t: Pick<Ticket, 'style' | 'designs' | 'sheets'> & { challenge?: TicketChallenge }) {
  const drafted: string[] = [];
  const sources: string[] = [];
  if (t.style) {
    drafted.push('style text');
    sources.push('content/snowmoon/designs/styles/techno-vistas.json');
  } else if (t.designs?.some((d) => d.assist)) {
    drafted.push('style text');
    sources.push(`design versions ${t.designs.filter((d) => d.assist).map((d) => d.versionId).join(', ')}`);
  }
  if (t.sheets?.added.length) {
    drafted.push('character and place shorthand');
    sources.push(SHORTHAND_ASSIST_SOURCE);
  }
  // A challenge picture's scene line: this edition's, drafted by the coding agent (src/lib/challenge/moments.ts).
  if (t.challenge) {
    drafted.push('moment scene line');
    sources.push(`src/lib/challenge/moments.ts (${t.challenge.moment})`);
  }
  return drafted.length ? { model: 'claude-coding-agent', drafted, source: sources.join('; ') } : null;
}

/**
 * A remix in progress (owner, 2026-11-04: count remixes, not pictures): its id, whose it is and the units it uses.
 * Given with every view of the remix, made or failed, so the person makes its other views, or one again, inside it.
 */
export interface RemixTicket {
  v: 1;
  kind: 'remix';
  fid: number;
  remix: string;
  units: number;
  at: string;
}

export function signRemixTicket(t: RemixTicket): string {
  return sign(t);
}

export function readRemixTicket(token: string): RemixTicket | null {
  const t = read(token);
  return t && t.kind === 'remix' ? (t as unknown as RemixTicket) : null;
}
