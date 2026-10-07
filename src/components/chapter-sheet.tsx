'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { readTo } from '~/lib/chat/device';

/**
 * The reader's chapter bar and sheet (from the clickable prototype's reader, Oct 7):
 * a sticky "Ch n / 32" button under the top bar opens a sheet listing every chapter,
 * with "Ask about this chapter" at the top. Chapters past the furthest one opened on
 * this device are marked, not hidden: anyone may read ahead.
 */
export function ChapterSheet({ chapter, chapters }: { chapter: number; chapters: { n: number; dateline: string }[] }) {
  const [open, setOpen] = useState(false);
  const [furthest, setFurthest] = useState(1);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFurthest(Math.max(readTo(), chapter));
    // Focus the current chapter, so the list opens where the reader is.
    sheet.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
    sheet.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab' || !sheet.current) return;
      // Keep Tab inside the sheet while it is open.
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>('a, button'));
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      button.current?.focus();
    };
  }, [open, chapter]);

  return (
    <>
      <div className="chapter-bar">
        <button ref={button} type="button" className="chapter-bar-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          Ch {chapter} <span className="chapter-bar-of">/ {chapters.length}</span> <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open && (
        <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div ref={sheet} className="chapter-sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-sheet-title">
            <div className="chapter-sheet-head">
              <p id="chapter-sheet-title" className="chapter-sheet-title">
                Chapters
              </p>
              <button type="button" className="chapter-sheet-close" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <Link className="chapter-sheet-ask" href={`/assistant?chapter=${chapter}`} onClick={() => setOpen(false)}>
              ○ Ask about this chapter
            </Link>
            <ol className="chapter-sheet-list">
              {chapters.map(({ n, dateline }) => (
                <li key={n}>
                  <Link href={`/chapter/${n}`} aria-current={n === chapter ? 'page' : undefined} onClick={() => setOpen(false)}>
                    <span className="cs-n">{n}</span>
                    <span className="cs-dateline">{dateline || `Chapter ${n}`}</span>
                    {n > furthest && <span className="cs-ahead">not opened yet</span>}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
