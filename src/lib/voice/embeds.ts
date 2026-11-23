import { APP_NAME, appUrl } from '../config';
import { PAPER } from '../tokens';

/**
 * The miniapp embeds of the voice pages (Nate, 2026-11-22: "A cast of /storyboard/record opens the miniapp's home page"):
 * each page sets its own fc:miniapp / fc:frame, as /challenge does, so a cast opens on the page itself. The button titles
 * are Nate's, reread word for word. The site's card (embed.png, 3:2) is the picture.
 */
export const RECORD_BUTTON = 'Record a speech';
export const SPOKEN_BUTTON = 'Watch this storyboard';

function embed(title: string, url: string): string {
  return JSON.stringify({
    version: '1',
    imageUrl: `${appUrl()}/embed.png`,
    button: { title, action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER } },
  });
}
export const recordEmbed = () => embed(RECORD_BUTTON, `${appUrl()}/storyboard/record`);
export const spokenEmbed = (id: string) => embed(SPOKEN_BUTTON, `${appUrl()}/storyboard/spoken/${id}`);
/** Both meta names, as the root layout and /challenge set them. */
export const embedMeta = (e: string) => ({ 'fc:miniapp': e, 'fc:frame': e });
