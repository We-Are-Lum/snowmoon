import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { feed } from '~/lib/images/data';
import { passageLabel } from '~/lib/images/passage';
import { ImageFeed } from '~/components/image-feed';
import { byline } from '~/lib/images/byline';
import { IMAGE_WORDING as W } from '~/lib/images/wording';

export const metadata = { title: 'Pictures' };
export const revalidate = 60;

/**
 * Readers' published images (owner, 2026-10-08): newest first, with "most liked" as a labelled
 * alternative. Nothing is official or featured; the order says what it is. Images from chapters
 * past the furthest one a reader has opened stay covered until they choose to see them.
 */
export default async function Pictures({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sort = (await searchParams).sort === 'liked' ? 'liked' : 'new';
  const sql = db();
  const images = sql ? await feed(sql, sort).catch(() => []) : [];
  return (
    <div className="page prose pictures">
      <p className="label pictures-label">{IMAGES.label}</p>
      <h1>Pictures</h1>
      <p>
        Images readers made for passages of the book, with an image model. Each one is AI-generated, not by the author, and shows
        the exact prompt that made it.
      </p>
      <ImageFeed
        sort={sort}
        empty={<p className="pictures-empty">Nothing is published here yet.</p>}
        images={images.map((im) => ({
          versionId: im.versionId,
          url: im.url,
          chapter: im.chapter,
          where: passageLabel(im.chapter, im.start, im.end),
          by: byline(im.byName, im.byFid),
          date: im.createdAt.slice(0, 10),
          likes: im.likes,
          alt: `AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`,
          prompt: im.userPrompt,
        }))}
      />
      <p className="as-draft ic-draftline">{W.draftLine}</p>
    </div>
  );
}
