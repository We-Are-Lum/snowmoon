import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { bookCharacter, characterEntity, listDesigns, type DesignOrder } from '~/lib/images/designs';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { BookQuotes } from '~/components/design-book';
import { SheetList } from '~/components/sheet-list';
import { SheetImages, Shorthand } from '~/components/design-sheets';
import { sheetCharacter } from '~/lib/images/sheets';
import { sheetImages } from '~/lib/images/sheet-images';

/**
 * One of the book's characters (step 4): what the book says (up to the chapters this reader has
 * opened), then readers' sheets for them, newest first or most built on, the order named. Readers
 * make sheets only for the book's own characters; none is official.
 */
export const revalidate = 60;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string }> };
const W = IMAGE_WORDING.designs;

export async function generateMetadata({ params }: Props) {
  const c = bookCharacter((await params).slug);
  return { title: c ? `${c.name} · sheets` : 'Not found', robots: { index: false } };
}

export default async function CharacterPage({ params, searchParams }: Props) {
  const c = bookCharacter((await params).slug);
  if (!c) notFound();
  const sort: DesignOrder = (await searchParams).sort === 'built' ? 'built' : 'new';
  const sql = db();
  const entityId = sql ? await characterEntity(sql, c).catch(() => null) : null;
  const sheets = sql && entityId ? await listDesigns(sql, 'character', sort, entityId).catch(() => []) : [];
  const href = `/images/designs/character/${c.slug}`;
  // Sheets as text (2026-10-10): the project's summary and shorthand, and the images with them in.
  const sheet = sheetCharacter(c.slug);
  const images = await sheetImages('character', c.slug, c.name);
  return (
    <div className="page prose pictures designs">
      <p className="label ip-crumb">
        <Link href="/images/designs?tab=characters">← {W.index.tabCharacters}</Link> · {IMAGES.label}
      </p>
      <>
        <h1>{c.name}</h1>
        {sheet?.about && (
          <section className="dz-about">
            <p>{sheet.about}</p>
            <p className="dz-note">{W.sheets.summaryNote}</p>
          </section>
        )}
        <BookQuotes name={c.name} quotes={c.quotes} />
        {sheet?.descriptor && <Shorthand name={c.name} descriptor={sheet.descriptor} />}
        <SheetList href={href} sort={sort} sheets={sheets} kind="character" slug={c.slug} name={c.name} />
        <SheetImages images={images} />
        <p className="dz-footer">{W.index.footer}</p>
        <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
      </>
    </div>
  );
}
