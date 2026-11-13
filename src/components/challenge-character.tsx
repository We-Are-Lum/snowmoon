import Link from 'next/link';
import type { CharacterView } from '~/lib/challenge/view';
import type { Rendered } from '~/lib/challenge/learn-more-view';
import type { CardTile } from './challenge-card';
import { designByline } from '~/lib/images/byline';
import { AiTag } from './ai-tag';
import { CardLine, CharacterBases, RemixCharacter } from './challenge-card';

/**
 * A character's page, /challenge/<slug>: the redesign's screen 2 (Claude Design's handoff; owner-approved 2026-11-11),
 * drawn from its data (src/lib/challenge/view.ts, characterView), which carries every word.
 *
 * - Desktop: a sticky left column (the name, its approved one line marked "This edition's summary", "Read more about
 *   {name}" (for now, the line that the look is this edition's: P9g), "Read where {name} first appears",
 *   "Remix {name}"); on the right "Starting pictures" (every base, a fresh random order per visit, P5g), the owner's
 *   first remixes under their heading, then "Every remix of {name}", newest first, whole at 16:9, with "Older remixes"
 *   to the rest. No count of remixes (P5i).
 * - Phone: the bases as a swipe row first, then the line, "Read more", and the remixes two across.
 *
 * A remix's picture opens its page; "Remix this" opens its remix screen. No hooks here, so the public page draws it on
 * the server and the admins' view (challenge-admin.tsx) in the browser.
 */
