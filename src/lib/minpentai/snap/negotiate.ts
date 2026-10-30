/**
 * Who gets the snap (owner, 2026-10-30): only a request that asks for it or comes from Farcaster's own
 * fetch; the web page, with its share card, to everyone else. The same rule on every snap link:
 * /minpentai, /minpentai/play, /snap/minpentai (the launch cast) and challenge links /minpentai/c/<…>.
 * Pure, for src/middleware.ts, the snap route and tests.
 *
 * A request is Farcaster's when any of these holds:
 * - it accepts the snap media type (every snap client must send it: https://docs.farcaster.xyz/snap);
 * - it carries X-Snap-Payload, the header Farcaster's clients add to a snap request (it is why the
 *   web client's fetch is preflighted; 2026-10-23);
 * - it is a fetch from Farcaster's web client, whose Origin is farcaster.xyz or warpcast.com (a
 *   cross-origin fetch carries Origin; a page load, a link-preview bot and a crawler don't).
 * Nothing else: the user agent is not used. Until 2026-10-30 /minpentai/play did the reverse (the snap
 * to anything that didn't clearly ask for a page), after Farcaster's composer showed a plain card on
 * 2026-10-23; the production logs since then show no Farcaster fetch of /minpentai/play to tell us
 * more, so the composer is re-tested after this change.
 */
export const SNAP_MEDIA = 'application/vnd.farcaster.snap+json';

/** Farcaster's web origins: farcaster.xyz and warpcast.com, and their subdomains, over https. */
const FARCASTER_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*(farcaster\.xyz|warpcast\.com)$/i;

export interface SnapAsk { accept: string | null; payload: string | null; origin: string | null }

export const askOf = (h: Headers): SnapAsk => ({ accept: h.get('accept'), payload: h.get('x-snap-payload'), origin: h.get('origin') });

export function wantsSnap(r: SnapAsk): boolean {
  if ((r.accept ?? '').toLowerCase().includes(SNAP_MEDIA)) return true;
  if (r.payload) return true;
  return FARCASTER_ORIGIN.test((r.origin ?? '').trim());
}
