import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { byline } from '~/lib/images/byline';
import { wordDiff } from '~/lib/images/design-rules';
import { bookCharacters, designByVersion, imagesBuiltOn, listDesigns, picturesOf } from '~/lib/images/designs';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { BookQuotes, CharacterGate } from '~/components/design-book';
import { DesignBar } from '~/components/design-bar';

/**
 * A style or a character sheet (step 4; Claude Design 4a, 5a and 4-desktop): its name, version and
 * maker, the credit it carries if it was remixed (for good), its pictures (AI-generated, not by
 * the author), its text in full with the words it changed shaded, how many published images built
 * on it, its versions, and how each picture was made. A sheet starts with what the book says, up
 * to the chapters this reader has opened. Readable signed out; picks, forks and reports need sign-in.
 */
export const revalidate = 60;
type Props = { params: Promise<{ id: string }> };
const W = IMAGE_WORDING.designs;
const day = (iso: string) => iso.slice(0, 10);
/** "v3 · 2026-10-04 · 2 built on": on a phone only "v3" shows, as Design's row of versions; the rest from 768px. */
const versionRow = (h: { versionNo: number; createdAt: string; builtOn: number }) => {
  const full = W.page.versionRow(h.versionNo, day(h.createdAt), h.builtOn);
  const short = `v${h.versionNo}`;
  return (
    <>
      {short}
      <span className="dz-v-more">{full.slice(short.length)}</span>
    </>
  );
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const sql = db();
  const d = sql ? await designByVersion(sql, id).catch(() => null) : null;
  if (!d) return { title: 'Not found' };
  return { title: d.kind === 'style' ? `${d.shown.body.title || d.entity} · style` : `${d.entity} · sheet`, robots: { index: false } };
}

