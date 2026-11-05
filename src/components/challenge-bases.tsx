'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { designByline } from '~/lib/images/byline';
import { shuffleFresh } from '~/lib/challenge/shuffle';
import { AiTag } from './ai-tag';

/**
 * A character on /challenge (owner, 2026-11-04): its bases in a row, then, under the heading "First remixes by
 * @naaate", the owner's first remixes of it (CHALLENGE.firstRemixes, up to CHALLENGE.firstRemixesShown); a first remix
 * that doesn't exist yet is an empty slot. Tap a picture, then Remix opens its remix form
 * (/references/designs/new?from=<version>); a remix of a first remix counts, as a remix of any remix of a base does.
 * Before the bases are picked, the row holds the character's newest published sheet ("Sheet"), which can be remixed.
 * The form itself asks for sign-in and checks who may make pictures.
 *
 * A character with several bases (Deluin and Gladias: three) shows them in a fresh, unweighted random order on each
 * visit (shuffleFresh on the whole list of bases, P5g), so no look reads as the default; until the shuffle runs, empty
 * frames. The first remixes are not entries: no badge, no count, no label on each picture.
 *
 * No challenge words live in this file (it is in scripts everyone is served): they all come in `w`, from the server's
 * view (src/lib/challenge/view.ts).
 */
export type BaseTile = { kind: 'base' | 'sheet' | 'remix'; versionId: string; title: string; byName: string | null; byFid: number; thumb: string | null; style: string | null };
export type BaseWords = { baseLabel: string; sheetLabel: string; firstRemixEmpty: string; pickFirst: string; remix: string; seeBase: string; seeSheet: string; seeRemix: string; pictureAlt: string };

function Tile({ t, picked, onPick, label, alt }: { t: BaseTile; picked: boolean; onPick: () => void; label: string | null; alt: string }) {
  return (
    <li>
      <button type="button" className="ch-tile" aria-pressed={picked} data-version={t.versionId} data-kind={t.kind} onClick={onPick}>
        {t.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ch-tile-img" src={t.thumb} alt={alt} width={192} height={256} loading="lazy" />
        ) : (
          <span className="ch-tile-img ch-tile-empty" aria-hidden="true" />
        )}
        {label && <span className="ch-tile-label">{label}</span>}
      </button>
    </li>
  );
}

export function ChallengeBases({ slug, name, bases, firsts, emptySlots, firstsHead, w }: { slug: string; name: string; bases: BaseTile[]; firsts: BaseTile[]; emptySlots: number; firstsHead: string; w: BaseWords }) {
  const [picked, setPicked] = useState<string | null>(null);
  // One base needs no shuffle; several are shuffled afresh in this browser on each visit.
  const [order, setOrder] = useState<BaseTile[] | null>(bases.length > 1 ? null : bases);
  useEffect(() => {
    setOrder(bases.length > 1 ? shuffleFresh(bases) : bases);
  }, [bases]);
  const all = [...bases, ...firsts];
  const tile = all.find((t) => t.versionId === picked) ?? null;
  const label = (t: BaseTile) => (t.kind === 'remix' ? null : t.kind === 'base' ? t.style || w.baseLabel : w.sheetLabel);
  const see = (t: BaseTile) => (t.kind === 'remix' ? w.seeRemix : t.kind === 'base' ? w.seeBase : w.seeSheet);
  const pick = (id: string) => () => setPicked((p) => (p === id ? null : id));
  return (
    <div className="ch-bases" data-character={slug}>
      {order ? (
        <ul className="ch-triptych ch-base-row" role="list" data-shuffled={bases.length > 1 ? 'true' : undefined}>
          {order.map((t) => (
            <Tile key={t.versionId} t={t} picked={picked === t.versionId} onPick={pick(t.versionId)} label={label(t)} alt={w.pictureAlt} />
          ))}
        </ul>
      ) : (
        <ul className="ch-triptych ch-base-row" role="list" aria-hidden="true">
          {bases.map((t) => (
            <li key={t.versionId}>
              <div className="ch-tile">
                <span className="ch-tile-img ch-tile-empty" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {(firsts.length > 0 || emptySlots > 0) && (
        <>
          <h3 className="ch-firsts-head">{firstsHead}</h3>
          <ul className="ch-triptych ch-firsts" role="list">
            {firsts.map((t) => (
              <Tile key={t.versionId} t={t} picked={picked === t.versionId} onPick={pick(t.versionId)} label={null} alt={w.pictureAlt} />
            ))}
            {Array.from({ length: emptySlots }, (_, i) => (
              <li key={`empty-${i}`}>
                <div className="ch-tile ch-slot-empty" data-kind="remix-slot">
                  <span className="ch-tile-img ch-tile-empty" aria-hidden="true" />
                  <span className="ch-tile-label">{w.firstRemixEmpty}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {all.some((t) => t.thumb) && (
        <p className="ch-bases-ai">
          <AiTag what="Views" />
        </p>
      )}
      <div className="ch-bases-act" aria-live="polite">
        {tile ? (
          <>
            <Link className="ic-primary ch-remix" href={`/references/designs/new?from=${tile.versionId}`}>
              {w.remix}
            </Link>
            <p className="dz-meta ch-picked">
              {label(tile) ? `${label(tile)}: ` : ''}
              {tile.title.trim() || name} · {designByline(tile.byName, tile.byFid)} · <Link href={`/references/designs/${tile.versionId}`}>{see(tile)}</Link>
            </p>
          </>
        ) : (
          <button type="button" className="ic-primary ch-remix" disabled>
            {w.pickFirst}
          </button>
        )}
      </div>
    </div>
  );
}
