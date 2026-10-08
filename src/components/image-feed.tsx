'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { openedChapters } from '~/lib/chat/device';

/** The feed's list. Images from a chapter past the furthest one opened on this device are covered until shown. */
type Item = { versionId: string; url: string; chapter: number; where: string | null; by: string; likes: number; alt: string };

export function ImageFeed({ images, sort }: { images: Item[]; sort: 'new' | 'liked' }) {
  const [furthest, setFurthest] = useState<number | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  return (
    <ul className="pictures-list" aria-label={sort === 'liked' ? 'Most liked first' : 'Newest first'}>
      {images.map((im) => {
        const ahead = furthest === null || im.chapter > furthest;
        const covered = ahead && !shown.has(im.versionId);
        return (
          <li key={im.versionId}>
            {covered ? (
              <div className="pictures-cover">
                <p>From chapter {im.chapter}, past where you&apos;ve read.</p>
                <button type="button" className="ia-quiet" onClick={() => setShown(new Set(shown).add(im.versionId))}>
                  Show it anyway
                </button>
              </div>
            ) : (
              <Link href={`/image/${im.versionId}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.alt} width={1024} height={576} loading="lazy" />
              </Link>
            )}
            <p className="block-caption">
              Chapter {im.chapter}
              {im.where ? ` · ${im.where}` : ''} · AI-generated image · by {im.by} · not by the author · {im.likes} {im.likes === 1 ? 'like' : 'likes'} ·{' '}
              <Link href={`/image/${im.versionId}`}>recipe</Link>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
