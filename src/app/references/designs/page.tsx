import Link from 'next/link';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { designByline } from '~/lib/images/byline';
import { bookCharacters, listDesigns, sheetCounts, type DesignOrder } from '~/lib/images/designs';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { DesignIndex } from '~/components/design-index';
import { PicturesMenu } from '~/components/pictures-menu';
import { partsOf, placeFirstChapter, placeTitle, sheetPlaces } from '~/lib/images/sheets';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab;
  return { title: tab === 'characters' ? 'Characters' : tab === 'places' ? 'Settings' : 'Styles' };
}
export const revalidate = 60;
const W = IMAGE_WORDING.designs;

/**
 * Styles, characters and settings (step 4; Claude Design's 4-desktop index and the prototype's
 * library), chosen from Pictures' menu (owner, 2026-10-14). Styles: readers' styles, newest first or most built on, the order always
 * named. Characters: the book's characters, each with its sheets. Nothing is official or featured;
 * no pick is counted or shown here. Places (2026-10-10): the book's places as text sheets, in the
 * order the book first goes there.
 */
export default async function Designs({ searchParams }: { searchParams: Promise<{ tab?: string; sort?: string }> }) {
  const q = await searchParams;
  const tab = q.tab === 'characters' ? 'characters' : q.tab === 'places' ? 'places' : 'styles';
  const sort: DesignOrder = q.sort === 'built' ? 'built' : 'new';
  const sql = db();
  const styles = sql && tab === 'styles' ? await listDesigns(sql, 'style', sort).catch(() => []) : [];
  const counts = sql && tab !== 'styles' ? await sheetCounts(sql, tab === 'places' ? 'location' : 'character').catch(() => new Map<string, number>()) : new Map<string, number>();
  return (
    <div className="page prose pictures designs">
      <p className="label ip-crumb">
        <Link href="/references">← References</Link> · {IMAGES.label}
      </p>
      <h1>{tab === 'characters' ? W.index.tabCharacters : tab === 'places' ? W.index.tabPlaces : W.index.tabStyles}</h1>
      <p>{tab === 'places' ? W.sheets.leadPlaces : tab === 'characters' ? W.index.leadCharacters : W.index.leadStyles}</p>
      <PicturesMenu current={tab === 'places' ? 'settings' : tab} />
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
        places={sheetPlaces()
          .map((p) => ({ slug: p.slug, name: placeTitle(p.name), firstChapter: placeFirstChapter(p), scenes: new Set(partsOf(p.slug).map((s) => `${s.chapter}-${s.scene}`)).size, sheets: counts.get(placeTitle(p.name)) ?? 0 }))
          .sort((a, b) => a.firstChapter - b.firstChapter || a.name.localeCompare(b.name))}
      />
    </div>
  );
}
