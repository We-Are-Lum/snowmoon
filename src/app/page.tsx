import Link from 'next/link';
import { chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { WORK } from '~/lib/config';

export default function ChapterList() {
  const chapters = chapterNumbers().map((n) => {
    const ch = loadChapter(n)!;
    return { n, dateline: chapterDateline(ch), setting: blockFacts(ch.blocks).find((f) => f.setting)?.setting ?? null };
  });
  return (
    <div className="page home">
      <h1 className="book-title">{WORK.title}</h1>
      <p className="byline">by {WORK.author}</p>
      <section className="notice" aria-label="About this edition">
        <p>An independent adaptation, not affiliated with the author.</p>
        <p>There is no token.</p>
        <Link href="/about" className="notice-link">
          License and sources
        </Link>
      </section>
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
    </div>
  );
}
