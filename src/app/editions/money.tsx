import type { CatalogEntry } from '~/lib/editions/catalog';
import { EW } from '~/lib/editions/wording';

/** The split's rows: each named share, and the people it was built on (the rest, when their share isn't written). */
export function splitRows(c: CatalogEntry | null): { name: string | null; share: number | null }[] {
  const rows = c?.split ?? [];
  const known = rows.reduce((t, r) => t + (r.share ?? 0), 0);
  return rows.map((r) => (r.share === null && rows.filter((x) => x.share === null).length === 1 ? { name: r.name, share: 100 - known } : r));
}

export function MoneyRows({ c }: { c: CatalogEntry | null }) {
  const rows = splitRows(c);
  return (
    <>
      <span className="ed-split-bar" aria-hidden="true">
        {rows.map((r, i) => (
          <span key={i} style={{ width: `${r.share ?? 0}%` }} className={`ed-split-${i}`} />
        ))}
      </span>
      <ul className="ed-split">
        {rows.map((r, i) => (
          <li key={i}>
            <span className={r.name ? '' : 'ed-placeholder'}>{r.name ?? EW.recipientPlaceholder}</span>
            <span className="ed-split-share">{r.share === null ? '[share]' : `${r.share}%`}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

