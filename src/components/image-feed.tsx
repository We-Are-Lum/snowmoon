'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { openedChapters } from '~/lib/chat/device';
import { IMAGE_WORDING as W } from '~/lib/images/wording';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';
import { AiLabel } from './recipe-sheet';
import { MakeImageLink } from './make-image-link';

/**
 * The feed's order strip and list. Images from a chapter past the furthest one opened on this
 * device are covered until shown; a covered image's caption gives the chapter only, never the
 * paragraph. Laid out as Claude Design's feed: a labelled order strip, then the images.
 */
type Item = { versionId: string; url: string; chapter: number; where: string | null; by: string; date: string; likes: number; alt: string; prompt: string; passage: string[]; start: number; end: number };

export function ImageFeed({ images, sort, empty }: { images: Item[]; sort: 'new' | 'liked'; empty: React.ReactNode }) {
  const [furthest, setFurthest] = useState<number | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  return (
    <>
      <div className="pictures-strip">
        <nav className="pictures-sort" aria-label="Order">
          <Link href="/images" aria-current={sort === 'new' ? 'page' : undefined}>
            Newest first
          </Link>
          <Link href="/images?sort=liked" aria-current={sort === 'liked' ? 'page' : undefined}>
            Most liked
          </Link>
        </nav>
        {furthest !== null && <span className="pictures-covered">{W.feed.covered(furthest)}</span>}
      </div>
      {images.length ? (
        <ul className="pictures-list" aria-label={sort === 'liked' ? 'Most liked first' : 'Newest first'}>
          {images.map((im) => {
            const ahead = furthest === null || im.chapter > furthest;
            const covered = ahead && !shown.has(im.versionId);
            return (
              <li key={im.versionId}>
                {covered ? (
                  <div className="pictures-cover">
                    <p>From chapter {im.chapter}, past where you&apos;ve read.</p>
                    <button type="button" className="pictures-show" onClick={() => setShown(new Set(shown).add(im.versionId))}>
                      Show it anyway
                    </button>
                  </div>
                ) : (
                  <Link href={`/image/${im.versionId}`} className="pictures-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={im.alt} width={1024} height={576} loading="lazy" />
                  </Link>
                )}
                {/* The book's words the image is of, first (owner, 2026-10-10); the prompt is in the label's sheet and on its page. */}
                {!covered && im.passage.length > 0 && (
                  <Link href={`/image/${im.versionId}`} className="pictures-passage">
                    <blockquote>
                      {im.passage.map((t, i) => (
                        <p key={i}>{t}</p>
                      ))}
                    </blockquote>
                  </Link>
                )}
                {/* The same passage, into "Make an image" (shown where "Add an image" shows). Model-drafted wording. */}
                {!covered && im.passage.length > 0 && (
                  <MakeImageLink className="mi-from" passage={{ chapter: im.chapter, start: im.start, end: im.end }}>
                    {W.create.fromThis} →
                  </MakeImageLink>
                )}
                <p className="pictures-row">
                  <span>
                    Chapter {im.chapter}
                    {im.where && !covered ? ` · ${im.where}` : ''} · {im.by}
                  </span>
                  <span className="pictures-date">{im.date}</span>
                </p>
                <p className="block-caption pictures-caption">
                  <AiLabel
                    kind="image"
                    text={AI_LABEL.imageBy(im.by)}
                    view={readerImageView({ versionId: im.versionId, by: im.by, prompt: covered ? undefined : im.prompt, chapter: im.chapter, where: covered ? null : im.where, date: im.date })}
                  />{' '}
                  · {im.likes} {im.likes === 1 ? 'like' : 'likes'}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        empty
      )}
    </>
  );
}
