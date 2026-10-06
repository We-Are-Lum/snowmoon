'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Intro } from '~/lib/intro';

/**
 * The first-visit intro (config/intro.json). Shown once, on the home page only.
 * "Seen" is remembered in localStorage on this device: no cookie, no account,
 * nothing sent anywhere. A link that opens a passage, card or adaptation goes
 * straight there; those pages show a small "What is this?" link instead.
 */
const KEY = 'snowmoon.intro-seen';

function seen(version: string): boolean {
  try {
    return localStorage.getItem(KEY) === version;
  } catch {
    return true; // storage blocked: never trap anyone in the intro
  }
}

function markSeen(version: string) {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    /* storage blocked: nothing to remember */
  }
}

export function IntroOnce({ intro }: { intro: Intro }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!seen(intro.version)) setOpen(true);
  }, [intro.version]);
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open, i]);

  if (!open) return null;
  const close = () => {
    markSeen(intro.version);
    setOpen(false);
  };
  const card = intro.cards[i];
  const last = i === intro.cards.length - 1;
  return (
    <div className="intro-overlay">
      <div
        className="intro-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        data-card={card.id}
      >
        {card.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image.url} alt={card.image.alt} width={card.image.width} height={card.image.height} />
        )}
        <p className="label intro-count">
          {i + 1} of {intro.cards.length}
          {card.status === 'coming' ? ' · coming' : ''}
        </p>
        <h2 id="intro-title">{card.title}</h2>
        <p>{card.sentence}</p>
        {intro.modelDrafted && <p className="label intro-drafted">Model-drafted text</p>}
        <div className="intro-actions">
          <button type="button" className="intro-skip" onClick={close}>
            Skip
          </button>
          {last ? (
            <button type="button" onClick={close}>
              Start reading
            </button>
          ) : (
            <button type="button" onClick={() => setI(i + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** On any page but home and About, before the intro has been seen: a small link to it. */
export function WhatIsThis({ version }: { version: string }) {
  const path = usePathname();
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(path !== '/' && !path.startsWith('/about') && !seen(version));
  }, [path, version]);
  if (!show) return null;
  return (
    <Link href="/about#intro" className="what-is-this" onClick={() => markSeen(version)}>
      What is this?
    </Link>
  );
}
