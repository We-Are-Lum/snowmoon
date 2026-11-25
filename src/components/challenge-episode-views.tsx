import Link from 'next/link';
import { EPISODE } from '~/lib/config';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { byline } from '~/lib/images/byline';
import type { Card } from '~/lib/challenge/episode/rules';

/**
 * Episode 1: the opening, the views that hold no state (owner, 2026-11-24; mocks in docs/proposals/episode-1-opening/):
 * the goals, a card, an outline (whole, or up to the first-minute line for the list), the landing. Drawn on the server
 * for the public pages and in the browser for the deck's preview and the admins' view. Every word comes from
 * src/lib/challenge/episode/wording.ts. No count of any kind is shown (P5i): an outline's own length ("7 cards") is
 * the only number, and it describes the outline, not anyone's response to it.
 */
export type ShownPicture = { versionId: string; thumb: string; byName: string | null; byFid: number; href: string; title?: string | null };
export type ShownCard = Pick<Card, 'happens' | 'does'> & { pic?: ShownPicture | null };
export type ShownOutline = { id: string; byFid: number; byName: string | null; title: string | null; cards: ShownCard[]; minuteAfter: number; submittedAt: string; admin?: boolean };

export function DraftMark() {
  return EPISODE.wordingApproved ? null : <span className="as-draft ep-draft">{W.draftMark}</span>;
}

