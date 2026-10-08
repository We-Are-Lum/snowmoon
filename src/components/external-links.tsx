'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { inMiniApp } from '~/lib/client-auth';

/**
 * Links to other sites open in a new tab (owner, 2026-10-08), so the reader keeps their place.
 * Inside a Farcaster app they go through the host's own openUrl instead, which is how a miniapp
 * leaves itself. One listener for the whole app, so links in the book's text and in server-drawn
 * pages are covered too. Left alone: links on this site, downloads, modifier-clicks (the browser's
 * own choice), and any link whose own handler already acted (the recipe sheet, cast composer).
 */
export function ExternalLinks() {
  useEffect(() => {
    let inApp = false;
    void inMiniApp().then((yes) => (inApp = yes));
    // Bubble phase on the document: React's handlers (on the root, below it) run first.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (!/^https?:$/.test(url.protocol) || url.host === window.location.host) return;
      if (inApp) {
        e.preventDefault();
        sdk.actions.openUrl(url.toString()).catch(() => window.open(url.toString(), '_blank', 'noopener'));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
