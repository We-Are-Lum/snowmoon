import type { Metadata } from 'next';
import { APP_NAME, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';
import { MinpentaiApp } from './minpentai-app';

/**
 * The share card (owner, 2026-10-20): a frame of the site's own 3D broadcast (watch screen 3, the teaser's
 * 3D beat) with three lines of type, drawn by scripts/minpentai-share-card.ts into public/share; no image
 * model. Farcaster gets the 3:2 embed with "Start the tutorial", which opens lesson 1 whatever link was
 * pasted (so /minpentai?lesson=1 keeps it); X and other link previews get the 1200×630 version.
 * The page stays static: the button's link does not depend on the pasted one.
 */
const TITLE = 'Minpentai';
const DESCRIPTION = 'A game from Vitalik Buterin’s Snowmoon';
const TUTORIAL_PATH = '/minpentai?lesson=1';

export function generateMetadata(): Metadata {
  const og = `${appUrl()}/share/minpentai-og-1200x630.png`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: `${appUrl()}/share/minpentai-embed-3x2.png`,
    button: {
      title: 'Start the tutorial',
      action: { type: 'launch_frame', name: APP_NAME, url: `${appUrl()}${TUTORIAL_PATH}`, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${appUrl()}/minpentai`, images: [{ url: og, width: 1200, height: 630, alt: `${TITLE}: ${DESCRIPTION}. A frame of the game's 3D broadcast.` }] },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [og] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

/** Learn and Free play (minpentai-app.tsx). The sandbox (sandbox.tsx) is kept in the repo, out of the page. */
export default function MinpentaiPage() {
  return (
    <div className="page minpentai">
      <MinpentaiApp />
    </div>
  );
}
