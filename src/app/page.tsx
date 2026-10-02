import Link from 'next/link';
import { chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { WORK } from '~/lib/config';

export default function ChapterList() {
  const chapters = chapterNumbers().map((n) => ({ n, dateline: chapterDateline(loadChapter(n)!) }));
  return (
    <div className="page">
      <h1 className="book-title">{WORK.title}</h1>
      <p className="byline">
        by {WORK.author} · <a href={WORK.sourceUrl}>source</a> · GPL v3
      </p>
      <ol className="chapter-list">
        {chapters.map(({ n, dateline }) => (
          <li key={n}>
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
