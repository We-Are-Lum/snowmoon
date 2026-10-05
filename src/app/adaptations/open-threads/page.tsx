import Link from 'next/link';
import { openThreadsDoc } from '~/lib/adaptations';

export const metadata = { title: 'Open threads · Adaptations' };

export default function OpenThreads() {
  const html = openThreadsDoc();
  return (
    <div className="page prose adaptations">
      <p className="label crumb">
        <Link href="/adaptations">Adaptations</Link>
      </p>
      <h1>Open threads</h1>
      <p>Questions the book raises and never answers, as prompts for future adaptations.</p>
      {/* Spoiler rule: whole-book material is opt-in, behind a clear warning. */}
      <section className="notice" aria-label="Spoiler warning">
        <p>
          <strong>Full spoilers, through the last chapter.</strong> Cited passages link into the reader.
        </p>
      </section>
      <details className="spoiler-gate">
        <summary>Show the open threads</summary>
        <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />
      </details>
    </div>
  );
}
