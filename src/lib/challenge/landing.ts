import type { Metadata } from 'next';
import { APP_NAME, CHALLENGE, appUrl } from '../config';
import type { DesignBody, DesignPicture } from '../element-body';
import { PAPER } from '../tokens';
import { dateText, windowText } from './rules';

/**
 * A remix page as a landing page (owner, 2026-11-04: "Every remix page works as a landing page for someone arriving
 * from a post: a big picture, the maker, a big Remix button, like, and 'Posted on'. Its link preview shows the picture
 * on Farcaster (miniapp embed), Bluesky and Lens."). Pure functions, so scripts/test-challenge.ts can prove them:
 * - the picture is the sheet's front view, only from a published version (the caller's designByVersion returns
 *   nothing for a hidden or unpublished design, and then there is no landing and no preview picture);
 * - the Remix button opens that version's remix form while the window is open; before and after, a line instead;
 * - the link preview: Farcaster's fc:miniapp (and fc:frame) embed with a 3:2 card (1200×800 PNG, the front view padded,
 *   never cropped: /api/design-card/<id>), and Open Graph plus twitter:card for Bluesky and Lens (1200×630).
 * Words drafted by the coding agent (Claude, a closed model by Anthropic) for the owner's review; every date comes
 * from CHALLENGE.dates.
 */

type Phase = 'before' | 'open' | 'closed';

/** The landing's picture: the front view, or nothing (a sheet with no front view gets no landing and no preview picture). */
export function landingPicture(body: Pick<DesignBody, 'views'>): DesignPicture | null {
  return body.views.front ?? null;
}

/**
 * Whether this page is a landing page: a challenge character's sheet with a front view, once the owner has opened the
 * challenge (CHALLENGE.public; owner, 2026-11-04: admin-only for now, with no open date). While it is off there is no
 * landing, no Remix button, no "Remixing opens …" line and no challenge link preview or card, for anyone.
 */
export const isLanding = (p: { kind: string; challengeCharacter: boolean; body: Pick<DesignBody, 'views'> }, pub: boolean = CHALLENGE.public) =>
  pub && p.kind === 'character' && p.challengeCharacter && landingPicture(p.body) !== null;

/** The big button: the remix form for this version while entries are open; a line in its place otherwise. */
export function landingAction(versionId: string, ph: Phase): { href: string; label: string } | { line: string } {
  if (ph === 'open') return { href: `/references/designs/new?from=${versionId}`, label: LANDING_WORDING.remix };
  return { line: ph === 'before' ? LANDING_WORDING.opensLine() : LANDING_WORDING.closedLine() };
}

/** The card's address: shape 'embed' is Farcaster's 3:2 (1200×800), 'og' the 1.91:1 link preview (1200×630). */
export const cardPath = (versionId: string, shape: 'embed' | 'og') => `/api/design-card/${versionId}${shape === 'og' ? '?shape=og' : ''}`;
export const CARD_SIZE = { embed: { width: 1200, height: 800 }, og: { width: 1200, height: 630 } } as const;

export const LANDING_WORDING = {
  remix: 'Remix',
  /** The big button's note: what pressing it does. */
  remixNote: (name: string) => `Start your own ${name} from this one: change it, make the pictures, publish.`,
  maker: (by: string) => `Made by ${by}`,
  remixOf: (by: string) => `A remix by ${by}`,
  /**
   * "Remixing opens" here (about the button); /challenge says "Entries open" (reread pack 11.2; reviewed by the
   * coordinator, approved by the owner, 2026-11-04).
   */
  opensLine: () => `Remixing opens ${dateText('opens', { time: true })}.`,
  closedLine: () => `Entries closed ${dateText('closes', { time: true })}.`,
  /**
   * For someone arriving from a post, signed out: what this is, and how to remix (one or two lines, linking /challenge).
   * Reread pack 11.1 (reviewed by the coordinator, approved by the owner, 2026-11-04): once Bluesky accounts can
   * remix, "sign in with Farcaster, press Remix, …" becomes "sign in, press Remix, change it and publish". There's no
   * switch for Bluesky remixing on main yet (signin-lens-bluesky's SIGN_IN_METHODS is unmerged), so the change ships in
   * that release, tied to its switch.
   */
  arrival: (name: string, ph: Phase) =>
    ph === 'closed'
      ? `This is a version of ${name} from Snowmoon’s remix challenge, which ran ${windowText()}.`
      : `This is a version of ${name} in Snowmoon’s remix challenge, ${windowText()}. To make your own, sign in with Farcaster, press Remix, change it and publish.`,
  arrivalLink: 'How the challenge works',
  /** The card's words, drawn in code. */
  cardTop: 'SNOWMOON · REMIX THE CAST',
  cardAi: 'AI-GENERATED PICTURE · NOT BY THE AUTHOR',
  previewTitle: (name: string, title: string) => (title.trim() ? `${name}: ${title.trim()}` : name),
  previewDescription: (name: string, by: string) => `A version of ${name} by ${by}, remixed on Snowmoon Party. AI-generated picture, not by the author.`,
  embedButton: 'Remix this', // at most 32 characters (the mini app spec)
};

/** The page's link preview: Farcaster's mini app embed, Open Graph and twitter:card. Only for a landing page. */
export function landingMetadata(p: { versionId: string; name: string; title: string; by: string }): Metadata {
  const page = `${appUrl()}/references/designs/${p.versionId}`;
  const title = LANDING_WORDING.previewTitle(p.name, p.title);
  const description = LANDING_WORDING.previewDescription(p.name, p.by);
  const og = `${appUrl()}${cardPath(p.versionId, 'og')}`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: `${appUrl()}${cardPath(p.versionId, 'embed')}`,
    button: {
      title: LANDING_WORDING.embedButton,
      // The spec lists launch_frame and view_token as the action types.
      action: { type: 'launch_frame', name: APP_NAME, url: page, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, url: page, siteName: APP_NAME, type: 'website', images: [{ url: og, ...CARD_SIZE.og, alt: `${description} The front view.` }] },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

/**
 * A hidden, unpublished or missing version: no preview picture at all, not even the site's own embed. Next merges
 * `other` key by key and leaves out a tag whose content is empty, so the root layout's fc:miniapp and fc:frame are
 * blanked here rather than dropped.
 */
export const NO_PREVIEW: Metadata = { title: 'Not found', robots: { index: false }, openGraph: null, twitter: null, other: { 'fc:miniapp': '', 'fc:frame': '' } };

/** Likes are planned for 12 November and off until then (CHALLENGE.likes); the slot renders nothing while off. */
export const likesOn = () => CHALLENGE.likes;
