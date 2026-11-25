'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';

/**
 * Share an outline (owner, 2026-11-24: "offer sharing after Submit"; no post link is needed to enter). Inside the
 * Farcaster app, composeCast; elsewhere, plain links to each network's own compose page, so no script or request of
 * theirs is on our page (P6a); and Copy link. Nothing is recorded about sharing.
 */
export function EpisodeShare({ id, mine }: { id: string; mine: boolean }) {
  const [inApp, setInApp] = useState(false);
  const [origin, setOrigin] = useState('https://snowmoon.party');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false));
    setOrigin(window.location.origin);
  }, []);
  const url = `${origin}/challenge/episode-1/o/${id}`;
  const text = mine ? W.shareText : W.shareTextOthers;
  const farcaster = (() => {
    const u = new URL('https://farcaster.xyz/~/compose');
    u.searchParams.set('text', text);
    u.searchParams.append('embeds[]', url);
    return u.toString();
  })();
  const bluesky = `https://bsky.app/intent/compose?${new URLSearchParams({ text: `${text} ${url}` })}`;
  const lens = `https://hey.xyz/?${new URLSearchParams({ text: `${text} ${url}` })}`;
  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => null);
    setCopied(true);
  };
  return (
    <section className="ep-panel ep-share" aria-labelledby={`ep-share-${id}`}>
      <p className="ep-goals-head" id={`ep-share-${id}`}>
        {W.shareHead}
      </p>
      <p className="ep-btns">
        {inApp ? (
          <button type="button" className="ep-btn" onClick={() => void sdk.actions.composeCast({ text, embeds: [url] }).catch(() => null)}>
            Farcaster
          </button>
        ) : (
          <a className="ep-btn" href={farcaster} target="_blank" rel="noopener noreferrer">
            Farcaster
          </a>
        )}
        <a className="ep-btn" href={bluesky} target="_blank" rel="noopener noreferrer">
          Bluesky
        </a>
        <a className="ep-btn" href={lens} target="_blank" rel="noopener noreferrer">
          Lens
        </a>
        <button type="button" className="ep-btn" onClick={() => void copy()}>
          {copied ? W.copied : W.copyLink}
        </button>
      </p>
      <p className="ep-small">{W.shareNote}</p>
    </section>
  );
}
