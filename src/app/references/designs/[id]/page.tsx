import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { byline, designByline } from '~/lib/images/byline';
import { wordDiff } from '~/lib/images/design-rules';
import { bookCharacters, designByVersion, imagesBuiltOn, listDesigns, picturesOf } from '~/lib/images/designs';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { howMade } from '~/lib/images/recipe-lines';
import { placeTitle, sheetPlaces } from '~/lib/images/sheets';
import { BookQuotes } from '~/components/design-book';
import { DesignBar } from '~/components/design-bar';
import { AiTag } from '~/components/ai-tag';
import { CHALLENGE } from '~/lib/config';
import { versionStanding } from '~/lib/challenge/entries';
import { phase } from '~/lib/challenge/rules';
import { challengeSheetsOpen, isChallengeCharacter } from '~/lib/challenge/open-sheets';
import { postsFor } from '~/lib/challenge/posts';
import { CHALLENGE_WORDING as CW } from '~/lib/challenge/wording';
import { ChallengeShare } from '~/components/challenge-share';
import { ChallengeMark } from '~/components/challenge-mark';
import { PostedOn } from '~/components/posted-on';
import { ChallengeRemixLanding } from '~/components/challenge-remix-landing';
import { NO_PREVIEW, isLanding, landingMetadata, landingPicture } from '~/lib/challenge/landing';
import type { Metadata } from 'next';

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

/** A sheet's call name: "Gladias" for General Gladias. */
const callNameOf = (name: string) => name.split(' ').find((w) => !/^(Lord|General|Senator)$/.test(w)) ?? name;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const sql = db();
  const d = sql ? await designByVersion(sql, id).catch(() => null) : null;
  // A hidden or unpublished version (designByVersion reads published designs only) gives no preview picture at all.
  if (!d) return NO_PREVIEW;
  // A challenge character's sheet is a landing page (owner, 2026-11-04): its front view in the link preview.
  if (isLanding({ kind: d.kind, challengeCharacter: isChallengeCharacter(d.entity), body: d.shown.body })) {
    const character = bookCharacters().find((c) => c.name === d.entity);
    return landingMetadata({ versionId: d.shown.versionId, name: callNameOf(character?.name ?? d.entity), title: d.shown.body.title, by: designByline(d.byName, d.byFid, d.byRole) });
  }
  return { title: d.kind === 'style' ? `${d.shown.body.title || d.entity} · style` : `${d.entity} · sheet`, robots: { index: false } };
}

