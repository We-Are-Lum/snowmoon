'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { readTo } from '~/lib/chat/device';

/**
 * The left rail at tablet and desktop widths (from the clickable prototype's desktop
 * layout; none of its markup). Phone widths and the Farcaster frame never show it.
 * - 1200px and up: open beside the page.
 * - 768–1199px: collapsed to one labelled button that opens it over the page, as a
 *   dialog: focus moves in, Tab stays inside, Escape or the scrim closes it, focus returns.
 * The chapter list uses the chapter sheet's data and marks: chapters past the furthest one
 * opened on this device are marked "not opened yet", never hidden.
 */
const LINKS = [
  { href: '/assistant', label: 'Ask' },
  { href: '/cards', label: 'Cards' },
  { href: '/adaptations', label: 'Adaptations' },
  { href: '/minpentai', label: 'Minpentai' },
  { href: '/about', label: 'About' },
];

export function SideRail({ chapters }: { chapters: { n: number; dateline: string }[] }) {
  const path = usePathname() ?? '/';
  const current = Number(path.match(/^\/chapter\/(\d+)/)?.[1] ?? 0);
  const [furthest, setFurthest] = useState(1);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => setFurthest(Math.max(readTo(), current || 1)), [current]);
  // Moving to another page closes the overlay.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a, button'));
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
  }, [open]);

  return (
    <div className="rail" data-open={open || undefined}>
      <button ref={button} type="button" className="rail-toggle" aria-expanded={open} aria-controls="rail-panel" onClick={() => setOpen(true)}>
        <span aria-hidden="true">≡</span>
        <span className="rail-toggle-label">Menu</span>
      </button>
      {open && <div className="rail-scrim" onClick={() => setOpen(false)} />}
      <nav
        ref={panel}
        id="rail-panel"
        className="rail-panel"
        aria-label="Chapters and pages"
        {...(open ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        {open && (
          <button type="button" className="rail-close" onClick={() => setOpen(false)}>
            Close
          </button>
        )}
        <ul className="rail-links">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="rail-label">
          <span>Chapters</span>
          <span>opened to {furthest}</span>
        </p>
        <ol className="rail-chapters">
          {chapters.map(({ n, dateline }) => (
            <li key={n}>
              <Link href={`/chapter/${n}`} aria-current={n === current ? 'page' : undefined} title={dateline || undefined}>
                <span>Chapter {n}</span>
                {n > furthest && <span className="rail-mark">not opened yet</span>}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
