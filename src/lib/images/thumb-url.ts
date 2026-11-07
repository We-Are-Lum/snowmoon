/**
 * Small copies of readers' pictures, for lists and feeds (speed fix 1, owner 2026-11-06: saved at publish time rather
 * than Vercel's image resizer). Written by the coding agent (Claude, by Anthropic), 2026-11-07, DRAFT for the owner.
 *
 * - Every picture the site writes to the readers' public bucket (putPublic, src/lib/images/store.ts) also gets these
 *   copies, made on the site's own server with sharp: a plain resize, no model. The original stays the source of
 *   truth (P1, P2): it is never changed, its record and sha256 still name it, and its own page shows it.
 * - They sit beside the original under a key read off the original's own: images/readers/<hex>.jpg has
 *   images/readers/thumbs/<hex>-w320.webp and -w640.webp. No database row records them, so nothing about a picture's
 *   record changes; a copy that doesn't exist yet (a picture from before this, until the backfill has run) falls back
 *   to the original in the browser (src/components/thumb-img.tsx).
 * - They follow the original everywhere it goes: hidden with it (moved to the private bucket, public copy deleted),
 *   back with it on unhide, cached for the same IMAGES.cacheSeconds.
 * - Privacy: a copy holds nothing the original doesn't. It is smaller, and sharp writes it without the original's
 *   metadata. No personal data is added, so no Terms or Privacy line changes.
 *
 * This file runs in the browser too: no server imports.
 */
export const THUMBS = {
  /** Widths in image pixels. 320 covers a 64 px row on a 3x screen; 640 a phone tile, hero or feed card. */
  widths: [320, 640] as const,
  format: 'webp' as const,
  quality: 78,
  contentType: 'image/webp',
};
export type ThumbWidth = (typeof THUMBS.widths)[number];

/** A readers' picture's public address: any host or prefix, then images/readers/<32 hex>.jpg. */
const READER_URL = /^(.*\/)images\/readers\/([0-9a-f]{32})\.jpg$/;

/** The bucket key of one copy, from the picture's sha256 (its first 32 hex digits, as keyFor names the original). */
export const thumbKeyFor = (sha256: string, w: ThumbWidth) => `images/readers/thumbs/${sha256.slice(0, 32)}-w${w}.${THUMBS.format}`;

/** The copy of a readers' picture at this width; null for any other address (book media, a route, a data: URL). */
export function thumbUrl(url: string | null | undefined, w: ThumbWidth): string | null {
  const m = url?.match(READER_URL);
  return m ? `${m[1]}images/readers/thumbs/${m[2]}-w${w}.${THUMBS.format}` : null;
}

/** srcset for a readers' picture's copies; null when it has none. */
export function thumbSrcSet(url: string | null | undefined): string | null {
  if (!thumbUrl(url, 320)) return null;
  return THUMBS.widths.map((w) => `${thumbUrl(url, w)} ${w}w`).join(', ');
}

/**
 * What the recipe says about a copy (DRAFT wording, coding agent, for the owner): shown in the recipe sheet opened from a
 * list, and on a picture's own page.
 */
export const THUMB_NOTE = {
  label: 'In lists',
  list: `Lists show a smaller copy of this picture (${THUMBS.widths.join(' or ')} px wide, WebP), resized on the site's server, no model. The original is unchanged: it is the picture on its own page.`,
  page: `This is the original. Lists show a smaller copy (${THUMBS.widths.join(' or ')} px wide, WebP), resized on the site's server, no model.`,
};
