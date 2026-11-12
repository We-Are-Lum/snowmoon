'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { designByline } from '~/lib/images/byline';
import { shuffleFresh } from '~/lib/challenge/shuffle';
import { AiTag } from './ai-tag';

/**
 * One character on /challenge, a row of the plain scrolling list (owner, 2026-11-08, the simpler challenge), and the
 * bases row it shares with the character's page (src/components/challenge-character.tsx).
 *
 * - The name, a link to the character's page; the row outside a picture opens it too (the name's link covers the row,
 *   and the pictures sit above it).
 * - The approved one line (src/lib/challenge/cards.ts, `line`, verbatim), marked "This edition's summary".
 * - The bases: a character's several bases in a fresh random order on each visit (the P5g shuffle, on the character's
 *   whole list of bases), so none reads as the default, with "AI ⓘ" saying the look is this edition's own.
 *   Tapping a base opens its remix screen (`href`, from the server). Picture links aren't prefetched: on a page with
 *   many pictures, prefetching every remix screen queued requests on a small database (owner, 2026-11-08).
 *
 * No challenge words live in this file (it is in scripts everyone is served): they all come in `w` and the card's
 * data, from the server's view (src/lib/challenge/view.ts).
 */
export type CardTile = { versionId: string; thumb: string | null; title: string; byName: string | null; byFid: number; href: string; label: string | null };
export type CardWords = {
  bases: string;
  remixes: string;
  summary: string;
  look: string;
  alt: string;
  tapToRemix: string;
  /** "No remixes of {name} yet." */
  none: string;
};
export type CardData = {
  slug: string;
  name: string;
  /** The character's page. */
  href: string;
  draft: string | null;
  line: string;
  bases: CardTile[];
  note: string | null;
};
export type CharacterData = CardData & { remixes: CardTile[] };

/** `picture`: the challenge's pictures (16:9), shown whole at their own shape (owner, 2026-11-07); bases are sheets (3:4). */
export function Row({ tiles, alt, label, lazy = false, picture = false }: { tiles: CardTile[]; alt: string; label: string; lazy?: boolean; picture?: boolean }) {
  return (
    <ul className={picture ? 'cc-row cc-row-pics' : 'cc-row'} role="list" aria-label={label}>
      {tiles.map((t) => (
        <li key={t.versionId}>
          <Link className="cc-tile" href={t.href} data-version={t.versionId} prefetch={false}>
            {t.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={picture ? 'cc-tile-img cc-tile-pic' : 'cc-tile-img'} src={t.thumb} alt={alt} width={picture ? 256 : 192} height={picture ? 144 : 256} loading={lazy ? 'lazy' : undefined} />
            ) : (
              <span className={picture ? 'cc-tile-img cc-tile-pic cc-empty' : 'cc-tile-img cc-empty'} aria-hidden="true" />
            )}
            <span className="cc-tile-by">{t.label ?? designByline(t.byName, t.byFid)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A character's bases, shuffled afresh in this browser on each visit; until then, empty slots with no order shown. */
export function Bases({ c, w }: { c: CardData; w: CardWords }) {
  const [bases, setBases] = useState<CardTile[] | null>(c.bases.length > 1 ? null : c.bases);
  useEffect(() => {
    setBases(c.bases.length > 1 ? shuffleFresh(c.bases) : c.bases);
  }, [c.bases]);
  if (!c.bases.length) return null;
  return (
    <div className="cc-bases">
      {bases ? (
        <Row tiles={bases} alt={w.alt} label={w.bases} />
      ) : (
        <ul className="cc-row" role="list" aria-hidden="true">
          {c.bases.map((t) => (
            <li key={t.versionId}>
              <span className="cc-tile">
                <span className="cc-tile-img cc-empty" />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="cc-ai">
        <AiTag note={w.look} />
      </p>
    </div>
  );
}

/** The character's one line, marked as this edition's summary. */
export function CardLine({ c, w }: { c: CardData; w: CardWords }) {
  return (
    <p className="cc-line">
      {c.line} <span className="cc-mark">{w.summary}</span>
      {c.draft && <span className="as-draft cc-draft"> · {c.draft}</span>}
    </p>
  );
}

export function ChallengeCard({ c, w }: { c: CardData; w: CardWords }) {
  return (
    <section className="cc-card cc-card-row" aria-labelledby={`cc-${c.slug}`} data-character={c.slug} id={c.slug}>
      <h2 id={`cc-${c.slug}`} className="cc-name">
        <Link href={c.href} className="cc-name-link" prefetch={false}>
          {c.name}
        </Link>
      </h2>
      <CardLine c={c} w={w} />
      {c.note && <p className="dz-muted cc-note">{c.note}</p>}
      <Bases c={c} w={w} />
    </section>
  );
}

/**
 * A character's tile on /challenge (the redesign, owner 2026-11-11: "a fresh random base on each visit"): one of its
 * bases, drawn afresh in this browser on each visit with the challenge's one uniform shuffle (P5g's allowed draw, as the
 * bases row already shuffles). A character with one base shows it at once; with several, an empty slot until the draw,
 * so the server's order is never shown.
 */
export function TileBase({ c, alt }: { c: Pick<CardData, 'bases'>; alt: string }) {
  const [pick, setPick] = useState<CardTile | null>(c.bases.length === 1 ? c.bases[0] : null);
  useEffect(() => {
    setPick(c.bases.length > 1 ? shuffleFresh(c.bases)[0] : (c.bases[0] ?? null));
  }, [c.bases]);
  if (!pick?.thumb) return <span className="chh-img cc-empty" aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="chh-img" src={pick.thumb} alt={alt} width={576} height={768} data-version={pick.versionId} />;
}
