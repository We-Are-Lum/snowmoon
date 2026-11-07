/**
 * Delivery copies of a published cut, so the player starts sooner (owner, 2026-10-18: "do video start
 * now and keep it the same version number, since the cut itself doesn't change").
 *
 * The version's recipe still names its cut (video_url). These are the same cut, packaged for playback:
 * - wide: the cut re-wrapped in 1-second fragments, so the browser needs about 9 KB of index before the
 *   first frame instead of the cut's 318 KB moov. Its video and audio streams are bit-identical to the
 *   cut's (ffmpeg streamhash, checked by npm run publish:scene-video).
 * - phone: a 1280×720 encode of the cut for screens up to 800px wide, same fragments; the audio is the
 *   cut's own stream, copied.
 * - poster (only where it differs from the recipe's): the picture shown before play. Version 2's recipe names
 *   the triptych with the title bar; the home card already prints the title under it, so the page shows the
 *   same three close-ups without any text (owner, 2026-10-18: "Probably best if starting image is just the 3
 *   of them no text"). A published version's recipe is fixed (0012), so this is not a new version.
 * - posterSmall: the shown poster scaled to 800 px wide for the home and scenes cards (346 px wide on a phone), so a
 *   first visit on a slow phone isn't waiting on the 1920 px file (455 KB, 71 KB at 800 px; owner, 2026-11-06). It ships
 *   with the site (public/home/), named by its sha256 like the others.
 * How each is made, and its sha256: adaptations/fifteen-days/versions/<n>.json, "delivery" and "poster_shown".
 * Files are named by their sha256 on media.snowmoon.party, like the cut.
 */
export interface Delivery {
  /** For screens up to 800px wide. */
  phone: string;
  /** For wider screens. */
  wide: string;
  /** The poster shown in place of the recipe's, when there is one. */
  poster?: string;
  /** The shown poster at 800 px wide, for the cards. */
  posterSmall?: string;
}

const BY_CUT: Record<string, Delivery> = {
  'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-9391f90d6dca.mp4': {
    phone: 'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-phone-6a5de81bbece.mp4',
    wide: 'https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-wide-3e425205b1a4.mp4',
  },
  // Version 2, the GPT cut (owner, 2026-10-18), made the same way.
  'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4': {
    phone: 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-phone-3f91cf56859f.mp4',
    wide: 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-wide-b64332cf553c.mp4',
    poster: 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-shown-4fc80109065b.jpg',
    posterSmall: '/home/fifteen-days-poster-shown-800-ae03b1e93456.jpg',
  },
};

export function deliveryFor(cutUrl: string | null): Delivery | null {
  return (cutUrl && BY_CUT[cutUrl]) || null;
}

/** The poster to show for a version: its shown poster if it has one, else the recipe's. */
export function posterFor(cutUrl: string | null, recipePoster: string | null): string | null {
  return deliveryFor(cutUrl)?.poster ?? recipePoster;
}

/** The poster for a card: the 800 px copy where there is one, else posterFor's. */
export function cardPosterFor(cutUrl: string | null, recipePoster: string | null): string | null {
  return deliveryFor(cutUrl)?.posterSmall ?? posterFor(cutUrl, recipePoster);
}
