import Link from 'next/link';
import { HomeMakeImageRow } from '~/components/make-image-link';
import { chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { db } from '~/lib/db';
import { feed } from '~/lib/images/data';
import { byline } from '~/lib/images/byline';
import { passageLabel } from '~/lib/images/passage';
import { loadIntro } from '~/lib/intro';
import { HOME_MOMENTS, HOME_TEXT as H } from '~/lib/home';
import { IntroOnce } from '~/components/first-visit';
import { HomeSky } from '~/components/home-sky';
import { HomeStart } from '~/components/home-start';
import { HomeMomentCard } from '~/components/home-moment';
import { HomeFeed, type HomeFeedItem } from '~/components/home-feed';
import { HomeMinpentai } from '~/components/home-minpentai';
import '../styles/home.css';

// Rendered per request, like /images: "Just made" is the newest images now. (With ISR, revalidate = 60,
// a stale home's prefetch from other pages never finished in Chrome, so pages linking home never went idle.)
export const dynamic = 'force-dynamic';

/**
 * Home, from Claude Design's HomeWindow (docs/design/home/HomeWindow.dc.html; the site's own top bar,
 * menu and rail stand in for Design's header and menu). The dark hero says, on the first screen, that
 * this is an independent adaptation, not affiliated with the author, with no token (principle 7; the
 * owner's ruling moved Design's footer line here, 2026-10-10). Then a moment from the book, the
 * newest readers' images, Minpentai playing itself, everything you can do here, and every chapter.
 */
export default async function Home() {
  const intro = loadIntro();
  const chapters = chapterNumbers().map((n) => {
    const ch = loadChapter(n)!;
    return { n, dateline: chapterDateline(ch), setting: blockFacts(ch.blocks).find((f) => f.setting)?.setting ?? null };
  });
  const sql = db();
  const images = sql ? await feed(sql, 'new', 5).catch(() => null) : null;
  const items: HomeFeedItem[] = (images ?? []).map((im) => ({
    versionId: im.versionId,
    url: im.url,
    chapter: im.chapter,
    where: passageLabel(im.chapter, im.start, im.end),
    by: byline(im.byName, im.byFid),
    at: im.createdAt,
    alt: `AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`,
    prompt: im.userPrompt,
  }));

  // Model-drafted wording (Claude Design, adapted by the coding agent): the descriptions below.
  const book = [
    { href: '/chapter/1', name: 'Read', what: 'The book, with readers’ images beside it', meta: 'Ch 1 →' },
    { href: '/chapter/1?view=listen', name: 'Listen', what: 'The narrated chapters, and the podcast', meta: '→' },
    { href: '/glossary', name: 'Glossary', what: 'The book’s invented words', meta: '→' },
  ];
  const more = [
    { href: '/assistant', name: 'Assistant', what: 'Ask about the book, privately', meta: '→' },
    { href: '/minpentai', name: 'Minpentai', what: 'The game from the book', meta: 'Learn · play →' },
    { href: '/images', name: 'Pictures', what: 'Images readers made for passages, each with how it was made', meta: 'Trial →' },
  ];
  const row = (r: (typeof book)[number]) => (
    <li key={r.name}>
      <Link href={r.href}>
        <span className="home-do-text">
          <span className="home-do-name">{r.name}</span>
          <span className="home-do-what">{r.what}</span>
        </span>
        <span className="home-do-meta">{r.meta}</span>
      </Link>
    </li>
  );

  return (
    <div className="home">
      {/* First visit only, home page only (config/intro.json). */}
      <IntroOnce intro={intro} />
      <section className="home-hero" aria-labelledby="home-title">
        <HomeSky />
        <div className="home-hero-inner">
          <div className="home-hero-text">
            <p className="home-kicker">{H.kicker}</p>
            <h1 id="home-title" className="home-title">
              {H.title}
            </h1>
            <ul className="home-lines">
              {H.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <HomeStart intro={intro} />
            {/* Principle 7: on the first screen. The owner-approved line from config/intro.json. */}
            <p className="home-disclaimer">
              {intro.disclaimer}
              {' · '}
              <Link href="/about">{H.about}</Link>
            </p>
          </div>
        </div>
      </section>

      <div className="home-body">
        <div className="home-cards">
          <HomeMomentCard moments={HOME_MOMENTS} />
          <HomeFeed items={items} unavailable={images === null} />
          <HomeMinpentai />
        </div>

        <section className="home-do" aria-labelledby="home-do-head">
          <h2 id="home-do-head" className="home-section-head">
            {H.everything}
          </h2>
          <div className="home-do-cols">
            <div>
              <p className="home-do-group">Book</p>
              <ul className="home-do-list home-do-sub">{book.map(row)}</ul>
            </div>
            <ul className="home-do-list">
              {more.map(row)}
              <HomeMakeImageRow />
            </ul>
          </div>
        </section>

        <section className="home-chapters" aria-labelledby="home-chapters-head">
          <h2 id="home-chapters-head" className="home-section-head">
            {H.chapters}
          </h2>
          <ol className="chapter-list">
            {chapters.map(({ n, dateline, setting }) => (
              <li key={n} data-setting={setting ?? undefined}>
                <Link href={`/chapter/${n}`}>
                  <span className="ch-num">Chapter {n}</span>
                  <span className="ch-dateline">{dateline}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <p className="home-foot">
          {H.footer} <Link href="/about">About this edition, its licence and sources</Link>
        </p>
      </div>
    </div>
  );
}
