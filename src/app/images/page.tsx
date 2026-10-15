import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { feed, type ReaderImage } from '~/lib/images/data';
import { listDesigns } from '~/lib/images/designs';
import { passageLabel, passageText } from '~/lib/images/passage';
import { inPassage, placeTitle } from '~/lib/images/sheets';
import { ImageFeed, type MomentItem } from '~/components/image-feed';
import { PicturesLatest, type LatestItem } from '~/components/pictures-latest';
import { PicturesMenu } from '~/components/pictures-menu';
import { MakeImageLink } from '~/components/make-image-link';
import { byline, designByline } from '~/lib/images/byline';
import { IMAGE_WORDING as W } from '~/lib/images/wording';

export const metadata = { title: 'Pictures' };
export const revalidate = 60;

/** How many items the front page shows, across all kinds. */
const LATEST = 60;

function moment(im: ReaderImage): MomentItem {
  const place = inPassage(im.chapter, im.start, im.end).place;
  return {
    versionId: im.versionId,
    url: im.url,
    chapter: im.chapter,
    where: passageLabel(im.chapter, im.start, im.end),
    setting: place ? { slug: place.slug, name: placeTitle(place.name) } : null,
    by: byline(im.byName, im.byFid),
    date: im.createdAt.slice(0, 10),
    likes: im.likes,
    alt: `AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`,
    prompt: im.userPrompt,
    passage: passageText(im.chapter, im.start, im.end),
    start: im.start,
    end: im.end,
  };
}

/**
 * Pictures (owner, 2026-10-08; menu and mixed feed 2026-10-14). The front page: the four choices
 * (moments, characters, settings, styles), then the newest of all of them in one list. Moments
 * (?show=moments): readers' images of passages, newest first, with "most liked" as a labelled
 * alternative. Nothing is official or featured; the order says what it is. Nothing is covered by
 * chapter (owner, 2026-10-14).
 */
export default async function Pictures({ searchParams }: { searchParams: Promise<{ show?: string; sort?: string }> }) {
  const q = await searchParams;
  const moments = q.show === 'moments' || q.sort === 'liked';
  const sort = q.sort === 'liked' ? 'liked' : 'new';
  const sql = db();
  const images = sql ? await feed(sql, sort, LATEST).catch(() => []) : [];
  const empty = <p className="pictures-empty">Nothing is published here yet.</p>;
  let latest: LatestItem[] = [];
  if (!moments && sql) {
    const [characters, styles] = await Promise.all([listDesigns(sql, 'character').catch(() => []), listDesigns(sql, 'style').catch(() => [])]);
    latest = [
      ...images.map((im): LatestItem => ({ type: 'moment', at: im.createdAt, moment: moment(im) })),
      ...[...characters, ...styles].map((d): LatestItem => ({
        type: 'design',
        at: d.updatedAt,
        design: { versionId: d.versionId, kind: d.kind, title: d.title || d.entity, entity: d.entity, meta: W.designs.index.rowMeta(designByline(d.byName, d.byFid, d.byRole), d.versionNo), date: d.updatedAt.slice(0, 10), thumb: d.thumb },
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, LATEST);
  }
  return (
    <div className="page prose pictures">
      <p className="label pictures-label">{IMAGES.label}</p>
      <h1>{moments ? W.feed.menu[0].label : 'Pictures'}</h1>
      <p>
        {moments ? W.feed.momentsLead : 'Images readers made for the book with an image model: moments from its passages, its characters, its settings, and styles to build on.'}{' '}
        Each one is AI-generated, not by the author; its page shows the exact prompt that made it.
      </p>
      <PicturesMenu current={moments ? 'moments' : null} />
      {/* Choose the text, then the prompt (owner, 2026-10-10); shown where "Add an image" shows. Model-drafted wording. */}
      <MakeImageLink className="ic-primary mi-entry">{W.create.entry}</MakeImageLink>
      {moments ? <ImageFeed sort={sort} empty={empty} images={images.map(moment)} /> : <PicturesLatest items={latest} empty={empty} />}
      <p className="as-draft ic-draftline">{W.draftLine}</p>
    </div>
  );
}
