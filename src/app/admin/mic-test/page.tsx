import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { APP_NAME, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';

/**
 * /admin/mic-test: the go/no-go for the Ephelion voice slice (Nate, 2026-11-19): can this browser, or this Farcaster
 * app, record from the microphone? Served to everyone as the site's usual "not found"; ./not-found.tsx shows a
 * signed-in admin the test. The recording stays in the tab: nothing is sent or kept.
 *
 * Its link carries the edition pages' Farcaster embed (Nate, 2026-11-20), so a cast of it opens the test inside the
 * Farcaster app rather than the home page. The page is still a 404 to everyone who isn't a signed-in admin.
 */
export const dynamic = 'force-dynamic';

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

export default function MicTestPage() {
  notFound();
}
