import { APP_NAME, appUrl } from '../config';
import { PAPER } from '../tokens';

/**
 * The miniapp embeds of the voice pages (Nate, 2026-11-22: "A cast of /storyboard/record opens the miniapp's home page"):
 * each page sets its own fc:miniapp / fc:frame, as /challenge does, so a cast opens on the page itself. The button titles
 * are Nate's, reread word for word. The site's card (embed.png, 3:2) is the picture.
 */
export const RECORD_BUTTON = 'Record a speech';
export const SPOKEN_BUTTON = 'Watch this storyboard';
/** A take's Share card (PR 6, 2026-11-26; the drawings' "Listen"). DRAFT for Nate's reread. */
export const TAKE_BUTTON = 'Listen';

function embed(title: string, url: string, imageUrl?: string): string {
  return JSON.stringify({
    version: '1',
    imageUrl: imageUrl ?? `${appUrl()}/embed.png`,
    button: { title, action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER } },
  });
}
/** /ephelion (Nate, 2026-11-24: a better address than /storyboard/record, which redirects to it). */
export const RECORD_PATH = '/ephelion';
export const recordEmbed = () => embed(RECORD_BUTTON, `${appUrl()}${RECORD_PATH}`);
export const spokenEmbed = (id: string) => embed(SPOKEN_BUTTON, `${appUrl()}/storyboard/spoken/${id}`);
/** A take's own embed: its picture, and a button that opens its page. */
export const takeEmbed = (id: string, picture: string | null) => embed(TAKE_BUTTON, `${appUrl()}/ephelion/take/${id}`, picture ?? undefined);
/** Both meta names, as the root layout and /challenge set them. */
export const embedMeta = (e: string) => ({ 'fc:miniapp': e, 'fc:frame': e });