function RemixGrid({ tiles, alt, remixThis, label }: { tiles: CardTile[]; alt: string; remixThis: string; label: string }) {
  return (
    <ul className="chc-grid" role="list" aria-label={label}>
      {tiles.map((t) => (
        <li key={t.versionId}>
          <figure className="chc-remix-card">
            <span className="chc-frame">
            <Link className="chc-pic chc-pic-wide" href={t.page ?? t.href} data-version={t.versionId} data-slot="remix-page" prefetch={false}>
              {t.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="chc-img chc-wide-img" src={t.thumb} alt={alt} width={512} height={288} loading="lazy" />
              ) : (
                <span className="chc-img cc-empty" aria-hidden="true" />
              )}
            </Link>
              <span className="chc-ai">
                <AiTag />
              </span>
            </span>
            <figcaption className="chc-cap">
              <span className="chc-by">{designByline(t.byName, t.byFid)}</span>
              <Link className="chc-remix-this" href={t.href} prefetch={false} data-slot="remix-this">
                {remixThis}
              </Link>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}

/**
 * A "Learn more" text: plain words; citations as small links to the reader's block; glossary terms with a small ⓘ that
 * opens the entry in a popover (no script: the browser's popover; where it isn't supported the note shows inline), the
 * glossary page linked inside. A DRAFT glossary term has no entry yet, so it shows as plain words.
 */
function Segs({ segs, more }: { segs: Rendered[]; more: string }) {
  return (
    <>
      {segs.map((s, i) =>
        s.kind === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : s.kind === 'cite' ? (
          <Link key={i} className="chc-cite" href={s.href} prefetch={false}>
            {s.label}
          </Link>
        ) : (
          <span key={i} className="chc-term">
            {s.term}
            {s.note && (
              <>
                <button type="button" className="chc-term-i" popoverTarget={s.id} aria-label={`What is ${s.term}?`}>
                  ⓘ
                </button>
                <span id={s.id} popover="auto" className="chc-term-note" role="note">
                  <strong>{s.term}</strong> <q>{s.note.text}</q> <span className="chc-cite">{s.note.cite}</span>{' '}
                  {s.href && (
                    <Link href={s.href} prefetch={false}>
                      {more}
                    </Link>
                  )}
                </span>
              </>
            )}
          </span>
        ),
      )}
    </>
  );
}

export function ChallengeCharacterBody({ v }: { v: CharacterView }) {
  const { c, w, page: P } = v;
  return (
    <div className="ch-char ch-character-page" data-character={c.slug}>
      <p className="chc-back">
        <Link href="/challenge">{v.back}</Link>
      </p>
      {v.adminNote && <p className="dz-note ch-admin-only chc-admin">{v.adminNote}</p>}
      <div className="chc-side">
        <h1 className="chc-name">{c.name}</h1>
        <div className="chc-line">
          <CardLine c={c} w={w} />
        </div>
        {/* "Learn more about {name}" (owner, 2026-11-12): one expander. The whole book only inside the nested fold,
            labelled exactly "Later in the book (spoilers)", closed by default (docs/principles.md P9g). */}
        <details className="chc-more chc-learn">
          <summary>{P.learn.title}</summary>
          <div className="chc-more-body">
            {P.learn.draft && <p className="as-draft ch-draft">{P.learn.draft}</p>}
            {P.learn.text ? (
              <>
                <p className="chc-learn-part" data-part="who">
                  <strong>{P.learn.text.who.head}</strong> <Segs segs={P.learn.text.who.segs} more={P.learn.glossaryLink} />
                </p>
                <p className="chc-learn-part" data-part="start">
                  <strong>{P.learn.text.start.head}</strong> <Segs segs={P.learn.text.start.segs} more={P.learn.glossaryLink} />
                </p>
                <details className="chc-later">
                  <summary>{P.learn.text.later.head}</summary>
                  <p className="chc-learn-part" data-part="later">
                    <Segs segs={P.learn.text.later.segs} more={P.learn.glossaryLink} />
                  </p>
                </details>
                <p className="chc-learn-part" data-part="drives">
                  <strong>{P.learn.text.drives.head}</strong> <Segs segs={P.learn.text.drives.segs} more={P.learn.glossaryLink} />
                </p>
                <div className="chc-learn-part" data-part="invent">
                  <strong>{P.learn.text.invent.head}</strong>
                  <ul className="chc-invent">
                    {P.learn.text.invent.items.map((it, i) => (
                      <li key={i}>
                        <Segs segs={it} more={P.learn.glossaryLink} />
                      </li>
                    ))}
                    <li className="chc-looks">{P.learn.looks}</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                {P.learn.facts.length > 0 && (
                  <>
                    <p className="chc-facts-note">{P.learn.factsNote}</p>
                    <ul className="chc-facts">
                      {P.learn.facts.map((f, i) => (
                        <li key={f.block} className="chc-fact" data-block={f.block}>
                          <span className="chc-fact-text">{f.text}</span>
                          <q className="chc-fact-quote">{f.quote}</q>
                          <span className="chc-fact-cite">
                            {P.learn.chips[i]} · {f.block}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="chc-looks">{P.learn.looks}</p>
              </>
            )}
          </div>
        </details>
        {c.note && <p className="dz-muted cc-note">{c.note}</p>}
        <p className="chc-remix-row">
          <RemixCharacter c={c} text={P.remix} />
        </p>
      </div>
      {c.bases.length > 0 && (
        <section aria-labelledby="ch-bases" className="ch-char-bases chc-section chc-start">
          <div className="chc-head">
            <h2 id="ch-bases" className="chc-h2">
              {P.startHead}
            </h2>
            <span className="chc-meta">{P.basesCount}</span>
          </div>
          <CharacterBases c={c} alt={w.alt} remixThis={P.remixThis} />
        </section>
      )}
      {P.picked.length > 0 && (
        <section aria-labelledby="ch-picked" className="chc-section chc-picked">
          <div className="chc-head">
            <h2 id="ch-picked" className="chc-h2">
              {P.pickedHead}
            </h2>
          </div>
          <RemixGrid tiles={P.picked} alt={w.alt} remixThis={P.remixThis} label={P.pickedHead} />
        </section>
      )}
      <section aria-labelledby="ch-remixes" className="ch-char-remixes chc-section chc-every">
        <div className="chc-head">
          <h2 id="ch-remixes" className="chc-h2">
            <span className="chc-wide-only">{P.everyHead}</span>
            <span className="chc-narrow-only">{P.everyShort}</span>
          </h2>
          <span className="chc-meta">{P.newestFirst}</span>
        </div>
        {c.remixes.length ? (
          <>
            <RemixGrid tiles={c.remixes} alt={w.alt} remixThis={P.remixThis} label={P.everyHead} />
            {P.older && (
              <p className="chc-older">
                <Link href={P.older.href} prefetch={false} data-slot="older">
                  {P.older.text}
                </Link>
              </p>
            )}
          </>
        ) : (
          <p className="dz-muted ch-feed-none">{w.none}</p>
        )}
      </section>
      <p className="dz-note ch-foot chc-foot">{v.notAffiliated}</p>
    </div>
  );
}
