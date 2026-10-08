import Link from 'next/link';
import { notFound } from 'next/navigation';
import { chapterNumbers } from '~/lib/book';
import { ReportPronunciation } from '~/components/report-pronunciation';

type Props = { params: Promise<{ n: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return chapterNumbers().map((n) => ({ n: String(n) }));
}
export async function generateMetadata({ params }: Props) {
  return { title: `Report a mispronunciation, Chapter ${(await params).n}` };
}

/**
 * Each chapter's report page, linked from its podcast episode (docs/pronunciation-fixes.md).
 * All wording here is model-drafted, for the owner to rewrite.
 */
export default async function ReportPage({ params }: Props) {
  const n = Number((await params).n);
  if (!chapterNumbers().includes(n)) notFound();
  return (
    <div className="page prose">
      <p className="label">
        Chapter {n} · narration <span className="as-draft">Draft wording</span>
      </p>
      <h1>Report a mispronunciation</h1>
      <p>
        The narration is a synthetic voice, and it gets some words wrong. If you heard one in Chapter {n}, tell us which
        word and roughly where. In a Farcaster app this opens a cast to the /snowmoon channel; elsewhere it opens an issue
        on GitHub. Nothing is stored on this site.
      </p>
      <p>
        <ReportPronunciation className="report-link" target={{ chapter: n }}>
          Report a mispronunciation in Chapter {n}
        </ReportPronunciation>
      </p>
      <p>
        While listening in the reader, the player&apos;s own link reports the exact paragraph. Fixes are listed with the
        pronunciation file and re-spoken only where the word appears.
      </p>
      <p>
        <Link href={`/chapter/${n}`}>Read Chapter {n}</Link>
      </p>
    </div>
  );
}
