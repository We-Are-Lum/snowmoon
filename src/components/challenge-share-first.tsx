'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Share first (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S4): right under a challenge picture, the
 * post buttons (Farcaster, Bluesky, Lens, Copy link) with the ready post shown as it will be filled in: the server's
 * short text and this page's link. Each opens that network's own compose screen (inside the Farcaster app, the SDK's
 * composeCast); plain links, no script or request of theirs on our page (P6a), nothing posted or stored by us. A cast
 * made in the Farcaster app is handed to Submit below (`onCast`), so Submit is one tap there. Every word comes from the
 * server (`w`).
 */
export type ShareFirstWords = { head: string; text: string; copy: string; copied: string; on: { farcaster: string; bluesky: string; lens: string } };

export function ChallengeShareFirst({ path, w, onCast }: { path: string; w: ShareFirstWords; onCast?: (hash: string) => void }) {
  const [inApp, setInApp] = useState(false);
  const [origin, setOrigin] = useState('https://snowmoon.party');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false));
    setOrigin(window.location.origin);
  }, []);
  const link = `${origin}${path}`;
  const farcaster = (() => {
    const u = new URL('https://farcaster.xyz/~/compose');
    u.searchParams.set('text', w.text);
    u.searchParams.append('embeds[]', link);
    return u.toString();
  })();
  const bluesky = `https://bsky.app/intent/compose?${new URLSearchParams({ text: `${w.text} ${link}` })}`;
  const lens = `https://hey.xyz/?${new URLSearchParams({ text: `${w.text} ${link}` })}`;
  const cast = async () => {
    const r = await sdk.actions.composeCast({ text: w.text, embeds: [link] }).catch(() => null);
    if (r?.cast?.hash) onCast?.(r.cast.hash);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="sf-share" aria-labelledby="sf-head">
      <h2 id="sf-head" className="sf-head">
        {w.head}
      </h2>
      <div className="sf-buttons">
        {inApp ? (
          <button type="button" className="ia-button sf-button" onClick={cast}>
            {w.on.farcaster}
          </button>
        ) : (
          <a className="ia-button sf-button" href={farcaster} target="_blank" rel="noopener noreferrer">
            {w.on.farcaster}
          </a>
        )}
        <a className="ia-button sf-button" href={bluesky} target="_blank" rel="noopener noreferrer">
          {w.on.bluesky}
        </a>
        <a className="ia-button sf-button" href={lens} target="_blank" rel="noopener noreferrer">
          {w.on.lens}
        </a>
        <button type="button" className="ia-button sf-button" onClick={copy}>
          {copied ? w.copied : w.copy}
        </button>
      </div>
      <p className="sf-ready">
        “{w.text}” <span className="sf-link">{link}</span>
      </p>
    </section>
  );
}
