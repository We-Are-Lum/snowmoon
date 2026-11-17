'use client';
import { useRef } from 'react';

/**
 * "Learn more about {name}" on a character's page: the <details> and its summary drawn as a button (the design pass,
 * owner 2026-11-16). On a desktop the left column is pinned while Learn more is closed and unpinned while it is open
 * (owner, 2026-11-16: "so the end of a long Learn more can be read without scrolling to the bottom of the page";
 * designs.css, .chc-side:has(.chc-learn[open])). Unpinning puts the column back at the top of its row, so a reader who
 * opened it lower down would lose the button; this keeps the button where it was on the screen when it opens (no
 * change on a phone, where the column is never pinned). Everything else is the browser's own <details>.
 */
export function LearnMore({ title, children }: { title: string; children: React.ReactNode }) {
  const summary = useRef<HTMLElement>(null);
  const before = useRef<number | null>(null);
  return (
    <details
      className="chc-more chc-learn"
      onToggle={(e) => {
        const top = before.current;
        before.current = null;
        if (top === null || !(e.currentTarget as HTMLDetailsElement).open || !summary.current) return;
        const moved = summary.current.getBoundingClientRect().top - top;
        if (Math.abs(moved) > 1) window.scrollBy({ top: moved, behavior: 'instant' });
      }}
    >
      <summary
        ref={summary}
        className="chc-learn-btn"
        onClick={() => {
          before.current = summary.current?.getBoundingClientRect().top ?? null;
        }}
      >
        {title}
      </summary>
      {children}
    </details>
  );
}
