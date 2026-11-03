/**
 * Who gets what on the snap links (owner, 2026-10-30): /minpentai, /minpentai/play, challenge links
 * /minpentai/c/<…> and /snap/minpentai (the launch cast). Pure, for src/middleware.ts and tests.
 *
 * - A request whose Accept names the snap media type, from anyone, gets the snap (every snap client
 *   sends it; Farcaster's feed fetches through FarcasterSnapProxy with it).
 * - Farcaster's composer, whose fetcher's user agent contains "FCBot" (also "Twitterbot like FCBot/0.1"),
 *   gets the link's page without its fc:frame / fc:miniapp tags: the card tags and an absolute Link header
 *   to the snap. With those tags the composer shows a mini app card; without them it shows the snap
 *   (owner's composer test, 2026-10-30: x=1 card, x=2 and x=3 game). Checked before anything else about
 *   the user agent, since FCBot's contains "Twitterbot".
 * - Everyone else (browsers, X, Discord, Slack, Telegram, iMessage, crawlers) gets the full page and card.
 */
export const SNAP_MEDIA = 'application/vnd.farcaster.snap+json';

export type SnapRoute = 'snap' | 'composer' | 'page';

export function snapRoute(accept: string | null, userAgent: string | null): SnapRoute {
  if ((accept ?? '').toLowerCase().includes(SNAP_MEDIA)) return 'snap';
  if (/FCBot/.test(userAgent ?? '')) return 'composer';
  return 'page';
}
