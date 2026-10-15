import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { APP_NAME, appUrl } from '~/lib/config';
import { glossarySlugs, glossaryTerm } from '~/lib/glossary';
import { PAPER } from '~/lib/tokens';
import { GlossaryTerm } from '~/components/glossary';
import '../glossary.css';

type Props = { params: Promise<{ term: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return glossarySlugs().map((term) => ({ term }));
}
// The word itself stays out of the tab title: it may be from a chapter the reader hasn't reached.
// A shared link names it (the sharer chose the word): its card (src/app/api/glossary-card) and a
// Farcaster embed that opens this page.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = glossaryTerm((await params).term);
  if (!t) return { title: 'Glossary' };
  const url = `${appUrl()}/glossary/${t.slug}`;
  const image = `${appUrl()}/api/glossary-card/${t.slug}`;
  const title = `${t.term} · Snowmoon glossary`;
  const description = `Chapter ${t.firstSentence.chapter}: ${t.firstSentence.text}`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: image,
    button: {
      title: 'Open in the glossary',
      action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  return {
    title: 'Glossary',
    openGraph: { title, description, url, images: [{ url: image, width: 1200, height: 800 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export default async function GlossaryTermPage({ params }: Props) {
  const t = glossaryTerm((await params).term);
  if (!t) notFound();
  return <GlossaryTerm t={t} />;
}
