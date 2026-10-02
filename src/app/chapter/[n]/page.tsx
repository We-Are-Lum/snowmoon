import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { blockId, chapterNumbers, loadChapter, renderBlock } from '~/lib/book';
import { WORK } from '~/lib/config';

type Props = { params: Promise<{ n: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return chapterNumbers().map((n) => ({ n: String(n) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Chapter ${(await params).n}` };
}

export default async function ChapterPage({ params }: Props) {
  const n = Number((await params).n);
  const chapter = loadChapter(n);
  if (!chapter) notFound();

  return (
    <article className="page chapter" data-chapter={n}>
      {chapter.blocks.map((b) => {
        const id = blockId(n, b.idx);
        if (b.kind === 'break') return <hr key={id} id={id} className="block break" />;
        const Tag = b.kind === 'paragraph' ? 'p' : 'div';
        return (
          <Tag
            key={id}
            id={id}
            className={`block ${b.kind}`}
            dangerouslySetInnerHTML={{ __html: renderBlock(b) }}
          />
        );
      })}
      <nav className="chapter-nav">
        {n > 1 ? <Link href={`/chapter/${n - 1}`}>← Chapter {n - 1}</Link> : <span />}
        <Link href="/">Contents</Link>
        {n < WORK.chapters ? <Link href={`/chapter/${n + 1}`}>Chapter {n + 1} →</Link> : <span />}
      </nav>
      <p className="provenance">
        Text from <a href={chapter.source_url}>{chapter.source_url}</a>, fetched {chapter.fetched_at}. GPL v3.
      </p>
    </article>
  );
}
