/**
 * Who gets the snap at /minpentai/play (owner, 2026-10-23). Farcaster's composer showed a plain card
 * there: most of its GETs reached the static page without asking for the snap by Accept. So that link
 * serves HTML only to a request that clearly prefers text/html, as browsers do, or to a link-preview
 * bot (X's card, and the like), and the snap to everything else. Pure, for src/middleware.ts and tests.
 */
export const SNAP_MEDIA = 'application/vnd.farcaster.snap+json';

/** Link-preview crawlers that read a page's card; they get the page whatever they accept. */
const PREVIEW_BOT = /Twitterbot|facebookexternalhit|Facebot|Slackbot|Discordbot|TelegramBot|LinkedInBot|WhatsApp|Applebot|Googlebot|bingbot|redditbot|Embedly|Iframely|SkypeUriPreview|Pinterestbot|Mastodon|Bluesky|Cardyb/i;

/** True when text/html is listed with a quality above 0 (browsers list it first; a bare *\/* is not a preference). */
export function prefersHtml(accept: string): boolean {
  return accept.split(',').some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';').map((s) => s.trim());
    if (type !== 'text/html' && type !== 'application/xhtml+xml') return false;
    const q = params.find((p) => p.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
}

export function wantsSnap(accept: string | null, userAgent: string | null): boolean {
  const a = accept ?? '';
  if (a.includes(SNAP_MEDIA)) return true;
  if (PREVIEW_BOT.test(userAgent ?? '')) return false;
  return !prefersHtml(a);
}
