'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { openedChapters } from '~/lib/chat/device';
import { blockHref } from '~/lib/glossary-view';
import type { ReferenceCard } from '~/lib/references';
import { SheetImageCaption } from './design-sheets';

/**
 * The References glossary (owner, 2026-10-29): one card per glossary term with images. Spoilers as the glossary does
 * them: a term first met after the furthest chapter opened on this device is covered until the reader asks.
 * Model-drafted wording (coding agent, 2026-10-29), for the owner.
 */
export function ReferenceCards({ cards }: { cards: ReferenceCard[] }) {
  const [furthest, setFurthest] = useState(1);
  const [all, setAll] = useState(false);
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  const shown = cards.filter((c) => all || c.chapter <= furthest);
  const hidden = cards.length - shown.length;
  return (
    <>
      <ul className="ref-cards">
        {shown.map((c) => (
          <li key={c.slug} className="ref-card" data-term={c.slug}>
            <h2 className="ref-term">
              <Link href={`/glossary/${c.slug}`}>{c.term}</Link>
            </h2>
            <blockquote className="ref-first">
              {c.firstSentence.text} <Link href={blockHref(c.firstSentence.block)}>{c.firstSentence.block}</Link>
            </blockquote>
            <ul className="ref-images">
              {c.images.map((im) => (
                <li key={im.key}>
                  <Link href={im.href} className="pictures-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={im.alt} width={1024} height={576} loading="lazy" />
                  </Link>
                  <SheetImageCaption im={im} />
                </li>
              ))}
            </ul>
            <p className="ref-more">
              {c.sheets.map((s, i) => (
                <span key={s.href}>
                  {i ? ' · ' : ''}
                  <Link href={s.href}>{c.total > c.images.length && i === 0 ? `All ${c.total} on ${s.name}'s sheet →` : `${s.name}'s sheet →`}</Link>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <div className="gl-cover">
          <p>
            {hidden} more {hidden === 1 ? 'term first appears' : 'terms first appear'} after Chapter {furthest}, past where you&apos;ve read.
          </p>
          <button type="button" className="pictures-show" onClick={() => setAll(true)}>
            Show them anyway
          </button>
        </div>
      )}
    </>
  );
}
