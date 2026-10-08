'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lastChapter, openedChapters } from '~/lib/chat/device';
import { ADAPTATIONS } from '~/lib/config';
import { ChapterPlayer, type PlayerCue, type PlayerImage } from './chapter-player';

/**
 * A chapter, as in the prototype's reader: a context strip; "Ch n / 32" (opens the chapter
 * sheet) beside a Read / Listen switch; then the book (Read) or the listening pane (Listen).
 * The book text stays in the page while listening, hidden, so the player can follow it.
 */
export interface Narration {
  label: string;
  recipe: string;
  url: string;
  duration: number;
  cues: PlayerCue[];
}

export function ChapterView({
  chapter,
  dateline,
  chapters,
  narration,
  images,
  labels,
  children,
}: {
  chapter: number;
  dateline: string;
  chapters: { n: number; dateline: string }[];
  narration: Narration | null;
  images: PlayerImage[];
  labels: Record<number, number>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [view, setView] = useState<'read' | 'listen'>('read');
  // ?view=listen (the rail's "Listen") opens the listening pane; read after load, so pages stay static.
  useEffect(() => {
    if (narration && new URLSearchParams(window.location.search).get('view') === 'listen') setView('listen');
  }, [narration]);
  const [sheet, setSheet] = useState(false);

  const choose = useCallback(
    (v: 'read' | 'listen') => {
      setView(v);
      const url = new URL(window.location.href);
      if (v === 'listen') url.searchParams.set('view', 'listen');
      else url.searchParams.delete('view');
      router.replace(url.pathname + url.search + url.hash, { scroll: false });
    },
    [router],
  );

  return (
    <>
      {/* Desktop: the crumb above the selector. The dateline is the chapter's own, under it; phones have only the selector. */}
      <div className="context-strip context-wide" title={dateline || undefined}>
        <span>Chapter {chapter}</span>
        <span>{view === 'listen' ? 'Listen' : 'Read'}</span>
      </div>
      <div className="chapter-bar">
        <button type="button" className="chapter-bar-button" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
          Ch {chapter} <span className="chapter-bar-of">/ {chapters.length}</span> <span aria-hidden="true">▾</span>
        </button>
        {narration && (
          <div className="mode-switch" role="group" aria-label="Read or listen">
            <button type="button" aria-pressed={view === 'read'} onClick={() => choose('read')}>
              Read
            </button>
            <button type="button" aria-pressed={view === 'listen'} onClick={() => choose('listen')}>
              Listen
            </button>
          </div>
        )}
      </div>
      <div className="chapter-read" hidden={view === 'listen'}>
        {children}
      </div>
      {narration && (
        <ChapterPlayer
          chapter={chapter}
          chapters={chapters.length}
          label={narration.label}
          recipeUrl={narration.recipe}
          url={narration.url}
          duration={narration.duration}
          cues={narration.cues}
          images={images}
          labels={labels}
          view={view}
          onView={choose}
        />
      )}
      {sheet && (
        <ChapterSheet
          chapter={chapter}
          chapters={chapters}
          hasListen={Boolean(narration)}
          onRead={() => (setSheet(false), choose('read'))}
          onListen={() => (setSheet(false), choose('listen'))}
          onClose={() => setSheet(false)}
        />
      )}
    </>
  );
}

/** The chapter sheet, as in the prototype: this chapter, Read / Listen, Ask, and every chapter with its state. */
function ChapterSheet({
  chapter,
  chapters,
  hasListen,
  onRead,
  onListen,
  onClose,
}: {
  chapter: number;
  chapters: { n: number; dateline: string }[];
  hasListen: boolean;
  onRead: () => void;
  onListen: () => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [last, setLast] = useState(chapter);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    setOpened(openedChapters());
    setLast(lastChapter());
    sheet.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !sheet.current) return;
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>('a, button'));
      if (e.shiftKey && document.activeElement === items[0]) (e.preventDefault(), items[items.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === items[items.length - 1]) (e.preventDefault(), items[0].focus());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose]);
  const furthest = Math.max(...opened, chapter);
  return (
    <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="chapter-sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-sheet-title">
        <div className="chapter-sheet-head">
          <p id="chapter-sheet-title" className="chapter-sheet-title">
            Chapters
          </p>
          <p className="chapter-sheet-title">You&apos;ve read to ch {furthest}</p>
        </div>
        <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="cs-current">
          <p className="cs-current-name">
            <span>Chapter {chapter}</span>
            <span className="cs-state">Current</span>
          </p>
          <div className="cs-actions">
            <button type="button" onClick={onRead}>
              Read
            </button>
            {hasListen && (
              <button type="button" onClick={onListen}>
                Listen
              </button>
            )}
            <Link className="cs-ask" href={`/assistant?chapter=${chapter}`} onClick={onClose}>
              ○ Ask about this chapter
            </Link>
            {/* Planning isn't built: shown in its place, not as a control. Hidden with adaptations (ADAPTATIONS.visible). */}
            {ADAPTATIONS.visible && (
              <p className="cs-coming">
                <span>● Plan an adaptation of it</span>
                <span>Coming</span>
              </p>
            )}
          </div>
        </div>
        <ol className="chapter-sheet-list">
          {chapters
            .filter(({ n }) => n !== chapter)
            .map(({ n, dateline }) => {
              const state = n === last ? 'Reading' : opened.has(n) ? 'Read' : 'Not yet';
              return (
                <li key={n}>
                  <Link href={`/chapter/${n}`} className={state === 'Not yet' ? 'is-unread' : undefined} title={dateline || undefined} onClick={onClose}>
                    <span>Chapter {n}</span>
                    <span className="cs-state">{state}</span>
                  </Link>
                </li>
              );
            })}
        </ol>
      </div>
    </div>
  );
}
