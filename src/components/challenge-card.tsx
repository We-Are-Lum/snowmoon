'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { designByline } from '~/lib/images/byline';
import { shuffleFresh } from '~/lib/challenge/shuffle';
import { AiTag } from './ai-tag';

/**
 * One character's card on /challenge, the hub (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S0–S1).
 *
 * - A big picture: one of the character's bases, a fresh random one per visit when it has several (the P5g shuffle on
 *   the whole list, `shuffleFresh(bases)`), with "AI ⓘ" saying the look is this edition's own.
 * - The first layer: the name, one line, about three facts (each opens the book's words with its block and "Read it"),
 *   and the moments list ("Moments picked by @naaate", each chip with its chapter). Written without the book's major
 *   turns (P9's challenge exception).
 * - Picture rows: the bases, then "First remixes by @naaate" (the owner's, when there are any), then "Remixes": a random
 *   three of the character's published remixes per visit (`shuffleFresh(remixes)`, P5g), "Show more" for the rest, in
 *   place. Tapping any picture is the action: it opens the remix screen for that picture (`href`, from the server).
 * - "More about …" (the second layer, in place): "May spoil later chapters.", the fuller description (this edition's
 *   summary) and more facts. At its foot, "Where … appears in the book" (the third layer), fetched only when opened.
 *   Each control is a real button with aria-expanded; opening one never moves the picture rows (they sit above it).
 *
 * No challenge words live in this file (it is in scripts everyone is served): they all come in `w` and the card's
 * data, from the server's view (src/lib/challenge/view.ts).
 */
export type CardTile = { versionId: string; thumb: string | null; title: string; byName: string | null; byFid: number; href: string; label: string | null };
export type CardFactView = { text: string; block: string; quote: string; href: string };
export type CardMomentView = { id: string; title: string; chip: string; href: string | null };
export type CardWords = {
  bases: string;
  firsts: string;
  remixes: string;
  showMore: string;
  moments: string;
  more: string;
  less: string;
  spoil: string;
  summary: string;
  look: string;
  appears: string;
  appearsCount: string;
  loading: string;
  failed: string;
  readIt: string;
  /** "Chapter {n}". */
  chapter: string;
  alt: string;
  tapToRemix: string;
};
export type CardData = {
  slug: string;
  name: string;
  draft: string | null;
  line: string;
  facts: CardFactView[];
  /** The second layer; null once P9's challenge exception has ended (entries closed). */
  more: { description: string; facts: CardFactView[] } | null;
  moments: CardMomentView[];
  bases: CardTile[];
  firsts: CardTile[];
  remixes: CardTile[];
  note: string | null;
};
type Passage = { block: string; chapter: number; quote: string; href: string };

/** How many remixes show at first, and how many more each "Show more" adds. */
const FIRST = 3;
const MORE = 12;

function Fact({ f, readIt }: { f: CardFactView; readIt: string }) {
  return (
    <li className="cc-fact">
      <details>
        <summary>
          <span className="cc-fact-text">{f.text}</span> <span className="cc-block">{f.block}</span>
        </summary>
        <blockquote className="cc-quote" cite={f.href}>
          <p>{f.quote}</p>
          <Link href={f.href}>{readIt}</Link>
        </blockquote>
      </details>
    </li>
  );
}