export function EpisodeGoals({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'ep-goals ep-goals-compact' : 'ep-goals'} aria-labelledby="ep-goals-head">
      <p className="ep-goals-head" id="ep-goals-head">
        {W.goalsHead}
      </p>
      <ol className="ep-goal-list">
        {W.goals.map((g) => (
          <li key={g.tag}>
            <span className="ep-goal-tag">{g.tag}</span>
            <span className="ep-goal-text">{g.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PictureThumb({ p, size = 'card' }: { p: ShownPicture; size?: 'card' | 'big' }) {
  const by = byline(p.byName, p.byFid);
  return (
    <a className={`ep-pic ep-pic-${size}`} href={p.href} title={`${W.pictureBy(by)} · ${W.pictureRecipe}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the site's own picture host, as everywhere */}
      <img src={p.thumb} alt={W.pictureAlt(by)} loading="lazy" />
      <span className="ep-ai" title={W.aiNote}>
        {W.aiTag} ⓘ
      </span>
    </a>
  );
}

export function CardView({ c, n }: { c: ShownCard; n: number }) {
  return (
    <li className="ep-card ep-card-read">
      <span className="ep-num">{n}</span>
      <div className="ep-card-body">
        <p className="ep-happens">{c.happens}</p>
        <p className="ep-does">{c.does}</p>
      </div>
      {c.pic && <PictureThumb p={c.pic} />}
    </li>
  );
}

export function MinuteLine({ label = W.minuteLine }: { label?: string }) {
  return (
    <li className="ep-minute" aria-label={label}>
      <span className="ep-minute-grip">{label}</span>
    </li>
  );
}

/** The cards in order with the first-minute line in its place; `upToLine` stops at the line (the list's short form). */
export function Deck({ cards, minuteAfter, upToLine = false }: { cards: ShownCard[]; minuteAfter: number; upToLine?: boolean }) {
  const shown = upToLine ? cards.slice(0, Math.max(1, minuteAfter)) : cards;
  return (
    <ol className="ep-deck ep-deck-read">
      {minuteAfter === 0 && <MinuteLine />}
      {shown.map((c, i) => [<CardView key={`c${i}`} c={c} n={i + 1} />, minuteAfter === i + 1 ? <MinuteLine key={`m${i}`} /> : null])}
    </ol>
  );
}

export function OutlineHead({ o, h = 'h1' }: { o: ShownOutline; h?: 'h1' | 'h2' }) {
  const by = byline(o.byName, o.byFid);
  const H = h;
  return (
    <header className="ep-outline-head">
      <H className="ep-outline-title">{o.title ?? W.untitled}</H>
      <p className="ep-by">
        {by} · {W.submittedOn(o.submittedAt)} · {W.cardsN(o.cards.length)}
        {o.admin && <span className="ep-admin"> · {W.adminLabel}</span>}
      </p>
    </header>
  );
}

/** One outline in the list: its head and its cards up to the first-minute line, then "+ n more". */
export function OutlineSummary({ o }: { o: ShownOutline }) {
  const shownN = Math.max(1, o.minuteAfter);
  const rest = o.cards.length - shownN;
  return (
    <article className="ep-summary">
      <OutlineHead o={o} h="h2" />
      <Deck cards={o.cards} minuteAfter={o.minuteAfter} upToLine />
      <p className="ep-more">
        {rest > 0 && <>{W.more(rest)} · </>}
        <Link href={`/challenge/episode-1/o/${o.id}`} prefetch={false}>
          {W.readOutline}
        </Link>
      </p>
    </article>
  );
}

/** A whole outline, as on its page and in the deck's preview. */
export function OutlineFull({ o, preview = false }: { o: ShownOutline; preview?: boolean }) {
  const by = byline(o.byName, o.byFid);
  const pics = o.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.pic);
  return (
    <div className="ep-outline">
      <div className="ep-outline-main">
        {!preview && (
          <p className="ep-crumb">
            <Link href="/challenge/episode-1/outlines">{W.backToList}</Link>
          </p>
        )}
        <p className="ep-for">{W.outlineFor}</p>
        <OutlineHead o={o} />
        <p className="ep-words-by">{W.wordsBy(by)}</p>
        <Deck cards={o.cards} minuteAfter={o.minuteAfter} />
      </div>
      <aside className="ep-outline-side">
        <section className="ep-panel">
          <p className="ep-goals-head">{W.aimsFor}</p>
          <p className="ep-aims">{W.aims}</p>
        </section>
        {pics.length > 0 && (
          <section className="ep-panel">
            <p className="ep-goals-head">{W.picturesHead}</p>
            <ul className="ep-pic-credits">
              {pics.map(({ c, i }) => (
                <li key={i}>
                  Card {i + 1}: <a href={c.pic!.href}>{c.pic!.title ? `${c.pic!.title}, ` : ''}{W.pictureBy(byline(c.pic!.byName, c.pic!.byFid))}</a> · <a href={c.pic!.href}>{W.pictureRecipe}</a>
                </li>
              ))}
            </ul>
            <p className="ep-small">{W.picturesNote}</p>
          </section>
        )}
      </aside>
    </div>
  );
}

/** The landing (/challenge/episode-1): the goals first, the example card, the two ways to start, then the rules. */
export function EpisodeLanding({ phase, hasSample }: { phase: 'before' | 'open' | 'closed'; hasSample: boolean }) {
  return (
    <div className="page ep-page ep-landing" data-page="episode-landing">
      <p className="ep-crumb">
        <Link href="/challenge">{W.backToChallenges}</Link>
      </p>
      <header className="ep-head">
        <div>
          <h1 className="ep-title">{W.title}</h1>
          <p className="ep-pitch">{W.pitch}</p>
        </div>
        <div className="ep-when">
          <p className="ep-window">{W.window()}</p>
          <p className="ep-closes">
            {phase === 'before' ? W.opensOn() : phase === 'open' ? W.closes() : W.closedNote} <DraftMark />
          </p>
        </div>
      </header>
      <EpisodeGoals />
      <p className="ep-how">{W.howCards}</p>
      <ol className="ep-deck ep-deck-read ep-example" aria-label={W.exampleLabel}>
        <li className="ep-card ep-card-read">
          <span className="ep-num ep-num-label">{W.exampleLabel}</span>
          <div className="ep-card-body">
            <p className="ep-happens">{W.example.happens}</p>
            <p className="ep-does">{W.example.does}</p>
          </div>
        </li>
      </ol>
      {phase !== 'closed' && (
        <p className="ep-btns">
          <Link href="/challenge/episode-1/make?start=blank" className="ep-btn ep-btn-solid" prefetch={false}>
            {W.startBlank}
          </Link>
          {hasSample && (
            <Link href="/challenge/episode-1/make?start=sample" className="ep-btn" prefetch={false}>
              {W.startSample}
            </Link>
          )}
        </p>
      )}
      <p className="ep-small">{W.noAiWrites}</p>
      <p className="ep-btns">
        <Link href="/challenge/episode-1/outlines" className="ep-btn" prefetch={false}>
          {W.everyOutline}
        </Link>
      </p>
      <details className="ep-rules">
        <summary>{W.rules}</summary>
        <ul>
          {W.rulesBody().map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export const episodeHasSample = () => EPISODE.sampleDeck.length > 0;
