import Link from 'next/link';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { designByline } from '~/lib/images/byline';
import { bookCharacters, listDesigns, sheetCounts, type DesignOrder } from '~/lib/images/designs';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { DesignIndex } from '~/components/design-index';

export const metadata = { title: 'Styles & characters' };
export const revalidate = 60;
const W = IMAGE_WORDING.designs;

/**
 * Styles and character sheets (step 4; Claude Design's 4-desktop index and the prototype's
 * library). Two tabs. Styles: readers' styles, newest first or most built on, the order always
 * named. Characters: the book's characters, each with its sheets. Nothing is official or featured;
 * no pick is counted or shown here. Places are "coming", as text.
 */
export default async function Designs({ searchParams }: { searchParams: Promise<{ tab?: string; sort?: string }> }) {
  const q = await searchParams;
  const tab = q.tab === 'characters' ? 'characters' : 'styles';
  const sort: DesignOrder = q.sort === 'built' ? 'built' : 'new';
  const sql = db();
  const styles = sql && tab === 'styles' ? await listDesigns(sql, 'style', sort).catch(() => []) : [];
  const counts = sql && tab === 'characters' ? await sheetCounts(sql).catch(() => new Map<string, number>()) : new Map<string, number>();
  return (
    <div className="page prose pictures designs">
      <p className="label ip-crumb">
        <Link href="/images">← Pictures</Link> · {IMAGES.label}
      </p>
      <h1>{W.index.title}</h1>
      <p>{W.index.lead}</p>
      <DesignIndex
        tab={tab}
        sort={sort}
        styles={styles.map((s) => ({
          versionId: s.versionId,
          elementId: s.elementId,
          entityId: s.entityId,
          title: s.title || s.entity,
          meta: W.index.rowMeta(designByline(s.byName, s.byFid, s.byRole), s.versionNo),
          drafted: Boolean(s.assist),
          thumb: s.thumb,
        }))}
        characters={bookCharacters().map((c) => ({ slug: c.slug, name: c.name, firstChapter: c.firstChapter, sheets: counts.get(c.name) ?? 0 }))}
      />
    </div>
  );
}
