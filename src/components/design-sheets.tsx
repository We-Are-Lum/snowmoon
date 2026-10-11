'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { openedChapters } from '~/lib/chat/device';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';
import { AiLabel } from './recipe-sheet';
import { InfoLabel } from './info-label';

/**
 * Character and place sheets as text (owner, 2026-10-10): this edition's shorthand, labelled
 * "Invented ⓘ" (drafted by the coding agent), and the images of the character or place, each
 * AI-labelled, covered past the furthest chapter opened on this device as the feed does.
 */
const SH = IMAGE_WORDING.designs.sheets;

export function InventedLabel() {
  return <InfoLabel word="Invented" kind="invented" declaration={SH.inventedDeclaration} title={SH.inventedTitle} body={[...SH.inventedBody]} />;
}
export function BookLabel() {
  return <InfoLabel word="Book" kind="book" declaration={SH.bookDeclaration} title={SH.bookTitleLabel} body={[...SH.bookBody]} />;
}

export function Shorthand({ name, descriptor }: { name: string; descriptor: string }) {
  return (
    <section className="dz-shorthand" aria-label={`${SH.shorthandTitle}: ${name}`} data-shorthand="invented" data-drafted="claude-coding-agent">
      <p className="dz-label">
        {SH.shorthandTitle} <InventedLabel />
      </p>
      <p className="dz-shorthand-text">{descriptor}</p>
      <p className="dz-note">{SH.shorthandNote}</p>
    </section>
  );
}

export type SheetImage = {
  key: string;
  href: string;
  url: string;
  alt: string;
  chapter: number;
  where: string | null;
  /** A reader's: their byline and prompt. The edition's: its recipe file and item. */
  reader: { versionId: string; by: string; prompt: string; date: string } | null;
  recipe: { file: string; item: string } | null;
};

export function SheetImages({ images }: { images: SheetImage[] }) {
  const [furthest, setFurthest] = useState<number | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  return (
    <section className="dz-images" aria-label={SH.images}>
      <p className="dz-label">{SH.images}</p>
      {furthest !== null && <p className="dz-note">{IMAGE_WORDING.feed.covered(furthest)}</p>}
      {images.length ? (
        <ul className="dz-image-list">
          {images.map((im) => {
            const covered = (furthest === null || im.chapter > furthest) && !shown.has(im.key);
            return (
              <li key={im.key}>
                {covered ? (
                  <div className="pictures-cover">
                    <p>{SH.coveredImage(im.chapter)}</p>
                    <button type="button" className="pictures-show" onClick={() => setShown(new Set(shown).add(im.key))}>
                      {IMAGE_WORDING.designs.index.showAnyway}
                    </button>
                  </div>
                ) : (
                  <Link href={im.href} className="pictures-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={im.alt} width={1024} height={576} loading="lazy" />
                  </Link>
                )}
                <p className="block-caption dz-image-caption">
                  Chapter {im.chapter}
                  {im.where && !covered ? ` · ${im.where}` : ''} ·{' '}
                  {im.reader ? (
                    <AiLabel
                      kind="image"
                      text={AI_LABEL.imageBy(im.reader.by)}
                      view={readerImageView({ versionId: im.reader.versionId, by: im.reader.by, prompt: covered ? undefined : im.reader.prompt, chapter: im.chapter, where: covered ? null : im.where, date: im.reader.date })}
                    />
                  ) : (
                    <AiLabel kind="image" text={AI_LABEL.image} file={im.recipe!.file} item={im.recipe!.item} />
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dz-note">{SH.noImages}</p>
      )}
      <p className="dz-note">{SH.imagesNote}</p>
    </section>
  );
}

/** Where a place appears: its scenes from the chapters opened on this device; later ones only counted. */
export function Appears({ rows }: { rows: { key: string; chapter: number; href: string; text: string }[] }) {
  const [furthest, setFurthest] = useState<number | null>(null);
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  const shown = furthest === null ? [] : rows.filter((r) => r.chapter <= furthest);
  const later = furthest === null ? 0 : rows.length - shown.length;
  return (
    <section className="dz-appears" aria-label={SH.appears}>
      <p className="dz-label">{SH.appears}</p>
      {shown.length > 0 && (
        <ul>
          {shown.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="dz-ref">
                {r.text} →
              </Link>
            </li>
          ))}
        </ul>
      )}
      {later > 0 && <p className="dz-note">{SH.appearsLater(later)}</p>}
      <p className="dz-note">{SH.appearsNote}</p>
    </section>
  );
}