export default async function DesignPage({ params }: Props) {
  const { id } = await params;
  const sql = db();
  const d = sql ? await designByVersion(sql, id).catch(() => null) : null;
  if (!d || !sql) notFound();
  const body = d.shown.body;
  const by = designByline(d.byName, d.byFid, d.byRole);
  const style = d.kind === 'style';
  const character = style ? null : (bookCharacters().find((c) => c.name === d.entity) ?? null);
  const callName = character ? callNameOf(character.name) : d.entity;
  // A fork shades the words it changed from the version it was remixed from ("the page shows the difference").
  const rf = d.remixedFrom && !d.remixedFrom.hidden ? d.remixedFrom : null;
  const sourceText = rf ? ((await designByVersion(sql, rf.versionId).catch(() => null))?.shown.body.text ?? null) : null;
  const parts = sourceText !== null ? wordDiff(sourceText, body.text) : [{ text: body.text, changed: false }];
  const built = await imagesBuiltOn(sql, d.elementId).catch(() => []);
  const others = await listDesigns(sql, d.kind, 'new', style ? undefined : d.entityId).catch(() => []);
  const pictures = style ? body.samples : (['front', 'side', 'back'] as const).map((k) => body.views[k]).filter((p): p is NonNullable<typeof p> => Boolean(p));
  // A place sheet (2026-10-14) goes back to its place's page.
  const place = d.kind === 'location' ? (sheetPlaces().find((x) => placeTitle(x.name) === d.entity) ?? null) : null;
  const crumb = style ? { href: '/references/designs', label: W.index.tabStyles } : place ? { href: `/references/designs/place/${place.slug}`, label: d.entity } : { href: `/references/designs/character/${character?.slug ?? ''}`, label: d.entity };
  const title = style ? body.title || d.entity : body.title || W.page.sheetBy(by);
  // The remix challenge (owner, 2026-10-31): each part only while its switch is on (CHALLENGE.entries, CHALLENGE.posts).
  const standing = await versionStanding(sql, d.shown.versionId).catch(() => null);
  const posts = CHALLENGE.posts ? await postsFor(sql, d.shown.versionId).catch(() => []) : [];
  const challengeOpen = d.kind === 'character' && challengeSheetsOpen() && isChallengeCharacter(d.entity);
  // A landing page for someone arriving from a post (owner, 2026-11-04): a challenge character's sheet with a front view.
  const landing = isLanding({ kind: d.kind, challengeCharacter: isChallengeCharacter(d.entity), body });
  const postItems = posts.map(({ id, network, handle, at, url }) => ({ id, network, handle, at, url }));

  const main = (
    <article className="dz-main">
      {landing && (
        <ChallengeRemixLanding versionId={d.shown.versionId} name={callName} title={body.title} by={by} remix={Boolean(d.remixedFrom)} front={landingPicture(body)!} phase={challengeOpen ? 'open' : phase() === 'closed' ? 'closed' : 'before'} posts={postItems} />
      )}
      {character && <BookQuotes name={character.name} quotes={character.quotes} />}
      <h1 className="dz-title">{title}</h1>
      <p className="dz-meta">
        {W.page.meta(d.shown.versionNo, d.history.length, by, day(d.shown.createdAt))}
        {!style && ` · ${d.entity}`}
      </p>
      {d.remixedFrom && (
        <p className="dz-meta dz-remix">
          <span className="dz-muted">{W.page.remixedFrom}</span>{' '}
          {rf ? (
            <Link href={`/references/designs/${rf.versionId}`}>
              {rf.title || rf.entity} v{rf.versionNo} · {designByline(rf.byName, rf.byFid, rf.byRole)} →
            </Link>
          ) : (
            <span className="dz-muted">{W.page.remixedHidden}</span>
          )}
        </p>
      )}
      {body.assist && <p className="dz-meta dz-drafted">{style ? W.page.drafted : W.page.draftedSheet}</p>}
      {standing?.kind === 'entry' && (
        <p className="dz-meta ch-standing">
          <span className="ch-badge">{CW.badge}</span> {CW.badgeNote(callName)} <Link href="/challenge">{CW.title} →</Link>
        </p>
      )}
      {standing?.kind === 'candidate' &&
        // After the close a mark is refused, so no button is offered (launch rehearsal, 2026-11-02).
        (phase() === 'open' ? (
          <div className="dz-meta ch-standing">
            <p className="dz-muted">{CW.candidateNote}</p>
            <ChallengeMark versionId={d.shown.versionId} byFid={d.byFid} />
          </div>
        ) : (
          <p className="dz-meta ch-standing dz-muted">{CW.candidateClosedNote(callName)}</p>
        ))}
      {standing?.kind === 'admin' && <p className="dz-meta ch-standing dz-muted">{CW.adminNote}</p>}
      {challengeOpen && !standing && (
        <p className="dz-meta ch-standing ch-invite">
          {CW.sheetInvite(callName)} <Link href="/challenge">{CW.title} →</Link>
        </p>
      )}
      {pictures.length ? (
        <figure className={`dz-pictures${style ? '' : ' is-views'}`}>
          <div className="dz-grid">
            {pictures.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.sha256} src={p.url} alt={`AI-generated ${style ? 'sample' : (['front', 'side', 'back'] as const).filter((k) => body.views[k])[i] + ' view'}, not by the author`} width={p.recipe.width} height={p.recipe.height} loading="lazy" data-zoom="" tabIndex={0} />
            ))}
          </div>
          <figcaption className="dz-caption">
            {style ? W.page.samplesCaption : place ? W.page.placeViewsCaption : W.page.viewsCaption} <AiTag />
          </figcaption>
          {/* The style a sheet's views were made in (owner, 2026-10-14); its text is in each view's recipe. */}
          {!style && body.style && (
            <p className="dz-meta">
              <Link href={`/references/designs/${body.style.version_id}`}>{W.page.madeInStyle(body.style.title)}</Link>
            </p>
          )}
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
          {sourceText !== null && parts.some((p) => p.changed) && <p className="dz-note">{W.page.changedFrom(rf!.versionNo)}</p>}
        </div>
        <div className="dz-versions">
          <p className="dz-label">{W.page.versions}</p>
          <ul>
            {d.history.map((h) => (
              <li key={h.versionId}>
                {h.versionId === d.shown.versionId ? (
                  <span aria-current="page">{versionRow(h)}</span>
                ) : (
                  <Link href={`/references/designs/${h.versionId}`}>{versionRow(h)}</Link>
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
                  {howMade(p.recipe, p.sha256, body.views.front?.sha256 ?? null, p === body.views.front).map((run, k) =>
                    run.mono ? <span key={k} className="recipe-mono">{run.text}</span> : <span key={k}>{run.text}</span>,
                  )}
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
        challengeOpen={challengeOpen}
      />
      <ChallengeShare versionId={d.shown.versionId} what={style ? title : `${callName}: ${title}`} posts={CHALLENGE.posts} inChallenge={d.kind === 'character' && isChallengeCharacter(d.entity) && phase() === 'open'} />
      {/* On a landing page "Posted on" sits at the top, with the picture. */}
      {!landing && posts.length > 0 && <PostedOn versionId={d.shown.versionId} posts={postItems} />}
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
                <Link href={`/references/designs/${o.versionId}`} className="dz-row" aria-current={o.elementId === d.elementId ? 'page' : undefined}>
                  {o.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="dz-thumb" src={o.thumb} alt="" width={64} height={48} loading="lazy" />
                  ) : (
                    <span className="dz-thumb dz-thumb-empty" aria-hidden="true" />
                  )}
                  <span className="dz-row-text">
                    <span className="dz-row-title">{o.title || (style ? o.entity : W.page.sheetBy(byline(o.byName, o.byFid)))}</span>
                    <span className="dz-row-meta">{W.index.rowMeta(designByline(o.byName, o.byFid, o.byRole), o.versionNo)}</span>
                    {o.thumb && <span className="dz-row-ai"><AiTag what={style ? 'Sample' : 'Views'} /></span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {main}
      </div>
    </div>
  );
}
