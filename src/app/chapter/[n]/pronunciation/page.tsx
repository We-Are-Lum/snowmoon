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
 * Wording: drafted by the coding agent, approved as written by the owner (FID 6786, 2026-10-08).
 */
export default async function ReportPage({ params }: Props) {
  const n = Number((await params).n);
  if (!chapterNumbers().includes(n)) notFound();
  return (
    <div className="page prose" data-wording="FID 6786">
      <p className="label">
        Chapter {n} · narration
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
