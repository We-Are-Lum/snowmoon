import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SHEET_HELP } from '../config';

/**
 * A suggestion "Ask for help" made, signed with IMAGES_TICKET_SECRET, so that publishing can label the recipe (owner,
 * 2026-10-31: the recipe shows that the prompt includes words from accepted suggestions). The server keeps no copy of
 * the conversation (Privacy §5, draft), so the device holds this until it publishes or leaves: the FID it was made
 * for, the character, the suggested words and when. On Accept the device keeps it; on Reject it drops it.
 *
 * At publish (src/app/api/designs/route.ts) a receipt counts when its signature is the server's, it is this FID's,
 * it is under SHEET_HELP.receiptHours old, and its words are still in the published text. A device that drops a
 * receipt on purpose can publish without the label; the server can't know, since it keeps nothing (a limit of the
 * no-copy design, noted in the proposal's report).
 */
export interface Receipt {
  v: 1;
  fid: number;
  /** The character's sheet slug (content/snowmoon/designs/characters). */
  character: string;
  after: string;
  model: string;
  at: string;
}

const secret = () => process.env.IMAGES_TICKET_SECRET ?? '';
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const mac = (body: string) => createHmac('sha256', secret()).update(`sheet-help.v1.${body}`).digest('base64url');

export function signReceipt(r: Omit<Receipt, 'v'>): string | null {
  if (!secret()) return null;
  const body = b64(JSON.stringify({ v: 1, ...r }));
  return `${body}.${mac(body)}`;
}

export function readReceipt(token: unknown): Receipt | null {
  if (typeof token !== 'string' || token.length > 4000 || !secret()) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const r = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Receipt;
    return r.v === 1 && typeof r.fid === 'number' && typeof r.after === 'string' && typeof r.at === 'string' ? r : null;
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The receipts that count for this publish (see above). */
export function acceptedIn(tokens: unknown, fid: number, text: string, now = new Date()): Receipt[] {
  if (!Array.isArray(tokens)) return [];
  const t = norm(text);
  return tokens
    .slice(0, 100)
    .map(readReceipt)
    .filter((r): r is Receipt => !!r && r.fid === fid && now.getTime() - Date.parse(r.at) < SHEET_HELP.receiptHours * 3600_000 && Date.parse(r.at) <= now.getTime() + 60_000 && t.includes(norm(r.after)));
}