/** `picture`: the challenge's pictures (16:9), shown whole at their own shape (owner, 2026-11-07); bases are sheets (3:4). */
function Row({ tiles, alt, label, lazy = false, picture = false }: { tiles: CardTile[]; alt: string; label: string; lazy?: boolean; picture?: boolean }) {
  return (
    <ul className={picture ? 'cc-row cc-row-pics' : 'cc-row'} role="list" aria-label={label}>
      {tiles.map((t) => (
        <li key={t.versionId}>
          <Link className="cc-tile" href={t.href} data-version={t.versionId} prefetch={false}>
            {t.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={picture ? 'cc-tile-img cc-tile-pic' : 'cc-tile-img'} src={t.thumb} alt={alt} width={picture ? 256 : 192} height={picture ? 144 : 256} loading={lazy ? 'lazy' : undefined} />
            ) : (
              <span className={picture ? 'cc-tile-img cc-tile-pic cc-empty' : 'cc-tile-img cc-empty'} aria-hidden="true" />
            )}
            <span className="cc-tile-by">{t.label ?? designByline(t.byName, t.byFid)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ChallengeCard({ c, w }: { c: CardData; w: CardWords }) {
  // Several bases are shuffled afresh in this browser on each visit; until then, the first stands in with no order shown.
  const [bases, setBases] = useState<CardTile[] | null>(c.bases.length > 1 ? null : c.bases);
  const [remixes, setRemixes] = useState<CardTile[] | null>(null);
  const [shown, setShown] = useState(FIRST);
  const [open, setOpen] = useState(false);
  const [appearsOpen, setAppearsOpen] = useState(false);
  const [passages, setPassages] = useState<Passage[] | 'loading' | 'failed' | null>(null);
  useEffect(() => {
    setBases(c.bases.length > 1 ? shuffleFresh(c.bases) : c.bases);
    setRemixes(shuffleFresh(c.remixes));
  }, [c.bases, c.remixes]);
  const big = bases?.[0] ?? null;
  // A moment chip starts from the base shown big on this visit (a fresh random one when there are several), so no base
  // reads as the default.
  const momentHref = (href: string | null) => (href && big ? href.replace(/from=[^&]+/, `from=${big.versionId}`) : href);

  const toggleAppears = () => {
    const next = !appearsOpen;
    setAppearsOpen(next);
    if (next && passages === null) {
      setPassages('loading');
      authFetch(`/api/challenge/appears?character=${encodeURIComponent(c.slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { passages: Passage[] }) => setPassages(j.passages))
        .catch(() => setPassages('failed'));
    }
  };
  const chapters = Array.isArray(passages) ? [...new Set(passages.map((p) => p.chapter))] : [];

  return (
    <section className="cc-card" aria-labelledby={`cc-${c.slug}`} data-character={c.slug} id={c.slug}>
      {big ? (
        <figure className="cc-hero">
          <Link href={big.href} className="cc-hero-link" data-version={big.versionId} prefetch={false} aria-label={`${w.tapToRemix}: ${c.name}`}>
            {big.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="cc-hero-img" src={big.thumb} alt={w.alt} width={576} height={768} />
            ) : (
              <span className="cc-hero-img cc-empty" aria-hidden="true" />
            )}
          </Link>
          <figcaption className="cc-hero-cap">
            <AiTag note={w.look} />
          </figcaption>
        </figure>
      ) : c.bases.length ? (
        <div className="cc-hero">
          <span className="cc-hero-img cc-empty" aria-hidden="true" />
        </div>
      ) : null}

      <h2 id={`cc-${c.slug}`} className="cc-name">
        {c.name}
      </h2>
      <p className="cc-line">
        {c.line} <span className="cc-mark">{w.summary}</span>
        {c.draft && <span className="as-draft cc-draft"> · {c.draft}</span>}
      </p>
      <ul className="cc-facts" role="list">
        {c.facts.map((f) => (
          <Fact key={f.block + f.text} f={f} readIt={w.readIt} />
        ))}
      </ul>

      {c.note && <p className="dz-muted cc-note">{c.note}</p>}
      {c.bases.length > 0 && (
        <>
          <h3 className="cc-head">{w.bases}</h3>
          {bases ? <Row tiles={bases} alt={w.alt} label={w.bases} /> : <ul className="cc-row" role="list" aria-hidden="true">{c.bases.map((t) => <li key={t.versionId}><span className="cc-tile"><span className="cc-tile-img cc-empty" /></span></li>)}</ul>}
        </>
      )}
      {c.firsts.length > 0 && (
        <>
          <h3 className="cc-head">{w.firsts}</h3>
          <Row tiles={c.firsts} alt={w.alt} label={w.firsts} picture />
        </>
      )}
      {c.remixes.length > 0 && remixes && (
        <>
          <h3 className="cc-head">{w.remixes}</h3>
          <div data-shuffled="true" className="cc-remixes">
            <Row tiles={remixes.slice(0, shown)} alt={w.alt} label={w.remixes} lazy picture />
          </div>
          {shown < remixes.length && (
            <button type="button" className="ic-secondary cc-show-more" onClick={() => setShown((n) => n + MORE)}>
              {w.showMore}
            </button>
          )}
        </>
      )}

      {c.moments.length > 0 && (
        <>
          <h3 className="cc-head">{w.moments}</h3>
          <ul className="cc-moments" role="list">
            {c.moments.map((m) => (
              <li key={m.id} data-moment={m.id}>
                {momentHref(m.href) ? (
                  <Link className="cc-chip" href={momentHref(m.href)!}>
                    {m.title} <span className="cc-chip-ch">· {m.chip}</span>
                  </Link>
                ) : (
                  <span className="cc-chip">
                    {m.title} <span className="cc-chip-ch">· {m.chip}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {c.more && (
        <button type="button" className="cc-toggle" aria-expanded={open} aria-controls={`cc-more-${c.slug}`} onClick={() => setOpen((o) => !o)}>
          {open ? w.less : w.more} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      )}
      {open && c.more && (
        <div className="cc-more" id={`cc-more-${c.slug}`}>
          <p className="cc-spoil">{w.spoil}</p>
          <p className="cc-desc">
            {c.more.description} <span className="cc-mark">{w.summary}</span>
          </p>
          <ul className="cc-facts" role="list">
            {c.more.facts.map((f) => (
              <Fact key={f.block + f.text} f={f} readIt={w.readIt} />
            ))}
          </ul>
          <button type="button" className="cc-toggle" aria-expanded={appearsOpen} aria-controls={`cc-appears-${c.slug}`} onClick={toggleAppears}>
            {w.appears} <span aria-hidden="true">{appearsOpen ? '▴' : '▾'}</span>
          </button>
          {appearsOpen && (
            <div className="cc-appears" id={`cc-appears-${c.slug}`} aria-live="polite">
              {passages === 'loading' && <p className="dz-muted">{w.loading}</p>}
              {passages === 'failed' && <p className="dz-muted">{w.failed}</p>}
              {Array.isArray(passages) && (
                <>
                  <p className="dz-muted cc-count">{w.appearsCount.replace('{n}', String(passages.length)).replace('{a}', String(chapters[0] ?? '')).replace('{b}', String(chapters[chapters.length - 1] ?? ''))}</p>
                  {chapters.map((n) => (
                    <div key={n} className="cc-chapter">
                      <h4 className="cc-head">{w.chapter.replace('{n}', String(n))}</h4>
                      {passages
                        .filter((p) => p.chapter === n)
                        .map((p) => (
                          <blockquote key={p.block} className="cc-quote" cite={p.href} data-block={p.block}>
                            <p>{p.quote}</p>
                            <p className="cc-quote-foot">
                              <span className="cc-block">{p.block}</span> <Link href={p.href}>{w.readIt}</Link>
                            </p>
                          </blockquote>
                        ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
