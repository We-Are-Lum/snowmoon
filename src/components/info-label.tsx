'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';

/**
 * A short visible word with ⓘ, opening the details (owner ruling, 2026-10-09: "a short visible
 * word, with ⓘ for the details. An icon alone doesn't count."). The whole declaration is also in
 * the page as served, visually hidden inside the button, so it is part of its accessible name and
 * crawlers read it. check:principles (P2g, P8f) require the word and plant a missing one.
 *
 * Used for: "Redrawn" (a screen redrawn from a template), "AI description" (Listen, while a
 * spoken description plays), and Minpentai's "Invented", "Draft" and "Book".
 */
export function InfoLabel({
  word,
  kind,
  declaration,
  title,
  body,
  links = [],
  className = '',
}: {
  /** The short visible word: "Redrawn", "AI description", "Invented", "Draft", "Book". */
  word: string;
  /** For checks and styling: data-label. */
  kind: 'redrawn' | 'ai-description' | 'invented' | 'draft' | 'book';
  /** The full declaration, in one sentence; read by screen readers with the word. */
  declaration: string;
  title: string;
  body: string[];
  links?: { href: string; label: string; external?: boolean }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" className={`info-label ${className}`.trim()} data-label={kind} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="info-word">{word}</span>
        <svg className="info-i" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 5.2v3.6M6 3.2v.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="sr-only"> ({declaration})</span>
      </button>
      {open && <InfoSheet title={title} body={body} links={links} onClose={() => { setOpen(false); opener.current?.focus(); }} />}
    </>
  );
}

function InfoSheet({ title, body, links, onClose }: { title: string; body: string[]; links: { href: string; label: string; external?: boolean }[]; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('button, a')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="recipe-sheet info-sheet" role="dialog" aria-modal="true" aria-labelledby="info-sheet-title">
        <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>×</button>
        <p id="info-sheet-title" className="info-sheet-title">{title}</p>
        {body.map((p) => <p key={p} className="info-sheet-text">{p}</p>)}
        {links.length > 0 && (
          <p className="info-sheet-links">
            {links.map((l) => (l.external ? <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label}</a> : <Link key={l.href} href={l.href}>{l.label}</Link>))}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
