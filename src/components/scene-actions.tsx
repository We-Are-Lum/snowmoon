'use client';

import { useId, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { inMiniApp } from '~/lib/client-auth';

/**
 * The buttons under an adaptation's player (docs/proposals/adaptation-urls.md; the owner's mockup,
 * board "1 · Scene page" and "8 · Phone: watch"). SHARE opens a panel: the always-latest link,
 * cast it (the cast composer inside the Farcaster app) or copy it, and the fixed link of the
 * version on screen. FORK goes to the repository's "How to fork" for now. MAKE YOUR OWN is not built.
 */
export function SceneActions({
  handle,
  title,
  latestUrl,
  fixedUrl,
  forkUrl,
}: {
  handle: string;
  title: string;
  latestUrl: string;
  fixedUrl: string;
  forkUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'latest' | 'fixed' | 'failed-latest' | 'failed-fixed' | null>(null);
  const panelId = useId();
  const bare = (u: string) => u.replace(/^https?:\/\//, '');

  const copy = async (which: 'latest' | 'fixed') => {
    try {
      await navigator.clipboard.writeText(which === 'latest' ? latestUrl : fixedUrl);
      setCopied(which);
    } catch {
      setCopied(which === 'latest' ? 'failed-latest' : 'failed-fixed');
    }
  };

  const cast = async () => {
    const text = `${title}, a scene from Snowmoon`;
    if (await inMiniApp()) {
      await sdk.actions.composeCast({ text, embeds: [latestUrl] }).catch(() => {});
    } else {
      const u = new URL('https://farcaster.xyz/~/compose');
      u.searchParams.set('text', text);
      u.searchParams.append('embeds[]', latestUrl);
      window.open(u.toString(), '_blank', 'noopener');
    }
  };

  const label = (which: 'latest' | 'fixed') =>
    copied === which ? 'Copied' : copied === `failed-${which}` ? 'Hold the link to copy' : 'Copy link';

  return (
    <div className="scene-actions">
      <button
        type="button"
        className="scene-btn scene-share"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          setCopied(null);
        }}
      >
        <span>Share</span>
        <span className="scene-btn-sub">This link always shows @{handle}&rsquo;s latest chosen version</span>
      </button>

      {open && (
        <div id={panelId} className="scene-share-panel">
          <span>Always @{handle}&rsquo;s latest chosen version</span>
          <span className="scene-link">{bare(latestUrl)}</span>
          <div className="scene-share-row">
            <button type="button" className="scene-small scene-small-solid" onClick={() => copy('latest')} aria-live="polite">
              {label('latest')}
            </button>
            <button type="button" className="scene-small" onClick={cast}>
              Cast it
            </button>
          </div>
          <div className="scene-fixed">
            <span>
              This exact cut, never changes: <span className="scene-link-inline">{new URL(fixedUrl).pathname}</span>
            </span>
            <button type="button" className="scene-small scene-small-quiet" onClick={() => copy('fixed')} aria-live="polite">
              {label('fixed')}
            </button>
          </div>
        </div>
      )}

      <a className="scene-btn scene-fork" href={forkUrl}>
        <span>Fork</span>
        <span className="scene-btn-sub">Get the code and the guide to make your own version</span>
      </a>

      {/* Not built yet: visible, announced as unavailable, does nothing. */}
      <button type="button" className="scene-btn scene-soon" aria-disabled="true" onClick={(e) => e.preventDefault()}>
        <span>Make your own · soon</span>
        <span className="scene-btn-sub">Adapt another part of the book. Not ready yet.</span>
      </button>
    </div>
  );
}
