import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { listDesigns, placeEntity, type DesignOrder } from '~/lib/images/designs';
import { SheetList } from '~/components/sheet-list';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { labelRange } from '~/lib/reading';
import { partsOf, placeFirstChapter, placeTitle, sheetPlace } from '~/lib/images/sheets';
import { sheetImages } from '~/lib/images/sheet-images';
import { BookQuotes } from '~/components/design-book';
import { Appears, SheetImages, Shorthand } from '~/components/design-sheets';

/**
 * One of the book's places (sheets as text, owner 2026-10-10), mirroring a character's page: the
 * summary, what the book says (its own words, each linked to its block), this edition's shorthand
 * (invented, drafted by the coding agent), the scenes it is in (content/snowmoon/designs/scenes.json)
 * and the images of it. Readers' place sheets (2026-10-14), as a character's: views made in one of
 * the published styles, offered when they make an image.
 */
export const revalidate = 60;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string }> };
const W = IMAGE_WORDING.designs;
const SH = W.sheets;

export async function generateMetadata({ params }: Props) {
  const p = sheetPlace((await params).slug);
  return { title: p ? `${placeTitle(p.name)} · place` : 'Not found', robots: { index: false } };
}

export default async function PlacePage({ params, searchParams }: Props) {
  const p = sheetPlace((await params).slug);
  if (!p) notFound();
  const sort: DesignOrder = (await searchParams).sort === 'built' ? 'built' : 'new';
  const sql = db();
  const entityId = sql ? await placeEntity(sql, placeTitle(p.name)).catch(() => null) : null;
  const sheets = sql && entityId ? await listDesigns(sql, 'location', sort, entityId).catch(() => []) : [];
  const parts = partsOf(p.slug);
  const images = await sheetImages('place', p.slug, p.name);
  const first = placeFirstChapter(p);
  return (
    <div className="page prose pictures designs">
      <p className="label ip-crumb">
        <Link href="/images/designs?tab=places">← {W.index.tabPlaces}</Link> · {IMAGES.label}
      </p>
      <>
        <h1>{placeTitle(p.name)}</h1>
        {p.about && (
          <section className="dz-about">
            <p>{p.about}</p>
            <p className="dz-note">{SH.summaryNote}</p>
          </section>
        )}
        <BookQuotes name={p.name} quotes={p.facts} />
        {p.descriptor && <Shorthand name={p.name} descriptor={p.descriptor} />}
        <Appears
          rows={parts.map((s) => ({
            key: `${s.chapter}-${s.start}`,
            chapter: s.chapter,
            href: `/chapter/${s.chapter}#c${s.chapter}-b${s.start}`,
            text: SH.appearsRow(s.chapter, s.scene, s.from !== null && s.to !== null ? labelRange(s.from, s.to) : ''),
          }))}
        />
        <SheetList href={`/images/designs/place/${p.slug}`} sort={sort} sheets={sheets} kind="location" slug={p.slug} name={placeTitle(p.name)} />
        <SheetImages images={images} />
        <p className="dz-footer">{W.index.footer}</p>
        <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
      </>
    </div>
  );
}
