'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Intro } from '~/lib/intro';

/**
 * The first-visit intro (config/intro.json). Shown once, on the home page only.
 * "Seen" is remembered in localStorage on this device: no cookie, no account,
 * nothing sent anywhere. A link that opens a passage, card or adaptation goes
 * straight there; those pages show a small "What is this?" link instead,
 * which opens the same screens. About has a "Replay intro screens" link.
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

/** The screens themselves. Closing (Skip, Start reading, Escape) marks the intro seen. */
function IntroScreens({ intro, onClose }: { intro: Intro; onClose: () => void }) {
  const [i, setI] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, [i]);
  const close = () => {
    markSeen(intro.version);
    onClose();
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

/** Home page, first visit only. */
export function IntroOnce({ intro }: { intro: Intro }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!seen(intro.version)) setOpen(true);
  }, [intro.version]);
  return open ? <IntroScreens intro={intro} onClose={() => setOpen(false)} /> : null;
}

/** About: replay the screens on request. */
export function ReplayIntro({ intro }: { intro: Intro }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="replay-intro" onClick={() => setOpen(true)}>
        Replay intro screens
      </button>
      {open && <IntroScreens intro={intro} onClose={() => setOpen(false)} />}
    </>
  );
}

/** On any page but home and About, before the intro has been seen: a small link that opens it. */
export function WhatIsThis({ intro }: { intro: Intro }) {
  const path = usePathname();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setShow(path !== '/' && !path.startsWith('/about') && !seen(intro.version));
  }, [path, intro.version]);
  if (!show && !open) return null;
  return (
    <>
      {show && (
        <button type="button" className="what-is-this" onClick={() => setOpen(true)}>
          What is this?
        </button>
      )}
      {open && (
        <IntroScreens
          intro={intro}
          onClose={() => {
            setOpen(false);
            setShow(false);
          }}
        />
      )}
    </>
  );
}
