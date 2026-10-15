'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';
import { HOME_TEXT as H } from '~/lib/home';
import { AiLabel } from './recipe-sheet';

/**
 * "Just made": readers' published images, newest first, from the same query as /images (feed(),
 * src/lib/images/data.ts), each with the same AI label. Only what exists: images (Design's sample also
 * had styles, character sheets and planning threads, which this edition does not have yet). Nothing is
 * covered by chapter (owner, 2026-10-14). The time is served as a date and shown as "n min ago" once loaded.
 */
export type HomeFeedItem = { versionId: string; url: string; chapter: number; where: string | null; by: string; at: string; alt: string; prompt: string };

function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return iso.slice(0, 10);
}

export function HomeFeed({ items, unavailable }: { items: HomeFeedItem[]; unavailable: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  return (
    <section className="home-card home-feed" aria-labelledby="home-feed-head">
      <div className="home-card-head">
        <h2 id="home-feed-head">
          <span className="home-dot" aria-hidden="true" />
          {H.feed.head}
        </h2>
      </div>
      {items.length ? (
        <ul className="home-feed-list" aria-label="Newest first">
          {items.map((im) => {
            const date = im.at.slice(0, 10);
            return (
              <li key={im.versionId}>
                <Link href={`/image/${im.versionId}`} className="home-feed-thumb" aria-label={im.alt}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" width={64} height={64} loading="lazy" />
                </Link>
                <div className="home-feed-body">
                  <span className="home-feed-what">
                    Chapter {im.chapter}
                    {im.where ? ` · ${im.where}` : ''}
                  </span>
                  <p className="block-caption home-feed-caption">
                    <AiLabel
                      kind="image"
                      text={AI_LABEL.imageBy(im.by)}
                      view={readerImageView({ versionId: im.versionId, by: im.by, prompt: im.prompt, chapter: im.chapter, where: im.where, date })}
                    />
                  </p>
                </div>
                <time className="home-feed-ago" dateTime={im.at}>
                  {now === null ? date : ago(im.at, now)}
                </time>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="home-feed-empty">{unavailable ? H.feed.unavailable : H.feed.empty}</p>
      )}
      <Link href="/images" className="home-more">
        {H.feed.all}
      </Link>
    </section>
  );
}
