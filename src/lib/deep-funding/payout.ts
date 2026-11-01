import { BOOK, type CreditGraph } from './graph';
import { creditOf, type GraphAnswers } from './scoring';

/**
 * How the pot flows down one character's graph, and who receives it (the plan's "Deep funding test"; owner,
 * 2026-10-31). Pure: addresses and their checks are passed in. Shares are of the pot (adding up to 1), and in parts
 * per million for a split (Splits v2 counts in millionths), adding up to exactly 1,000,000.
 *
 * The Lake (DEEP_FUNDING.lake, the support wallet) receives:
 * 1. the owner's own originality share: what the final version keeps;
 * 2. anything reaching the book, unless the owner sets DEEP_FUNDING.bookRecipient to an address (a setting left
 *    UNSET: while it is null, no final payout is produced at all, and the refusal says so);
 * 3. anything reaching an admin's work, or a maker who is not eligible (no stored decision, below the score,
 *    unchecked, or a version no longer published);
 * 4. any recipient whose total is under DEEP_FUNDING.minShare (1%) of the pot;
 * 5. any recipient without a usable mainnet address.
 * Rules 1 to 3 are per version; 5 and then 4 are per recipient (a FID), on their total over all their versions.
 *
 * Where addresses come from: docs/proposals/payout-addresses.md (a proposal, not built). Before the splits are made,
 * each recipient confirms a payout address on the site (default: their primary verified Farcaster address); the site
 * checks it works on mainnet (an ordinary wallet, or a contract wallet deployed there) and screens it; only confirmed
 * recipients' addresses are stored. `addressOf` returns a confirmed address or null, and `usable` that check's
 * result: an unconfirmed recipient falls to the Lake by rule 5. Until it is built, the runner takes a checked file.
 */

export type LakeReason = 'owner-originality' | 'book' | 'admin' | 'ineligible' | 'under-min' | 'no-address';

export interface PayoutSettings {
  lake: `0x${string}`;
  bookRecipient: null | 'lake' | `0x${string}`;
  minShare: number;
}

export interface Recipient {
  address: `0x${string}`;
  fid: number | null;
  share: number;
  ppm: number;
  /** What it is for: 'credit' (a maker's own share), 'book', or the Lake's reasons. */
  for: Record<string, number>;
}

export type PayoutResult =
  | { ok: false; refused: string }
  | { ok: true; recipients: Recipient[]; lake: { share: number; reasons: Partial<Record<LakeReason, number>> } };

export const BOOK_RECIPIENT_UNSET =
  "Refused: who receives the book's share is not set (DEEP_FUNDING.bookRecipient in src/lib/config.ts is null). The owner decides it ('lake' or an address); until then no final payout is produced.";

const isAddress = (a: unknown): a is `0x${string}` => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

/** Splits shares into parts per million adding up to exactly 1,000,000 (largest remainder; ties by order given). */
export function toPpm(shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0);
  const raw = shares.map((s) => (total > 0 ? (s / total) * 1e6 : 0));
  const out = raw.map(Math.floor);
  let left = 1e6 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

/**
 * The payout for one character. `answers` are the final weights' answers (the top models' average). `addressOf` gives
 * a maker's mainnet address, or null; `usable` says whether an address can receive on mainnet (an ordinary wallet, or a
 * contract wallet deployed there; screened). Both are checked by the caller before this runs.
 */
export function payout(
  g: CreditGraph,
  answers: GraphAnswers,
  who: { addressOf: (fid: number) => string | null; usable: (address: `0x${string}`) => boolean },
  s: PayoutSettings,
): PayoutResult {
  if (s.bookRecipient === null || s.bookRecipient === undefined) return { ok: false, refused: BOOK_RECIPIENT_UNSET };
  if (s.bookRecipient !== 'lake' && !isAddress(s.bookRecipient)) return { ok: false, refused: `Refused: DEEP_FUNDING.bookRecipient is neither 'lake' nor an address` };
  if (!isAddress(s.lake)) return { ok: false, refused: 'Refused: the Lake address is not an address' };

  const credit = creditOf(g, answers);
  const lake: Partial<Record<LakeReason, number>> = {};
  const toLake = (why: LakeReason, x: number) => x > 0 && (lake[why] = (lake[why] ?? 0) + x);
  const perFid = new Map<number, number>();
  let book = 0;
  for (const n of g.nodes) {
    const x = credit.get(n.id) ?? 0;
    if (n.id === BOOK || n.kind === 'book') book += x;
    else if (n.isFinal) toLake('owner-originality', x);
    else if (n.admin) toLake('admin', x);
    else if (!n.eligible || n.makerFid === null) toLake('ineligible', x);
    else perFid.set(n.makerFid, (perFid.get(n.makerFid) ?? 0) + x);
  }
  if (s.bookRecipient === 'lake') toLake('book', book);

  const kept: { fid: number; address: `0x${string}`; share: number }[] = [];
  for (const [fid, x] of [...perFid].sort((a, b) => a[0] - b[0])) {
    const a = who.addressOf(fid);
    if (!isAddress(a) || !who.usable(a)) toLake('no-address', x);
    else if (x < s.minShare) toLake('under-min', x);
    else kept.push({ fid, address: a, share: x });
  }

  const lakeShare = Object.values(lake).reduce((a, b) => a + b, 0);
  const rows: Omit<Recipient, 'ppm'>[] = kept.map((k) => ({ address: k.address, fid: k.fid, share: k.share, for: { credit: k.share } }));
  if (s.bookRecipient !== 'lake' && book > 0) rows.push({ address: s.bookRecipient, fid: null, share: book, for: { book } });
  if (lakeShare > 0) rows.push({ address: s.lake, fid: null, share: lakeShare, for: { ...lake } });
  // One row per address: a maker whose address is the Lake's, or the book's, is merged with it.
  const merged = new Map<string, Omit<Recipient, 'ppm'>>();
  for (const r of rows) {
    const k = r.address.toLowerCase();
    const m = merged.get(k);
    if (!m) merged.set(k, { ...r, for: { ...r.for } });
    else {
      m.share += r.share;
      m.fid = m.fid ?? r.fid;
      for (const [w, x] of Object.entries(r.for)) m.for[w] = (m.for[w] ?? 0) + x;
    }
  }
  const list = [...merged.values()];
  const ppm = toPpm(list.map((r) => r.share));
  return { ok: true, recipients: list.map((r, i) => ({ ...r, ppm: ppm[i] })), lake: { share: lakeShare, reasons: lake } };
}
