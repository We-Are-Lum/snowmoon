'use client';

import Link from 'next/link';
import { blockHref } from '~/lib/glossary-view';
import type { ReferenceCard } from '~/lib/references';
import { SheetImageCaption } from './design-sheets';

/**
 * The References glossary (owner, 2026-10-29): one card per glossary term with images, every term shown (spoilers no
 * longer matter anywhere on the site: owner, 2026-11-17, principle 9 retired; until then later terms were covered).
 * Model-drafted wording (coding agent, 2026-10-29), for the owner.
 */
export function ReferenceCards({ cards }: { cards: ReferenceCard[] }) {
  return (
    <>
      <ul className="ref-cards">
        {cards.map((c) => (
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
    </>
  );
}
