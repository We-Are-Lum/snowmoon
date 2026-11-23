import Link from 'next/link';
import type { CharacterView } from '~/lib/challenge/view';
import type { CardTile } from './challenge-card';
import { designByline } from '~/lib/images/byline';
import { AiTag } from './ai-tag';
import { CardLine, CharacterBases } from './challenge-card';
import { LearnMore, LearnMoreParts } from './challenge-learn-more';

/**
 * A character's page, /challenge/<slug>: the redesign's screen 2 (Claude Design's handoff; owner-approved 2026-11-11),
 * drawn from its data (src/lib/challenge/view.ts, characterView), which carries every word.
 *
 * Top to bottom (the design pass, owner 2026-11-16): the name, large; its approved one line with "This edition's
 * summary"; "Learn more about {name}" as a button that opens the expander in place (a <details>, its summary styled as an
 * outlined button, full width on a phone); then "Make your own {name}" and its line, and two choices, each with its head
 * and line: "Start from a base" (every base, a fresh random order per visit, P5g; each with "Remix this") and "Start
 * from someone's remix" (the owner's first remixes under their heading, then every remix of the character, newest
 * first, whole at 16:9, each with its own "Remix this"; "Older remixes" to the rest). No count of bases or remixes
 * (P5i). On a desktop the name, line and button are a sticky left column and "Make your own" is on the right.
 * The column is pinned inside its own row (.chc-side-wrap), so it never runs over the footer, and unpinned while Learn
 * more is open (owner, 2026-11-16). Under "Make your own", a link to the remix choice (desktop; DRAFT wording).
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
      {/* The left column's row (owner, 2026-11-16): the wrapper fills grid row 3, so the pinned column stays inside it and
          never slides over the footer. */}
      <div className="chc-side-wrap">
        <div className="chc-side">
          <h1 className="chc-name">{c.name}</h1>
          <div className="chc-line">
            <CardLine c={c} w={w} />
          </div>
          {/* "Learn more about {name}" (owner, 2026-11-12): one expander. "Later in the book." is a plain part like the
              others (owner, 2026-11-17: principle 9 retired; it was a nested fold, closed by default). */}
          {/* A button that opens the expander in place (the design pass, owner 2026-11-16): the <details>' own summary, so
              it keeps its keyboard and screen-reader behaviour; only its look is a button's. */}
          <LearnMore title={P.learn.title}>
            <LearnMoreParts learn={P.learn} />
          </LearnMore>
        </div>
      </div>
      {/* "Make your own {name}" and its two choices (the design pass, owner 2026-11-16; DRAFT wording). */}
      <section aria-labelledby="ch-make" className="chc-make">
        <div className="chc-make-head">
          <h2 id="ch-make" className="chc-h2 chc-make-h2">
            {P.makeHead}
          </h2>
          <p className="chc-make-line">{P.makeLine}</p>
          {/* The owner, 2026-11-16 (DRAFT wording): an in-page link to the remix choice, on a desktop. */}
          <p className="chc-to-remix">
            <a href="#from-remix" data-slot="to-remix">
              {P.toRemix}
            </a>
          </p>
        </div>
        {c.note && <p className="dz-muted cc-note">{c.note}</p>}
        {c.bases.length > 0 && (
          <section aria-labelledby="ch-bases" className="ch-char-bases chc-section chc-choice chc-start" data-choice="base">
            <div className="chc-choice-head">
              <h3 id="ch-bases" className="chc-h3">
                {P.fromBaseHead}
              </h3>
              <p className="chc-choice-line">{P.fromBaseLine}</p>
            </div>
            <CharacterBases c={c} alt={w.alt} remixThis={P.remixThis} />
          </section>
        )}
        <section id="from-remix" aria-labelledby="ch-remixes" className="ch-char-remixes chc-section chc-choice chc-every" data-choice="remix">
          <div className="chc-choice-head">
            <h3 id="ch-remixes" className="chc-h3">
              {P.fromRemixHead}
            </h3>
            <p className="chc-choice-line">{P.fromRemixLine}</p>
          </div>
          {P.picked.length > 0 && (
            <div className="chc-picked">
              <h4 className="chc-h4">{P.pickedHead}</h4>
              <RemixGrid tiles={P.picked} alt={w.alt} remixThis={P.remixThis} label={P.pickedHead} />
            </div>
          )}
          <div className="chc-sub-head">
            {P.picked.length > 0 && <h4 className="chc-h4">{P.everyShort}</h4>}
            <span className="chc-meta">{P.newestFirst}</span>
          </div>
          {c.remixes.length ? (
            <>
              <RemixGrid tiles={c.remixes} alt={w.alt} remixThis={P.remixThis} label={P.everyShort} />
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
      </section>
      <p className="dz-note ch-foot chc-foot">{v.notAffiliated}</p>
    </div>
  );
}
