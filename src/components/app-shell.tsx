'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { readingPlace } from '~/lib/glossary-view';
import { sdk } from '@farcaster/miniapp-sdk';
import { inMiniApp, signOut, useAuth, type AuthState } from '~/lib/client-auth';
import { lastChapter, openedChapters } from '~/lib/chat/device';
import { COMING, navItems, type NavItem } from '~/lib/nav';
import type { Intro } from '~/lib/intro';
import { Assistant } from './assistant';
import { ReplayIntro } from './first-visit';
import { ExternalLinks } from './external-links';
import { LegalLine } from './legal-line';
import { SignInButton } from './sign-in';
import { ThemeSwitch } from './theme-switch';
import '../app/assistant/assistant.css';

/**
 * The app's frame, from the clickable prototype (structure, spacing, type), with real controls:
 * - under 768px (phones, the Farcaster frame): a top bar "× Snowmoon ? ☰"; ? is About, ☰ opens the menu sheet;
 * - 768–1199px: the rail collapsed to its expand control, opening over the page;
 * - 1200px and up: the rail open (wordmark, collapse, the destinations, the chapters with their
 *   state, theme, account) and the assistant beside the page, always there unless closed.
 * Tells the Farcaster host the app is ready (once).
 */
export function AppShell({ chapters, adaptations, intro, children }: { chapters: number; adaptations: number; intro: Intro; children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const auth = useAuth();
  const [menu, setMenu] = useState(false);
  const [railOpen, setRailOpen] = useState(false); // tablet overlay
  const [collapsed, setCollapsed] = useState(false); // desktop, remembered
  const [panel, setPanel] = useState(true);
  const [inApp, setInApp] = useState(false);
  const [last, setLast] = useState(1);
  const [opened, setOpened] = useState<Set<number>>(new Set());

  useEffect(() => {
    void inMiniApp().then((yes) => {
      setInApp(yes);
      if (yes) sdk.actions.ready().catch(() => {});
    });
    try {
      setCollapsed(localStorage.getItem('snowmoon.rail') === 'collapsed');
      setPanel(localStorage.getItem('snowmoon.panel') !== 'closed');
    } catch {
      /* defaults */
    }
  }, []);
  useEffect(() => {
    setLast(lastChapter());
    setOpened(openedChapters());
    setMenu(false);
    setRailOpen(false);
  }, [path]);

  // Tablet: the rail opens over the page as a dialog: focus in, Tab kept inside, Escape closes, focus back.
  const rail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!railOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    rail.current?.querySelector<HTMLElement>('.rail-body a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false);
      if (e.key !== 'Tab' || !rail.current) return;
      const els = Array.from(rail.current.querySelectorAll<HTMLElement>('a, button, input'));
      if (e.shiftKey && document.activeElement === els[0]) (e.preventDefault(), els[els.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === els[els.length - 1]) (e.preventDefault(), els[0].focus());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [railOpen]);

  const remember = (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* not remembered */
    }
  };
  const current = Number(path.match(/^\/chapter\/(\d+)/)?.[1] ?? 0);
  const items = navItems(last, adaptations);
  const showPanel = panel && !path.startsWith('/assistant');

  return (
    <div className={`shell${collapsed ? ' rail-collapsed' : ''}${showPanel ? ' with-panel' : ''}`}>
      <header className="topbar">
        {path.startsWith('/assistant') ? (
          <Link href={`/chapter/${last}`} className="topbar-icon" aria-label={`Back to Chapter ${last}`}>
            ←
          </Link>
        ) : inApp ? (
          <button type="button" className="topbar-icon" aria-label="Close Snowmoon" onClick={() => sdk.actions.close().catch(() => {})}>
            ×
          </button>
        ) : (
          <span className="topbar-icon" aria-hidden="true" />
        )}
        {path.startsWith('/assistant') ? (
          <span className="topbar-title">Assistant</span>
        ) : (
          <Link href="/" className="topbar-title">
            Snowmoon
          </Link>
        )}
        <span className="topbar-end">
          <Link href="/about" className="topbar-icon topbar-about" aria-label="About" title="About" aria-current={path.startsWith('/about') ? 'page' : undefined}>
            ?
          </Link>
          <button type="button" className="topbar-icon" aria-label="Menu" title="Menu" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}>
            <svg className="menu-glyph" width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </span>
      </header>

      <aside
        ref={rail}
        className={`rail${railOpen ? ' is-open' : ''}`}
        aria-label="Chapters and pages"
        {...(railOpen ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        <div className="rail-head">
          <Link href="/" className="rail-wordmark">
            Snowmoon
          </Link>
          <button
            type="button"
            className="rail-collapse"
            aria-label={collapsed || !railOpen ? 'Expand the sidebar' : 'Collapse the sidebar'}
            onClick={() => {
              if (window.matchMedia('(min-width: 1200px)').matches) {
                setCollapsed(!collapsed);
                remember('snowmoon.rail', collapsed ? null : 'collapsed');
              } else setRailOpen(!railOpen);
            }}
          >
            <span className="rail-collapse-open" aria-hidden="true">
              «
            </span>
            <span className="rail-collapse-closed" aria-hidden="true">
              »
            </span>
          </button>
        </div>
        <div className="rail-body">
          <div className="rail-nav">
            <Nav items={items} path={path} current={current} />
          </div>
          <p className="rail-label">
            <span>Chapters</span>
            <span>Read to {Math.max(...opened, 1)}</span>
          </p>
          <ol className="rail-chapters">
            {Array.from({ length: chapters }, (_, i) => i + 1).map((n) => {
              const state = n === last ? 'Reading' : opened.has(n) ? 'Read' : null;
              return (
                <li key={n}>
                  <Link href={`/chapter/${n}`} aria-current={n === current ? 'page' : undefined} className={state ? undefined : 'is-unread'}>
                    <span>Chapter {n}</span>
                    {state ? <span className="rail-mark">{state}</span> : <span className="as-visually-hidden">not opened yet</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="rail-extra">
            <ThemeSwitch name="theme-rail" />
            <ReplayIntro intro={intro} label="What is this?" className="quiet-action" />
            <Link href="/about" className="quiet-action" aria-current={path.startsWith('/about') ? 'page' : undefined}>
              About
            </Link>
          </div>
          <LegalLine />
        </div>
        <Account auth={auth} />
      </aside>
      {railOpen && <div className="rail-scrim" onClick={() => setRailOpen(false)} />}

      <div className="shell-main">{children}</div>

      {showPanel ? (
        <aside className="panel" aria-label="Assistant">
          <div className="panel-head">
            <button type="button" className="panel-close" aria-label="Close the assistant" onClick={() => (setPanel(false), remember('snowmoon.panel', 'closed'))}>
              ×
            </button>
            <p className="panel-title">Assistant</p>
          </div>
          <div className="panel-body">
            <Assistant embedded />
          </div>
        </aside>
      ) : (
        !path.startsWith('/assistant') && (
          <button type="button" className="panel-reopen" onClick={() => (setPanel(true), remember('snowmoon.panel', null))}>
            Assistant ⟩
          </button>
        )
      )}

      <ExternalLinks />
      {menu && <MenuSheet items={items} path={path} current={current} auth={auth} intro={intro} onClose={() => setMenu(false)} />}
    </div>
  );
}

function Nav({ items, path, current }: { items: ReturnType<typeof navItems>; path: string; current: number }) {
  const router = useRouter();
  // The glossary, opened from a chapter, remembers the block at the top of the screen so its "Back" returns there.
  const toGlossary = (e: React.MouseEvent) => {
    const from = current > 0 ? readingPlace() : null;
    if (!from) return;
    e.preventDefault();
    router.push(`/glossary?from=${from}`);
  };
  const isActive = (it: NavItem) =>
    it.key === 'read' ? current > 0 : it.key === 'listen' ? false : path.startsWith(it.href.split('#')[0]);
  const link = (it: NavItem) => (
    <Link href={it.href} aria-current={isActive(it) ? 'page' : undefined} onClick={it.key === 'glossary' ? toGlossary : undefined}>
      <span>{it.label}</span>
      {it.meta && <span className="nav-meta">{it.meta}</span>}
    </Link>
  );
  return (
    <>
      <ul className="nav-list">
        {items.map((it) =>
          it.children ? (
            <li key={it.key} className="nav-group">
              <span className="nav-group-label" id={`nav-${it.key}`}>
                {it.label}
              </span>
              <ul className="nav-sub" aria-labelledby={`nav-${it.key}`}>
                {it.children.map((c) => (
                  <li key={c.key}>{link(c)}</li>
                ))}
              </ul>
            </li>
          ) : (
            <li key={it.key}>{link(it)}</li>
          ),
        )}
      </ul>
      {COMING.map((c) => (
        <p key={c.label} className="nav-coming">
          <span>{c.label}</span>
          <span className="nav-meta">{c.meta}</span>
        </p>
      ))}
    </>
  );
}

function Account({ auth }: { auth: AuthState }) {
  return (
    <div className="account">
      {auth.kind === 'signed-in' ? (
        <>
          <span className="account-name">{auth.username ? `@${auth.username}` : `FID ${auth.fid}`}</span>
          {auth.via === 'website' && (
            <button type="button" className="account-action" onClick={signOut}>
              Sign out
            </button>
          )}
        </>
      ) : auth.kind === 'signed-out' ? (
        <>
          <span className="account-name">Signed out</span>
          <SignInButton className="account-action" label="Sign in" />
        </>
      ) : (
        <span className="account-name">…</span>
      )}
    </div>
  );
}

function MenuSheet({ items, path, current, auth, intro, onClose }: { items: ReturnType<typeof navItems>; path: string; current: number; auth: AuthState; intro: Intro; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useCallback(onClose, [onClose]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !sheet.current) return;
      const els = Array.from(sheet.current.querySelectorAll<HTMLElement>('a, button, input'));
      if (e.shiftKey && document.activeElement === els[0]) (e.preventDefault(), els[els.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === els[els.length - 1]) (e.preventDefault(), els[0].focus());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [close]);
  return (
    <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={sheet} className="menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <p id="menu-title" className="menu-eyebrow">
          Snowmoon
        </p>
        <button type="button" className="sheet-x menu-close" aria-label="Close the menu" onClick={close}>
          ×
        </button>
        <Nav items={items} path={path} current={current} />
        <div className="menu-extra">
          <ThemeSwitch name="theme-menu" />
          <ReplayIntro intro={intro} label="What is this?" className="quiet-action" />
          <Account auth={auth} />
          <LegalLine />
        </div>
      </div>
    </div>
  );
}
