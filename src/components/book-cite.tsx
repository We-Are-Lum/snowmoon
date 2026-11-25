import Link from 'next/link';
import { citeHref, citeLabel } from '~/lib/book-cite';

/**
 * A citation of the book as a small book icon (Nate, 2026-11-24), in place of its visible block code: a link to its
 * first block in the reader, named and titled "In the book: chapter N", the block (or range) kept in data-block and the
 * href. Not the ⓘ, which is the glossary's. One per citation: adjacent citations get one icon each.
 */
export function BookCite({ block }: { block: string }) {
  const label = citeLabel(block);
  return (
    <Link className="book-cite" href={citeHref(block)} data-block={block} aria-label={label} title={label} prefetch={false}>
      <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.5C10.2 5.2 7.6 4.6 3.5 4.8v13.4c4.1-.2 6.7.4 8.5 1.7 1.8-1.3 4.4-1.9 8.5-1.7V4.8c-4.1-.2-6.7.4-8.5 1.7Z" />
        <path d="M12 6.5v13.4" />
      </svg>
    </Link>
  );
}
