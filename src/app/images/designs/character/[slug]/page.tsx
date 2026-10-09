import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { byline } from '~/lib/images/byline';
import { bookCharacter, characterEntity, listDesigns, type DesignOrder } from '~/lib/images/designs';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { BookQuotes, CharacterGate } from '~/components/design-book';
import { NewSheetLink } from '~/components/design-new-link';

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
  return (
    <div className="page prose pictures designs">
      <p className="label ip-crumb">
        <Link href="/images/designs?tab=characters">← {W.index.title}</Link> · {IMAGES.label}
      </p>
      <CharacterGate firstChapter={c.firstChapter}>
        <h1>{c.name}</h1>
        <BookQuotes name={c.name} quotes={c.quotes} />
        <div className="pictures-strip dz-strip">
          <nav className="pictures-sort" aria-label="Order">
            <Link href={href} aria-current={sort === 'new' ? 'page' : undefined}>
              {W.index.newest}
            </Link>
            <Link href={`${href}?sort=built`} aria-current={sort === 'built' ? 'page' : undefined}>
              {W.index.built}
            </Link>
          </nav>
          <NewSheetLink slug={c.slug} name={c.name} />
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
                    <span className="dz-row-meta">{W.index.rowMeta(byline(s.byName, s.byFid), s.versionNo, s.builtOn)}</span>
                    {s.thumb && <span className="dz-row-ai">Views: AI-generated · not by the author</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pictures-empty">{W.index.noSheets}</p>
        )}
        <p className="dz-footer">{W.index.footer}</p>
        <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
      </CharacterGate>
    </div>
  );
}
