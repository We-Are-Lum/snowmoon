import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { APP_NAME } from '~/lib/config';
import { CHALLENGE_PATH, challengeText, decChallenge, splitChallenge } from '~/lib/minpentai/snap/challenge';
import { verified } from '~/lib/minpentai/snap/state';
import { PAPER } from '~/lib/tokens';
import { MinpentaiApp } from '../../minpentai-app';

/**
 * A Minpentai challenge link (owner, 2026-10-22; src/lib/minpentai/snap/challenge.ts). A Farcaster
 * client that asks for a snap is sent to the snap (next.config.ts) and plays it in the feed; a browser
 * gets this page: Play, started at the challenge's start (minpentai-app.tsx), and a preview card of
 * the result for X and other link previews. Nothing is stored and nothing ranks. Not indexed.
 */
type Props = { params: Promise<{ seg: string }> };

async function read(seg: string) {
  const x = splitChallenge(seg);
  const c = x && verified(x.body, x.sig) ? decChallenge(x.body) : null;
  return c && { c, seg: `${x!.body}.${x!.sig}` };
}

/** This deployment's own address, so a preview's cards point at the preview. */
async function base() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${h.get('x-forwarded-proto')?.split(',')[0] ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await read((await params).seg);
  if (!r) return { title: 'Minpentai', robots: { index: false } };
  const b = await base();
  const url = `${b}${CHALLENGE_PATH}${r.seg}`;
  const card = `${b}/api/minpentai-challenge-card?c=${encodeURIComponent(r.seg)}`;
  const title = 'A Minpentai challenge';
  const description = challengeText(r.c);
  const embed = JSON.stringify({
    version: '1',
    imageUrl: `${card}&shape=embed`,
    button: {
      title: 'Accept the challenge',
      action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${b}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, url, images: [{ url: card, width: 1200, height: 630, alt: description }] },
    twitter: { card: 'summary_large_image', title, description, images: [card] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export default async function MinpentaiChallengePage({ params }: Props) {
  if (!(await read((await params).seg))) notFound();
  return (
    <div className="page minpentai">
      <MinpentaiApp />
    </div>
  );
}
