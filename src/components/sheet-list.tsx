import Link from 'next/link';
import { byline } from '~/lib/images/byline';
import type { DesignOrder, DesignRow } from '~/lib/images/designs';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { NewSheetLink } from './design-new-link';

/**
 * Readers' sheets for one of the book's characters or places (step 4; places 2026-10-14): newest
 * first or most built on, the order named, and "+ New … sheet" for invited readers. None is official.
 */
const W = IMAGE_WORDING.designs;

export function SheetList({ href, sort, sheets, kind, slug, name }: { href: string; sort: DesignOrder; sheets: DesignRow[]; kind: 'character' | 'location'; slug: string; name: string }) {
  return (
    <>
      <div className="pictures-strip dz-strip">
        <nav className="pictures-sort" aria-label="Order">
          <Link href={href} aria-current={sort === 'new' ? 'page' : undefined}>
            {W.index.newest}
          </Link>
          <Link href={`${href}?sort=built`} aria-current={sort === 'built' ? 'page' : undefined}>
            {W.index.built}
          </Link>
        </nav>
        <NewSheetLink kind={kind} slug={slug} name={name} />
      </div>
      {sheets.length ? (
        <ul className="dz-rows" aria-label={sort === 'built' ? W.index.built : W.index.newest}>
          {sheets.map((s) => (
            <li key={s.versionId}>
              <Link href={`/images/designs/${s.versionId}`} className="dz-row">
                {s.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="dz-thumb" src={s.thumb} alt="" width={64} height={48} loading="lazy" />
                ) : (
                  <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                )}
                <span className="dz-row-text">
                  <span className="dz-row-title">{s.title || W.page.sheetBy(byline(s.byName, s.byFid))}</span>
                  <span className="dz-row-meta">{W.index.rowMeta(byline(s.byName, s.byFid), s.versionNo)}</span>
                  {s.thumb && <span className="dz-row-ai">Views: AI-generated · not by the author</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pictures-empty">{W.index.noSheets}</p>
      )}
    </>
  );
}