export default async function DesignPage({ params }: Props) {
  const { id } = await params;
  const sql = db();
  const d = sql ? await designByVersion(sql, id).catch(() => null) : null;
  if (!d || !sql) notFound();
  const body = d.shown.body;
  const by = byline(d.byName, d.byFid);
  const style = d.kind === 'style';
  const character = style ? null : (bookCharacters().find((c) => c.name === d.entity) ?? null);
  const callName = character ? character.name.split(' ').find((w) => !/^(Lord|General|Senator)$/.test(w)) ?? character.name : d.entity;
  // A fork shades the words it changed from the version it was remixed from ("the page shows the difference").
  const sourceText = d.remixedFrom ? ((await designByVersion(sql, d.remixedFrom.versionId).catch(() => null))?.shown.body.text ?? null) : null;
  const parts = sourceText !== null ? wordDiff(sourceText, body.text) : [{ text: body.text, changed: false }];
  const built = await imagesBuiltOn(sql, d.elementId).catch(() => []);
  const others = await listDesigns(sql, d.kind, 'new', style ? undefined : d.entityId).catch(() => []);
  const pictures = style ? body.samples : (['front', 'side', 'back'] as const).map((k) => body.views[k]).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const crumb = style ? { href: '/images/designs', label: W.index.title } : { href: `/images/designs/character/${character?.slug ?? ''}`, label: d.entity };
  const title = style ? body.title || d.entity : body.title || W.page.sheetBy(by);

  const main = (
    <article className="dz-main">
      {character && <BookQuotes name={character.name} quotes={character.quotes} />}
      <h1 className="dz-title">{title}</h1>
      <p className="dz-meta">
        {W.page.meta(d.shown.versionNo, d.history.length, by, day(d.shown.createdAt))}
        {!style && ` · ${d.entity}`}
      </p>
      {d.remixedFrom && (
        <p className="dz-meta dz-remix">
          <span className="dz-muted">{W.page.remixedFrom}</span>{' '}
          <Link href={`/images/designs/${d.remixedFrom.versionId}`}>
            {d.remixedFrom.title || d.remixedFrom.entity} v{d.remixedFrom.versionNo} · {byline(d.remixedFrom.byName, d.remixedFrom.byFid)} →
          </Link>
        </p>
      )}
      {body.assist && <p className="dz-meta dz-drafted">{W.page.drafted}</p>}
      {pictures.length ? (
        <figure className={`dz-pictures${style ? '' : ' is-views'}`}>
          <div className="dz-grid">
            {pictures.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.sha256} src={p.url} alt={`AI-generated ${style ? 'sample' : (['front', 'side', 'back'] as const).filter((k) => body.views[k])[i] + ' view'}, not by the author`} width={p.recipe.width} height={p.recipe.height} loading="lazy" />
            ))}
          </div>
          <figcaption className="dz-caption">{style ? W.page.samplesCaption : W.page.viewsCaption}</figcaption>
        </figure>
      ) : (
        <p className="dz-meta dz-muted">{W.page.noPictures}</p>
      )}
      <section className="dz-section dz-text-section">
        <div className="dz-text-col">
          <p className="dz-label">{style ? W.page.styleText : W.page.sheetText(callName)}</p>
          <p className="dz-text">
            {parts.map((p, i) => (p.changed ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
          </p>
          {sourceText !== null && parts.some((p) => p.changed) && <p className="dz-note">{W.page.changedFrom(d.remixedFrom!.versionNo)}</p>}
        </div>
        <div className="dz-versions">
          <p className="dz-label">{W.page.versions}</p>
          <ul>
            {d.history.map((h) => (
              <li key={h.versionId}>
                {h.versionId === d.shown.versionId ? (
                  <span aria-current="page">{versionRow(h)}</span>
                ) : (
                  <Link href={`/images/designs/${h.versionId}`}>{versionRow(h)}</Link>
                )}
              </li>
            ))}
          </ul>
          <p className="dz-note">{W.page.oldVersions}</p>
        </div>
      </section>
      <section className="dz-section">
        <p className="dz-label dz-built">{W.page.builtOn(d.builtOn)}</p>
        {built.length > 0 && (
          <details className="dz-details">
            <summary>{W.page.seeThem}</summary>
            <ul className="dz-built-list">
              {built.map((b) => (
                <li key={b.versionId}>
                  <Link href={`/image/${b.versionId}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.url} alt="AI-generated image, not by the author" width={1024} height={576} loading="lazy" />
                  </Link>
                  <span className="dz-caption">Chapter {b.chapter} · AI-generated image · not by the author</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {pictures.length > 0 && (
        <details className="dz-details dz-section">
          <summary>{W.page.howMade}</summary>
          <dl className="recipe-list ip-recipe">
            {picturesOf(body).map((p, i) => (
              <div key={p.sha256} className="dz-recipe">
                <dt className="ip-wide">{W.page.pictureRecipe(i + 1)}</dt>
                <dd className="ip-wide">
                  <pre className="recipe-prompt">{p.recipe.prompt}</pre>
                </dd>
                <dd className="ip-wide">
                  {p.recipe.model === IMAGES.editModel.id ? IMAGES.editModel.name : IMAGES.model.name} ({p.recipe.model}), open weights, Apache-2.0, on {p.recipe.host}, endpoint{' '}
                  <span className="recipe-mono">{p.recipe.endpoint}</span>. Seed {p.recipe.seed ?? 'not recorded'}, request {p.recipe.request_id ?? 'not recorded'}, cost ${p.recipe.cost_usd.toFixed(4)},{' '}
                  {p.recipe.made_at.slice(0, 10)}. {p.recipe.references?.length ? 'Made from the front view. ' : ''}Checked by gpt-oss-safeguard-20b and the host&apos;s safety checker. The fixed
                  subject line was drafted by the coding agent. File sha256 <span className="recipe-mono">{p.sha256}</span>.
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <DesignBar
        versionId={d.shown.versionId}
        versionNo={d.shown.versionNo}
        elementId={d.elementId}
        entityId={d.entityId}
        kind={d.kind}
        name={callName}
        byFid={d.byFid}
      />
      <p className="as-draft ic-draftline">{IMAGE_WORDING.draftLine}</p>
    </article>
  );

  return (
    <div className="page prose dz-page">
      <p className="label ip-crumb">
        <Link href={crumb.href}>← {crumb.label}</Link> · {IMAGES.label}
      </p>
      <div className="dz-split">
        <nav className="dz-aside" aria-label={style ? W.index.tabStyles : d.entity}>
          <p className="dz-label">{style ? W.index.tabStyles : d.entity} · {W.index.newest}</p>
          <ul className="dz-rows">
            {others.map((o) => (
              <li key={o.versionId}>
                <Link href={`/images/designs/${o.versionId}`} className="dz-row" aria-current={o.elementId === d.elementId ? 'page' : undefined}>
                  {o.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="dz-thumb" src={o.thumb} alt="" width={64} height={48} loading="lazy" />
                  ) : (
                    <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                  )}
                  <span className="dz-row-text">
                    <span className="dz-row-title">{o.title || (style ? o.entity : W.page.sheetBy(byline(o.byName, o.byFid)))}</span>
                    <span className="dz-row-meta">{W.index.rowMeta(byline(o.byName, o.byFid), o.versionNo, o.builtOn)}</span>
                    {o.thumb && <span className="dz-row-ai">{style ? 'Sample' : 'Views'}: AI-generated · not by the author</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {character ? <CharacterGate firstChapter={character.firstChapter}>{main}</CharacterGate> : main}
      </div>
    </div>
  );
}
