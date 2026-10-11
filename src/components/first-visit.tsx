'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { usePathname } from 'next/navigation';
import type { Intro, IntroCard } from '~/lib/intro';
import { AiLabel } from './recipe-sheet';
import { AI_LABEL } from '~/lib/ai-declared';

/**
 * The first-visit intro (config/intro.json), built from
 * docs/design/first-visit-intro.dc.html: five cards, then the book. Skip in the
 * header on every card; swipe, tap Next and Back, or tap a progress mark.
 * Shown once, on the home page only. "Seen" is remembered in localStorage on
 * this device: no cookie, no account, nothing sent anywhere. Deep-linked pages
 * show a small "What is this?" link instead; About has "Replay intro screens".
 */
const KEY = 'snowmoon.intro-seen';
const SWIPE_PX = 50;

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

const money = (usd: number) => `$${usd.toFixed(2)}`;

/** What each card shows above its line. Real content only. */
function Visual({ card, intro }: { card: IntroCard; intro: Intro }) {
  const live = intro.features.filter((f) => f.status === 'live');
  const planned = intro.features.filter((f) => f.status === 'planned');
  const im = card.image;
  switch (card.visual) {
    case 'cover':
      return (
        <div className="iv iv-cover">
          <div className="iv-book">
            <span className="iv-kicker">A novel</span>
            <span className="iv-book-name">
              <span className="iv-book-title">{intro.cover.title}</span>
              <span className="iv-book-author">{intro.cover.author}</span>
            </span>
          </div>
          <span className="iv-chip">Open licence · {intro.cover.licence}</span>
        </div>
      );
    case 'recipe':
      return im ? (
        <div className="iv iv-recipe">
          {/* Owner, 2026-10-10: the intro's images carry the AI label too, opening the recipe sheet. It sits on
              the picture's corner, so the card's clipped height can never hide it. */}
          <div className="iv-pic">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt={im.alt} width={im.width} height={im.height} />
            <span className="iv-ai"><AiLabel kind="image" text={AI_LABEL.image} file={im.recipeFile} item={im.id} /></span>
          </div>
          <div className="iv-recipe-box">
            <span className="iv-row iv-strong">
              <span>How this was made</span>
              <span>
                ch {im.block.chapter} · ¶ {im.block.label}
              </span>
            </span>
            <span>“{im.recipe.prompt}”</span>
            <span>
              {im.recipe.model} · {im.recipe.runsOn} · {money(im.recipe.costUsd)}
            </span>
            <span>AI-generated · seeded by the project{im.recipe.publishedBy ? ` · FID ${im.recipe.publishedBy}` : ''}</span>
          </div>
        </div>
      ) : null;
    case 'record':
      return im ? (
        <div className="iv iv-record">
          <div className="iv-step">
            <span className="iv-step-mark iv-step-text" aria-hidden="true" />
            <span className="iv-step-body">
              <span className="iv-step-who">The book</span>
              <span className="iv-step-what">
                ch {im.block.chapter} · ¶ {im.block.label} · “{im.block.excerpt}”
              </span>
            </span>
          </div>
          <div className="iv-step iv-indent-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="iv-step-mark" src={im.url} alt="" width={96} height={54} />
            <span className="iv-step-body">
              <span className="iv-step-who">An image of it</span>
              <span className="iv-step-what">AI-generated, anchored to ¶ {im.block.label}</span>
              <AiLabel kind="image" text={AI_LABEL.image} file={im.recipeFile} item={im.id} />
            </span>
          </div>
          <div className="iv-step iv-indent-2">
            <span className="iv-step-mark iv-step-recipe" aria-hidden="true" />
            <span className="iv-step-body">
              <span className="iv-step-who">Its recipe</span>
              <span className="iv-step-what">
                prompt, {im.recipe.model}, settings, {money(im.recipe.costUsd)}
              </span>
            </span>
          </div>
          <p className="iv-foot">Every step public · GPL-3.0</p>
        </div>
      ) : null;
    case 'live':
      return (
        <ul className="iv iv-live">
          {live.map((f) => (
            <li key={f.label}>
              <span className="iv-dot-label">
                <span className="iv-dot" aria-hidden="true" />
                Live
              </span>
              <span className="iv-feature">{f.label}</span>
            </li>
          ))}
        </ul>
      );
    case 'planned':
      return (
        <div className="iv iv-planned">
          <ul>
            {planned.map((f) => (
              <li key={f.label}>
                <span className="iv-planned-label">Planned · not available yet</span>
                <span className="iv-feature">{f.label}</span>
              </li>
            ))}
          </ul>
          <span className="iv-stamp" aria-hidden="true">
            Planned
          </span>
        </div>
      );
  }
}

