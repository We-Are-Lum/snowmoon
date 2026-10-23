import { WALLET_LINKS } from '../config';

/**
 * The 30-day note about automatic links (owner, 2026-10-22: "Yes to the 30-day note in the wallet panel and on the You
 * page"), in the owner's words. Shown to everyone until WALLET_LINKS.announceUntil (a UTC day, inclusive), then gone
 * on its own, with no further deploy.
 */
export const LINK_NOTE = 'New: if your wallet is verified on Farcaster, it now links to that account automatically. Privacy §7.';

/** Whether the note shows at `now`: through the whole of the announceUntil day, in UTC. */
export function linkNoteShown(now: Date = new Date()): boolean {
  const end = Date.parse(`${WALLET_LINKS.announceUntil}T00:00:00Z`) + 24 * 3600 * 1000;
  return Number.isFinite(end) && now.getTime() < end;
}
