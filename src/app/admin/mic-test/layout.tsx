import type { Metadata } from 'next';
import { APP_NAME, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';

/**
 * /admin/mic-test's Farcaster embed (Nate, 2026-11-20), on a layout rather than the page: the page answers "not found"
 * for everyone (an admin's browser draws the test in its place), and a not-found render takes its <head> from the layouts
 * around it, so an embed on the page itself only reached the streamed data, not the <head> a link preview reads.
 * A cast of the link opens the test inside the Farcaster app. Still a 404 to everyone who isn't a signed-in admin.
 */
const embed = () =>
  JSON.stringify({
    version: '1',
    imageUrl: `${appUrl()}/embed.png`,
    button: {
      title: 'Open the microphone test',
      action: { type: 'launch_frame', name: APP_NAME, url: `${appUrl()}/admin/mic-test`, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });

export function generateMetadata(): Metadata {
  return { robots: { index: false, follow: false }, other: { 'fc:miniapp': embed(), 'fc:frame': embed() } };
}

export default function MicTestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