/** The screens themselves. Closing (Skip, Start reading, Escape) marks the intro seen. */
function IntroScreens({ intro, onClose }: { intro: Intro; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const n = intro.cards.length;
  const last = i === n - 1;
  useEffect(() => {
    dialog.current?.focus();
  }, [i]);
  const close = () => {
    markSeen(intro.version);
    onClose();
  };
  const go = (k: number) => setI(Math.max(0, Math.min(n - 1, k)));
  const down = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = e.clientX;
    setDx(0);
  };
  const move = (e: ReactPointerEvent) => {
    if (start.current !== null) setDx(e.clientX - start.current);
  };
  const up = () => {
    if (start.current === null) return;
    const d = dx ?? 0;
    start.current = null;
    setDx(null);
    if (d < -SWIPE_PX) go(i + 1);
    else if (d > SWIPE_PX) go(i - 1);
  };
  const card = intro.cards[i];
  return (
    <div className="intro-overlay">
      <div
        className="intro-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`intro-line-${card.id}`}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(e) => {
          // Keys from the recipe sheet (a portal, so React still bubbles them here) are the sheet's own:
          // Escape there closes the sheet, not the intro.
          if (!e.currentTarget.contains(e.target as Node)) return;
          // Nor while a sheet is open over the intro, even before focus has moved into it.
          if (document.querySelector('.sheet-overlay')) return;
          if (e.key === 'Escape') close();
          else if (e.key === 'ArrowRight') go(i + 1);
          else if (e.key === 'ArrowLeft') go(i - 1);
        }}
        data-card={card.id}
      >
        <header className="intro-head">
          <span className="intro-brand">Snowmoon</span>
          <button type="button" className="intro-skip" onClick={close}>
            Skip
          </button>
        </header>
        <div className="intro-dots">
          {intro.cards.map((c, k) => (
            <button
              key={c.id}
              type="button"
              className={k === i ? 'is-current' : undefined}
              aria-label={`Card ${k + 1} of ${n}`}
              aria-current={k === i ? 'step' : undefined}
              onClick={() => go(k)}
            />
          ))}
        </div>
        <div className="intro-viewport" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
          <div className={`intro-track${dx === null ? '' : ' is-dragging'}`} style={{ transform: `translateX(calc(${-i * 100}% + ${dx ?? 0}px))` }}>
            {intro.cards.map((c, k) => (
              <section key={c.id} className="intro-slide" data-slide={c.id} inert={k !== i} aria-hidden={k !== i}>
                <p className="intro-eyebrow">
                  {k + 1} / {n} · {c.eyebrow}
                </p>
                <Visual card={c} intro={intro} />
                <h2 className="intro-line" id={`intro-line-${c.id}`}>
                  {c.line}
                </h2>
                {k === 0 && <p className="intro-disclaimer">{intro.disclaimer}</p>}
              </section>
            ))}
          </div>
        </div>
        <footer className="intro-foot">
          {intro.modelDrafted && <p className="intro-drafted">Model-drafted wording</p>}
          <div className="intro-actions">
            <button type="button" className="intro-back" onClick={() => go(i - 1)} style={{ visibility: i === 0 ? 'hidden' : 'visible' }}>
              Back
            </button>
            {last ? (
              <button type="button" className="intro-next" onClick={close}>
                Start reading
              </button>
            ) : (
              <button type="button" className="intro-next" onClick={() => go(i + 1)}>
                Next
              </button>
            )}
          </div>
        </footer>
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

/** About, the menu and the rail: open the screens on request. */
export function ReplayIntro({ intro, label = 'Replay intro screens', className = 'replay-intro' }: { intro: Intro; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <IntroScreens intro={intro} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * On the first page of a first visit (not home or About), before the intro has been seen: a small
 * link that opens it. Gone once the reader moves on (owner, 2026-10-08); after that "What is this?"
 * is in the menu, the rail and About.
 */
const VISITED = 'snowmoon.visited';
let firstPath: string | null = null;
export function WhatIsThis({ intro }: { intro: Intro }) {
  const path = usePathname();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (firstPath === null) {
      let earlier = true;
      try {
        earlier = localStorage.getItem(VISITED) !== null;
        localStorage.setItem(VISITED, '1');
      } catch {
        /* storage blocked: treat as seen */
      }
      firstPath = earlier ? '' : path;
    }
    setShow(path === firstPath && path !== '/' && !path.startsWith('/about') && !seen(intro.version));
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

/** The bottom of About: the same five items, with the live and planned lists (board 1f). */
export function AboutEdition({ intro }: { intro: Intro }) {
  const live = intro.features.filter((f) => f.status === 'live');
  const planned = intro.features.filter((f) => f.status === 'planned');
  return (
    <section className="about-edition" aria-labelledby="about-edition">
      <h2 id="about-edition">About this edition</h2>
      {intro.modelDrafted && <p className="intro-drafted">Model-drafted wording</p>}
      <ol>
        {intro.cards.map((c, k) => (
          <li key={c.id}>
            <span className="ae-n">{String(k + 1).padStart(2, '0')}</span>
            <div className="ae-body">
              <span className="ae-head">{c.eyebrow}</span>
              <p className="ae-line">{c.line}</p>
              {c.visual === 'live' && (
                <ul className="ae-live">
                  {live.map((f) => (
                    <li key={f.label}>
                      <a href={f.href ?? '#'}>
                        <span className="iv-dot" aria-hidden="true" />
                        {f.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {c.visual === 'planned' && (
                <ul className="ae-planned">
                  {planned.map((f) => (
                    <li key={f.label}>
                      <span>{f.label}</span>
                      <span className="ae-planned-tag">Planned</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
