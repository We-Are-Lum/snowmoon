import Link from 'next/link';
import { HomeMakeImageRow } from '~/components/make-image-link';
import { chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { db } from '~/lib/db';
import { feed } from '~/lib/images/data';
import { byline } from '~/lib/images/byline';
import { passageLabel } from '~/lib/images/passage';
import { introShown } from '~/lib/seeded-shown';
import { HOME_MOMENTS, HOME_TEXT as H } from '~/lib/home';
import { IntroOnce } from '~/components/first-visit';
import { HomeSky } from '~/components/home-sky';
import { HomeStart } from '~/components/home-start';
import { HomeMomentCard } from '~/components/home-moment';
import { HomeFeed, type HomeFeedItem, type HomePoster } from '~/components/home-feed';
import { HomeMinpentai } from '~/components/home-minpentai';
import { SceneCard } from '~/components/scene-card';
import { CHALLENGE } from '~/lib/config';
import { CHALLENGE_WORDING as CW } from '~/lib/challenge/wording';
import { phase } from '~/lib/challenge/rules';
import { POSTER } from '~/lib/challenge/poster';
import { POSTER_LABEL, posterView } from '~/lib/challenge/poster-view';
import { bookCharacter } from '~/lib/images/designs';
import { callNameOf } from '~/lib/challenge/names';
import { NO_PASSAGE } from '~/lib/images/no-passage';
import '../styles/home.css';

// Rendered per request, like /images: "Just made" is the newest images now. (With ISR, revalidate = 60,
// a stale home's prefetch from other pages never finished in Chrome, so pages linking home never went idle.)
export const dynamic = 'force-dynamic';

/**
 * Home, from Claude Design's HomeWindow (docs/design/home/HomeWindow.dc.html; the site's own top bar,
 * menu and rail stand in for Design's header and menu). The dark hero says, on the first screen, that
 * this is an independent adaptation, not affiliated with the author (principle 7; the
 * owner's ruling moved Design's footer line here, 2026-10-10). Then a moment from the book, the
 * newest readers' images, Minpentai playing itself, everything you can do here, and every chapter.
 */
export default async function Home() {
  const intro = await introShown();
  const chapters = chapterNumbers().map((n) => {
    const ch = loadChapter(n)!;
    return { n, dateline: chapterDateline(ch), setting: blockFacts(ch.blocks).find((f) => f.setting)?.setting ?? null };
  });
  const sql = db();
  // At most 2 s: the home page never waits on the database (one connection per server instance is
  // shared by every request); past that, "Just made" shows its "Nothing to show right now." line.
  const images = sql
    ? await Promise.race([feed(sql, 'new', 5), new Promise<null>((r) => setTimeout(() => r(null), 2000))]).catch(() => null)
    : null;
  // A remix challenge picture (no passage): titled "Zei · by @name" and linking to its own page (owner, 2026-11-12).
  const challengeTitle = (slug: string | null | undefined, by: string) => (slug ? `${callNameOf(bookCharacter(slug)?.name ?? slug)} · by ${by}` : null);
  const items: HomeFeedItem[] = (images ?? []).map((im) => ({
    title: im.chapter === null ? challengeTitle(im.challengeCharacter, byline(im.byName, im.byFid)) : null,
    href: im.chapter === null ? NO_PASSAGE.page(im.versionId) : `/image/${im.versionId}`,
    versionId: im.versionId,
    url: im.url,
    chapter: im.chapter,
    where: im.chapter === null || im.start === null || im.end === null ? null : passageLabel(im.chapter, im.start, im.end),
    by: byline(im.byName, im.byFid),
    at: im.createdAt,
    alt: `AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`,
    prompt: im.userPrompt,
  }));

  // The challenge poster above "Just made", only while entries are open (owner, 2026-11-12), and its card then sits
  // second, in the right-hand column on a wide screen. Before or after the window, "Just made" alone, where it was.
  const poster: HomePoster | null =
    CHALLENGE.public && phase() === 'open' ? { src: POSTER.embed, alt: POSTER.alt, width: 1200, height: 800, label: POSTER_LABEL, view: posterView() } : null;
  const feedCard = <HomeFeed items={items} unavailable={images === null} poster={poster} />;

  // Model-drafted wording (Claude Design, adapted by the coding agent): the descriptions below.
  const book = [
    { href: '/chapter/1', name: 'Read', what: 'The book, with readers’ images beside it', meta: 'Ch 1 →' },
    { href: '/chapter/1?view=listen', name: 'Listen', what: 'The narrated chapters, and the podcast', meta: '→' },
    { href: '/glossary', name: 'Glossary', what: 'The book’s invented words', meta: '→' },
  ];
  // The same order as the menu (owner, 2026-10-29): Adaptations, References, Minpentai, the Assistant.
  const more = [
    // Model-drafted (coding agent, 2026-10-18), for the owner.
    { href: '/adaptations', name: 'Adaptations', what: 'Scenes made from the book: watch them, and remix a shot', meta: 'Watch · remix →' },
    { href: '/references', name: 'References', what: 'Images readers made for passages, each with how it was made', meta: 'Trial →' },
    { href: '/minpentai?mode=learn', name: 'Minpentai', what: 'The game from the book', meta: 'Learn · play →' },
    { href: '/assistant', name: 'Assistant', what: 'Ask about the book, privately', meta: '→' },
    // The remix challenge (owner, 2026-11-03: a /challenge link on the home page), last, as in the menu. Its line is
    // new wording, drafted by the coding agent: marked "Draft wording" until the owner approves it.
    // Only once the owner opens the challenge (CHALLENGE.public; owner, 2026-11-04: admin-only for now).
    ...(CHALLENGE.public ? [{ href: '/challenge', name: CW.title, what: CW.homeLine(), meta: '→', draft: true }] : []),
  ];
  const row = (r: (typeof book)[number] & { draft?: boolean }) => (
    <li key={r.name}>
      <Link href={r.href}>
        <span className="home-do-text">
          <span className="home-do-name">{r.name}</span>
          <span className="home-do-what">{r.what}</span>
          {r.draft && <span className="as-draft ic-draftline">{CW.draftShort}</span>}
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
          <SceneCard />
          {poster && feedCard}
          <HomeMomentCard moments={HOME_MOMENTS} />
          {!poster && feedCard}
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
