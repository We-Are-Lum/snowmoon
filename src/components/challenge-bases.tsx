'use client';

import Link from 'next/link';
import { useState } from 'react';
import { designByline } from '~/lib/images/byline';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { AiTag } from './ai-tag';

/**
 * A character's row on /challenge (owner, 2026-11-04, after the restart): its one base, then the owner's first
 * remixes of it (CHALLENGE.firstRemixes, up to CHALLENGE.firstRemixesShown), side by side. A first remix that doesn't
 * exist yet is an empty slot. Tap a picture, then Remix opens its remix form (/references/designs/new?from=<version>);
 * a remix of a first remix counts, as a remix of any remix of the base does. Before the base is picked, the row starts
 * with the character's newest published sheet ("Sheet"), which can be remixed then. The form itself asks for sign-in
 * and checks who may make pictures.
 */
export type BaseTile = { kind: 'base' | 'sheet' | 'remix'; versionId: string; title: string; byName: string | null; byFid: number; thumb: string | null; style: string | null };

export function ChallengeBases({ slug, name, tiles, emptySlots }: { slug: string; name: string; tiles: BaseTile[]; emptySlots: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const tile = tiles.find((t) => t.versionId === picked) ?? null;
  const label = (t: BaseTile) => (t.kind === 'remix' ? L.firstRemixLabel : t.kind === 'base' ? t.style || L.baseLabel : L.sheetLabel);
  const see = (t: BaseTile) => (t.kind === 'remix' ? L.seeRemix : t.kind === 'base' ? L.seeBase : L.seeSheet);
  return (
    <div className="ch-bases" data-character={slug}>
      <ul className="ch-triptych" role="list">
        {tiles.map((t) => (
          <li key={t.versionId}>
            <button
              type="button"
              className="ch-tile"
              aria-pressed={picked === t.versionId}
              data-version={t.versionId}
              data-kind={t.kind}
              onClick={() => setPicked((p) => (p === t.versionId ? null : t.versionId))}
            >
              {t.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ch-tile-img" src={t.thumb} alt={L.pictureAlt(name)} width={192} height={256} loading="lazy" />
              ) : (
                <span className="ch-tile-img ch-tile-empty" aria-hidden="true" />
              )}
              <span className="ch-tile-label">{label(t)}</span>
            </button>
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`empty-${i}`}>
            <div className="ch-tile ch-slot-empty" data-kind="remix-slot">
              <span className="ch-tile-img ch-tile-empty" aria-hidden="true" />
              <span className="ch-tile-label">{L.firstRemixEmpty}</span>
            </div>
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
              {label(tile)}: {tile.title.trim() || name} · {designByline(tile.byName, tile.byFid)} ·{' '}
              <Link href={`/references/designs/${tile.versionId}`}>{see(tile)}</Link>
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
