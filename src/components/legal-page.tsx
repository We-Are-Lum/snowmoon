import Link from 'next/link';
import { LEGAL, currentReread, type LegalDoc } from '~/lib/legal';
import { LegalLine } from './legal-line';

/**
 * /terms and /privacy: one column, the site's reading type, the starter's words as written
 * (src/lib/legal.ts). One "Draft wording" line until the owner has reread the words shown now;
 * after that, the owner's tag with the date. No per-sentence tags.
 */
export function LegalPage({ doc, which }: { doc: LegalDoc; which: 'terms' | 'privacy' }) {
  const reread = currentReread(which);
  return (
    <div className="page prose legal" {...(reread ? { 'data-wording': reread.by } : {})}>
      <p className="legal-back">
        <Link href="/about">← About</Link>
      </p>
      <h1>{doc.title}</h1>
      {LEGAL.effective && <p className="legal-effective">Effective: {LEGAL.effective}</p>}
      {doc.sections.map((s) => (
        <section key={s.n} aria-label={`${s.n}. ${s.head}`}>
          {s.body.map((b, i) =>
            typeof b === 'string' ? (
              <p key={i}>
                {i === 0 && <strong>{`${s.n}. ${s.head}`} </strong>}
                {b}
              </p>
            ) : (
              <div key={i}>
                {i === 0 && (
                  <p>
                    <strong>{`${s.n}. ${s.head}`}</strong>
                  </p>
                )}
                <ul>
                  {b.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </section>
      ))}
      {reread ? (
        <p className="legal-reread">Reread by {reread.by} on {reread.on}</p>
      ) : (
        <p className="as-draft">Draft wording</p>
      )}
      <LegalLine />
    </div>
  );
}
