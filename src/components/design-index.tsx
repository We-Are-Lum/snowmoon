'use client';

import Link from 'next/link';
import { useCanMakeDesigns } from '~/lib/images/can-add';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { useMyPicks } from './design-picks';
import { AiTag } from './ai-tag';

/**
 * Styles, characters or settings (step 4; Pictures' menu above it chooses which): the order named, rows. Your own picks are marked
 * "○ Your pick" for you alone, read from your own picks; nobody sees anyone else's, or a count.
 * Nothing is covered by chapter (owner, 2026-10-14).
 */
const W = IMAGE_WORDING.designs;
type StyleRow = { versionId: string; elementId: string; entityId: string; title: string; meta: string; drafted: boolean; thumb: string | null };
type CharacterRow = { slug: string; name: string; firstChapter: number; sheets: number };
type PlaceRow = { slug: string; name: string; firstChapter: number; scenes: number; sheets: number };

export function DesignIndex({ tab, sort, styles, characters, places }: { tab: 'styles' | 'characters' | 'places'; sort: 'new' | 'built'; styles: StyleRow[]; characters: CharacterRow[]; places: PlaceRow[] }) {
  const canMake = useCanMakeDesigns();
  const picks = useMyPicks();
  const pickedElements = new Set((picks ?? []).map((p) => p.elementId));
  const pickedNames = new Set((picks ?? []).filter((p) => p.kind === 'character').map((p) => p.entity));
  return (
    <>
      {tab === 'styles' ? (
        <>
          <div className="pictures-strip dz-strip">
            <nav className="pictures-sort" aria-label="Order">
              <Link href="/references/designs" aria-current={sort === 'new' ? 'page' : undefined}>
                {W.index.newest}
              </Link>
              <Link href="/references/designs?sort=built" aria-current={sort === 'built' ? 'page' : undefined}>
                {W.index.built}
              </Link>
            </nav>
            {canMake && (
              <Link className="dz-new" href="/references/designs/new?kind=style">
                {W.index.newStyle}
              </Link>
            )}
          </div>
          {styles.length ? (
            <ul className="dz-rows" aria-label={sort === 'built' ? W.index.built : W.index.newest}>
              {styles.map((s) => (
                <li key={s.versionId}>
                  <Link href={`/references/designs/${s.versionId}`} className="dz-row">
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="dz-thumb" src={s.thumb} alt="" width={64} height={48} loading="lazy" />
                    ) : (
                      <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                    )}
                    <span className="dz-row-text">
                      <span className="dz-row-title">{s.title}</span>
                      <span className="dz-row-meta">{s.meta}</span>
                      {s.thumb && <span className="dz-row-ai"><AiTag what="Sample" /></span>}
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
      ) : tab === 'places' ? (
        <>
          <div className="pictures-strip dz-strip">
            <p className="dz-order">{W.sheets.placesOrder}</p>
          </div>
          <ul className="dz-rows" aria-label={W.sheets.placesOrder}>
            {places.map((p) => (
              <li key={p.slug}>
                <Link href={`/references/designs/place/${p.slug}`} className="dz-row">
                  <span className="dz-row-text">
                    <span className="dz-row-title">{p.name}</span>
                    <span className="dz-row-meta">{W.sheets.scenes(p.scenes)} · {W.index.sheets(p.sheets)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="pictures-strip dz-strip">
            <p className="dz-order">{W.index.bookOrder}</p>
          </div>
          <ul className="dz-rows" aria-label={W.index.bookOrder}>
            {characters.map((c) => (
              <li key={c.slug}>
                <Link href={`/references/designs/character/${c.slug}`} className="dz-row">
                  <span className="dz-row-text">
                    <span className="dz-row-title">{c.name}</span>
                    <span className="dz-row-meta">{W.index.sheets(c.sheets)}</span>
                    {pickedNames.has(c.name) && <span className="dz-row-pick">{W.index.yourPick}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="dz-footer">{W.index.footer}</p>
      {canMake && (
        <p className="dz-links">
          <Link href="/references/picks">{W.index.myPicksLink}</Link>
        </p>
      )}
      <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
    </>
  );
}
