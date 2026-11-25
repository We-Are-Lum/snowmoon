'use client';
import { useRef } from 'react';
import Link from 'next/link';
import type { LearnMoreView, Rendered } from '~/lib/challenge/learn-more-view';
import { BookCite } from '~/components/book-cite';

/**
 * "Learn more about {name}" on a character's page: the <details> and its summary drawn as a button (the design pass,
 * owner 2026-11-16). On a desktop the left column stays in place while Learn more is closed and scrolls with the page while it is open
 * (owner, 2026-11-16: "so the end of a long Learn more can be read without scrolling to the bottom of the page";
 * designs.css, .chc-side:has(.chc-learn[open])). Letting it scroll puts the column back at the top of its row, so a reader who
 * opened it lower down would lose the button; this keeps the button where it was on the screen when it opens (no
 * change on a phone, where the column never stays in place). Everything else is the browser's own <details>.
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

/**
 * A "Learn more" text: plain words; citations as small book icons linking to the reader's block, with no visible block
 * code (Nate, 2026-11-24; src/components/book-cite.tsx); glossary terms with a small ⓘ that
 * opens the entry in a popover (no script: the browser's popover; where it isn't supported the note shows inline), the
 * glossary page linked inside. A term with no entry (none today) shows as plain words.
 */
function Segs({ segs, more }: { segs: Rendered[]; more: string }) {
  return (
    <>
      {segs.map((s, i) =>
        s.kind === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : s.kind === 'cite' ? (
          <BookCite key={i} block={s.block} />
        ) : (
          <span key={i} className="chc-term">
            {s.term}
            {s.note && (
              <>
                <button type="button" className="chc-term-i" popoverTarget={s.id} aria-label={`What is ${s.term}?`}>
                  ⓘ
                </button>
                <span id={s.id} popover="auto" className="chc-term-note" role="note">
                  <strong>{s.term}</strong> <q>{s.note.text}</q> <BookCite block={s.note.cite} />{' '}
                  {s.href && (
                    <Link href={s.href} prefetch={false}>
                      {more}
                    </Link>
                  )}
                </span>
              </>
            )}
          </span>
        ),
      )}
    </>
  );
}

/** The expander's body (shared: a challenge character's page and the Ephelion challenge, /storyboard/record). */
export function LearnMoreParts({ learn }: { learn: LearnMoreView }) {
  return (
      <div className="chc-more-body">
        {learn.draft && <p className="as-draft ch-draft">{learn.draft}</p>}
        {learn.text ? (
          <>
            <p className="chc-learn-part" data-part="who">
              <strong>{learn.text.who.head}</strong> <Segs segs={learn.text.who.segs} more={learn.glossaryLink} />
            </p>
            <p className="chc-learn-part" data-part="start">
              <strong>{learn.text.start.head}</strong> <Segs segs={learn.text.start.segs} more={learn.glossaryLink} />
            </p>
            <p className="chc-learn-part" data-part="later">
              <strong>{learn.text.later.head}</strong> <Segs segs={learn.text.later.segs} more={learn.glossaryLink} />
            </p>
            <p className="chc-learn-part" data-part="drives">
              <strong>{learn.text.drives.head}</strong> <Segs segs={learn.text.drives.segs} more={learn.glossaryLink} />
            </p>
            <div className="chc-learn-part" data-part="invent">
              <strong>{learn.text.invent.head}</strong>
              <ul className="chc-invent">
                {learn.text.invent.items.map((it, i) => (
                  <li key={i}>
                    <Segs segs={it} more={learn.glossaryLink} />
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            {learn.facts.length > 0 && (
              <>
                <p className="chc-facts-note">{learn.factsNote}</p>
                <ul className="chc-facts">
                  {learn.facts.map((f, i) => (
                    <li key={f.block} className="chc-fact" data-block={f.block}>
                      <span className="chc-fact-text">{f.text}</span>
                      <q className="chc-fact-quote">{f.quote}</q>
                      <span className="chc-fact-cite">
                        {learn.chips[i]} <BookCite block={f.block} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {/* Only here, with no Learn more text: "Room to invent" ends with its own looks line (owner, 2026-11-16). */}
            <p className="chc-looks">{learn.looks}</p>
          </>
        )}
      </div>
  );
}
