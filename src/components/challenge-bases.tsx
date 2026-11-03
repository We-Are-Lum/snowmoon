'use client';

import Link from 'next/link';
import { useState } from 'react';
import { designByline } from '~/lib/images/byline';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { AiTag } from './ai-tag';

/**
 * A character's bases as a triptych on /challenge (owner, 2026-11-04): up to three tiles side by side, in the order
 * the server gives (the bases' fixed style order, CHALLENGE.baseStyles), each captioned with its style. Tap one, then
 * Remix opens that base's remix form (/references/designs/new?from=<version>). Before the bases are picked, the same
 * row shows up to three of the character's published sheets, newest first, as "Sheet 1, 2, 3"; any of them can be
 * remixed then. The form itself asks for sign-in and checks who may make pictures.
 */
export type BaseTile = { versionId: string; title: string; byName: string | null; byFid: number; thumb: string | null; style: string | null };

export function ChallengeBases({ slug, name, tiles, bases }: { slug: string; name: string; tiles: BaseTile[]; bases: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const tile = tiles.find((t) => t.versionId === picked) ?? null;
  const label = (t: BaseTile, i: number) => t.style || (bases ? L.baseLabel(i + 1) : L.sheetLabel(i + 1));
  return (
    <div className="ch-bases" data-character={slug}>
      <ul className="ch-triptych" role="list">
        {tiles.map((t, i) => (
          <li key={t.versionId}>
            <button
              type="button"
              className="ch-tile"
              aria-pressed={picked === t.versionId}
              data-version={t.versionId}
              onClick={() => setPicked((p) => (p === t.versionId ? null : t.versionId))}
            >
              {t.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ch-tile-img" src={t.thumb} alt={L.pictureAlt(name)} width={192} height={256} loading="lazy" />
              ) : (
                <span className="ch-tile-img ch-tile-empty" aria-hidden="true" />
              )}
              <span className="ch-tile-label">{label(t, i)}</span>
            </button>
          </li>
        ))}
      </ul>
      {tiles.some((t) => t.thumb) && (
        <p className="ch-bases-ai">
          <AiTag what="Views" />
        </p>
      )}
      <div className="ch-bases-act" aria-live="polite">
        {tile ? (
          <>
            <Link className="ic-primary ch-remix" href={`/references/designs/new?from=${tile.versionId}`}>
              {L.remix}
            </Link>
            <p className="dz-meta ch-picked">
              {label(tile, tiles.indexOf(tile))}: {tile.title.trim() || name} · {designByline(tile.byName, tile.byFid)} ·{' '}
              <Link href={`/references/designs/${tile.versionId}`}>{bases ? L.seeBase : L.seeSheet}</Link>
            </p>
          </>
        ) : (
          <button type="button" className="ic-primary ch-remix" disabled>
            {L.pickFirst}
          </button>
        )}
      </div>
    </div>
  );
}
