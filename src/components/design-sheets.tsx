'use client';

import Link from 'next/link';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';
import { AiLabel } from './recipe-sheet';
import { InfoLabel } from './info-label';
import { RedoneCredit } from './redone-credit';
import type { Redone } from '~/lib/chapter-pictures/view';

/**
 * Character and place sheets as text (owner, 2026-10-10): this edition's shorthand, labelled
 * "Invented ⓘ" (drafted by the coding agent), and the images of the character or place, each
 * AI-labelled. The book's words about them come from the whole book (owner, 2026-11-17: principle 9 retired).
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
  /** This edition's picture, redone by an admin and kept: the redo shows, with who, when and the model. */
  redone?: Redone;
};

/** Not covered by chapter (owner, 2026-10-14: "stop hiding images from parts in the book you haven't read yet"). */
/** A sheet image's caption: where it is in the book, and its AI label (a reader's, or this edition's seeded image). */
export function SheetImageCaption({ im }: { im: SheetImage }) {
  return (
    <p className="block-caption dz-image-caption">
      Chapter {im.chapter}
      {im.where ? ` · ${im.where}` : ''} ·{' '}
      {im.reader ? (
        <AiLabel
          kind="image"
          text={AI_LABEL.imageBy(im.reader.by)}
          view={readerImageView({ versionId: im.reader.versionId, by: im.reader.by, prompt: im.reader.prompt, chapter: im.chapter, where: im.where, date: im.reader.date })}
        />
      ) : im.redone ? (
        <>
          <AiLabel kind="image" text={AI_LABEL.image} view={im.redone.view} />
          <RedoneCredit redone={im.redone} />
        </>
      ) : (
        <AiLabel kind="image" text={AI_LABEL.image} file={im.recipe!.file} item={im.recipe!.item} />
      )}
    </p>
  );
}

export function SheetImages({ images }: { images: SheetImage[] }) {
  return (
    <section className="dz-images" aria-label={SH.images}>
      <p className="dz-label">{SH.images}</p>
      {images.length ? (
        <ul className="dz-image-list">
          {images.map((im) => {
            return (
              <li key={im.key}>
                <Link href={im.href} className="pictures-image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={im.alt} width={1024} height={576} loading="lazy" />
                </Link>
                <SheetImageCaption im={im} />
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

/** Where a place appears: all its scenes, from the whole book (until 2026-11-17 only chapters opened on this device). */
export function Appears({ rows }: { rows: { key: string; chapter: number; href: string; text: string }[] }) {
  const shown = rows;
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
      <p className="dz-note">{SH.appearsNote}</p>
    </section>
  );
}
