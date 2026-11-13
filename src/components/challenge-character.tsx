import Link from 'next/link';
import type { CharacterView } from '~/lib/challenge/view';
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
        <details className="chc-more">
          <summary>{P.more.title}</summary>
          <div className="chc-more-body">
            {P.more.facts.length > 0 && (
              <>
                <p className="chc-facts-note">{P.more.factsNote}</p>
                <ul className="chc-facts">
                  {P.more.facts.map((f, i) => (
                    <li key={f.block} className="chc-fact" data-block={f.block}>
                      <span className="chc-fact-text">{f.text}</span>
                      <q className="chc-fact-quote">{f.quote}</q>
                      <span className="chc-fact-cite">
                        {P.more.chips[i]} · {f.block}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="chc-looks">{P.more.looks}</p>
          </div>
        </details>
        {v.firstAppears && (
          <p className="ch-first-appears chc-first">
            <Link href={v.firstAppears.href} prefetch={false} data-slot="first-appears">
              {v.firstAppears.words} →
            </Link>
          </p>
        )}
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
