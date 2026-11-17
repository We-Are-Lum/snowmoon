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
      {/* Shown in full (owner, 2026-11-17: principle 9 retired); until then behind "Show the open threads". The notice's
          wording is the owner's reread of 2026-11-17. */}
      <section className="notice" aria-label="About the open threads">
        <p>These draw on the whole book. Cited passages link into the reader.</p>
      </section>
      <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
