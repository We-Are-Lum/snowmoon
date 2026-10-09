'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { openedChapters } from '~/lib/chat/device';
import { useCanAddImage } from '~/lib/images/can-add';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { useMyPicks } from './design-picks';

/**
 * The styles and characters index (step 4): tabs, the order named, rows. Your own picks are marked
 * "○ Your pick" for you alone, read from your own picks; nobody sees anyone else's, or a count.
 * A character first met past the furthest chapter opened on this device is covered until shown.
 */
const W = IMAGE_WORDING.designs;
type StyleRow = { versionId: string; elementId: string; entityId: string; title: string; meta: string; drafted: boolean; thumb: string | null };
type CharacterRow = { slug: string; name: string; firstChapter: number; sheets: number };

export function DesignIndex({ tab, sort, styles, characters }: { tab: 'styles' | 'characters'; sort: 'new' | 'built'; styles: StyleRow[]; characters: CharacterRow[] }) {
  const canAdd = useCanAddImage();
  const picks = useMyPicks();
  const [furthest, setFurthest] = useState<number | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  const pickedElements = new Set((picks ?? []).map((p) => p.elementId));
  const pickedNames = new Set((picks ?? []).filter((p) => p.kind === 'character').map((p) => p.entity));
  return (
    <>
      <nav className="dz-tabs" aria-label="Styles or characters">
        <Link href="/images/designs" aria-current={tab === 'styles' ? 'page' : undefined}>
          {W.index.tabStyles}
        </Link>
        <Link href="/images/designs?tab=characters" aria-current={tab === 'characters' ? 'page' : undefined}>
          {W.index.tabCharacters}
        </Link>
        <span className="dz-tab-coming">{W.index.tabPlaces}</span>
      </nav>
      {tab === 'styles' ? (
        <>
          <div className="pictures-strip dz-strip">
            <nav className="pictures-sort" aria-label="Order">
              <Link href="/images/designs" aria-current={sort === 'new' ? 'page' : undefined}>
                {W.index.newest}
              </Link>
              <Link href="/images/designs?sort=built" aria-current={sort === 'built' ? 'page' : undefined}>
                {W.index.built}
              </Link>
            </nav>
            {canAdd && (
              <Link className="dz-new" href="/images/designs/new?kind=style">
                {W.index.newStyle}
              </Link>
            )}
          </div>
          {styles.length ? (
            <ul className="dz-rows" aria-label={sort === 'built' ? W.index.built : W.index.newest}>
              {styles.map((s) => (
                <li key={s.versionId}>
                  <Link href={`/images/designs/${s.versionId}`} className="dz-row">
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="dz-thumb" src={s.thumb} alt="" width={64} height={48} loading="lazy" />
                    ) : (
                      <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                    )}
                    <span className="dz-row-text">
                      <span className="dz-row-title">{s.title}</span>
                      <span className="dz-row-meta">{s.meta}</span>
                      {s.thumb && <span className="dz-row-ai">Sample: AI-generated · not by the author</span>}
                      {s.drafted && <span className="dz-row-ai">{W.index.drafted}</span>}
                      {pickedElements.has(s.elementId) && <span className="dz-row-pick">{W.index.yourPick}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pictures-empty">{W.index.noStyles}</p>
          )}
        </>
      ) : (
        <>
          <div className="pictures-strip dz-strip">
            <p className="dz-order">{W.index.bookOrder}</p>
          </div>
          <ul className="dz-rows" aria-label={W.index.bookOrder}>
            {characters.map((c) => {
              const covered = (furthest === null || c.firstChapter > furthest) && !shown.has(c.slug);
              return (
                <li key={c.slug}>
                  {covered ? (
                    <div className="dz-row dz-covered">
                      <span className="dz-row-text">
                        <span className="dz-row-meta">{W.index.coveredRow(c.firstChapter)}</span>
                      </span>
                      <button type="button" className="dz-show" onClick={() => setShown(new Set(shown).add(c.slug))}>
                        {W.index.showAnyway}
                      </button>
                    </div>
                  ) : (
                    <Link href={`/images/designs/character/${c.slug}`} className="dz-row">
                      <span className="dz-row-text">
                        <span className="dz-row-title">{c.name}</span>
                        <span className="dz-row-meta">{W.index.sheets(c.sheets)}</span>
                        {pickedNames.has(c.name) && <span className="dz-row-pick">{W.index.yourPick}</span>}
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="dz-footer">{W.index.footer}</p>
      {canAdd && (
        <p className="dz-links">
          <Link href="/images/picks">{W.index.myPicksLink}</Link>
        </p>
      )}
      <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
    </>
  );
}
