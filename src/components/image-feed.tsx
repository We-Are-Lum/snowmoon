'use client';

import Link from 'next/link';
import { IMAGE_WORDING as W } from '~/lib/images/wording';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';
import { AiLabel } from './recipe-sheet';
import { MakeImageLink } from './make-image-link';

/**
 * Moments (readers' images of passages): the order strip and list, and one moment as both this
 * list and the mixed feed (src/components/pictures-latest.tsx) show it. Nothing is covered by
 * chapter (owner, 2026-10-14: "stop hiding images from parts in the book you haven't read yet").
 * Laid out as Claude Design's feed: a labelled order strip, then the images.
 */
export type MomentItem = {
  versionId: string;
  url: string;
  chapter: number;
  where: string | null;
  /** The setting the passage is in (content/snowmoon/designs/scenes.json), with its sheet's link. */
  setting: { slug: string; name: string } | null;
  by: string;
  date: string;
  likes: number;
  alt: string;
  prompt: string;
  passage: string[];
  start: number;
  end: number;
};

export function ImageFeed({ images, sort, empty }: { images: MomentItem[]; sort: 'new' | 'liked'; empty: React.ReactNode }) {
  return (
    <>
      <div className="pictures-strip">
        <nav className="pictures-sort" aria-label="Order">
          <Link href="/images?show=moments" aria-current={sort === 'new' ? 'page' : undefined}>
            Newest first
          </Link>
          <Link href="/images?show=moments&sort=liked" aria-current={sort === 'liked' ? 'page' : undefined}>
            Most liked
          </Link>
        </nav>
      </div>
      {images.length ? (
        <ul className="pictures-list" aria-label={sort === 'liked' ? 'Most liked first' : 'Newest first'}>
          {images.map((im) => (
            <li key={im.versionId}>
              <Moment im={im} />
            </li>
          ))}
        </ul>
      ) : (
        empty
      )}
    </>
  );
}

export function Moment({ im, kind }: { im: MomentItem; kind?: string }) {
  return (
    <>
      <Link href={`/image/${im.versionId}`} className="pictures-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={im.url} alt={im.alt} width={1024} height={576} loading="lazy" />
      </Link>
      {/* The book's words the image is of, first (owner, 2026-10-10); the prompt is in the label's sheet and on its page. */}
      {im.passage.length > 0 && (
        <Link href={`/image/${im.versionId}`} className="pictures-passage">
          <blockquote>
            {im.passage.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </blockquote>
        </Link>
      )}
      {/* The same passage, into "Make an image" (shown where "Add an image" shows). Model-drafted wording. */}
      {im.passage.length > 0 && (
        <MakeImageLink className="mi-from" passage={{ chapter: im.chapter, start: im.start, end: im.end }}>
          {W.create.fromThis} →
        </MakeImageLink>
      )}
      <p className="pictures-row">
        <span>
          {kind ? `${kind} · ` : ''}Chapter {im.chapter}
          {im.where ? ` · ${im.where}` : ''} · {im.by}
        </span>
        <span className="pictures-date">{im.date}</span>
      </p>
      {im.setting && (
        <p className="pictures-setting">
          {W.feed.setting} <Link href={`/images/designs/place/${im.setting.slug}`}>{im.setting.name}</Link>
        </p>
      )}
      <p className="block-caption pictures-caption">
        <AiLabel
          kind="image"
          text={AI_LABEL.imageBy(im.by)}
          view={readerImageView({ versionId: im.versionId, by: im.by, prompt: im.prompt, chapter: im.chapter, where: im.where, date: im.date })}
        />{' '}
        · {im.likes} {im.likes === 1 ? 'like' : 'likes'}
      </p>
    </>
  );
}
