import Link from 'next/link';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { Moment, type MomentItem } from './image-feed';
import { AiTag } from './ai-tag';

/**
 * Pictures' front page (owner, 2026-10-14: "the feed shows updates in all of them"): the newest
 * moments, character sheets and styles in one list, newest first, each named by what it is. A
 * setting has no images of its own; each moment names the setting its passage is in. A sheet's or a style's
 * sample is AI-generated, not by the author, and says so.
 */
const W = IMAGE_WORDING.feed;

export type DesignItem = { versionId: string; kind: 'character' | 'location' | 'style'; title: string; entity: string; meta: string; date: string; thumb: string | null };
export type LatestItem = { type: 'moment'; at: string; moment: MomentItem } | { type: 'design'; at: string; design: DesignItem };

export function PicturesLatest({ items, empty }: { items: LatestItem[]; empty: React.ReactNode }) {
  return (
    <>
      <div className="pictures-strip">
        <p className="dz-order">{W.latest}</p>
      </div>
      {items.length ? (
        <ul className="pictures-list" aria-label={W.latest}>
          {items.map((it) =>
            it.type === 'moment' ? (
              <li key={it.moment.versionId}>
                <Moment im={it.moment} kind={W.kind.moment} />
              </li>
            ) : (
              <li key={it.design.versionId}>
                <Link href={`/images/designs/${it.design.versionId}`} className="pictures-design">
                  {it.design.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.design.thumb} alt="" width={1024} height={576} loading="lazy" />
                  ) : (
                    <span className="pictures-design-text">{it.design.title}</span>
                  )}
                </Link>
                <p className="pictures-row">
                  <span>
                    {it.design.kind === 'character' ? `${W.kind.character} · ${it.design.entity}` : it.design.kind === 'location' ? `${W.kind.place} · ${it.design.entity}` : W.kind.style} · {it.design.title}
                  </span>
                  <span className="pictures-date">{it.design.date}</span>
                </p>
                <p className="pictures-caption pictures-design-meta">
                  {it.design.thumb && (
                    <>
                      <AiTag what={it.design.kind === 'style' ? 'Sample' : 'Views'} />{' '}
                    </>
                  )}
                  {it.design.meta}
                </p>
              </li>
            ),
          )}
        </ul>
      ) : (
        empty
      )}
    </>
  );
}
