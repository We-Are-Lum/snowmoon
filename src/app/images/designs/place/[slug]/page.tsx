import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { labelRange } from '~/lib/reading';
import { partsOf, placeFirstChapter, placeTitle, sheetPlace } from '~/lib/images/sheets';
import { sheetImages } from '~/lib/images/sheet-images';
import { BookQuotes, CharacterGate } from '~/components/design-book';
import { Appears, SheetImages, Shorthand } from '~/components/design-sheets';

/**
 * One of the book's places (sheets as text, owner 2026-10-10), mirroring a character's page: the
 * summary, what the book says (its own words, each linked to its block), this edition's shorthand
 * (invented, drafted by the coding agent), the scenes it is in (content/snowmoon/designs/scenes.json)
 * and the images of it. Covered past where the reader has got to, from the first chapter it is in.
 */
export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };
const W = IMAGE_WORDING.designs;
const SH = W.sheets;

export async function generateMetadata({ params }: Props) {
  const p = sheetPlace((await params).slug);
  return { title: p ? `${placeTitle(p.name)} · place` : 'Not found', robots: { index: false } };
}

export default async function PlacePage({ params }: Props) {
  const p = sheetPlace((await params).slug);
  if (!p) notFound();
  const parts = partsOf(p.slug);
  const images = await sheetImages('place', p.slug, p.name);
  const first = placeFirstChapter(p);
  return (
    <div className="page prose pictures designs">
      <p className="label ip-crumb">
        <Link href="/images/designs?tab=places">← {W.index.title}</Link> · {IMAGES.label}
      </p>
      <CharacterGate firstChapter={first} covered={SH.coveredPlace(first)}>
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
        <SheetImages images={images} />
        <p className="dz-footer">{W.index.footer}</p>
        <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
      </CharacterGate>
    </div>
  );
}
