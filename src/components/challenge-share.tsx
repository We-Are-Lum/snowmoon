'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { PostLinkField } from './post-link-field';

/**
 * Share a version (the remix challenge, owner 2026-10-31): Farcaster, Bluesky and Lens, each prefilled with the page's
 * link. Inside the Farcaster app, composeCast; its answer carries the new cast's hash (@farcaster/miniapp-sdk 0.3.0:
 * { cast: { hash } | null }), which is added to "Posted on" when that is on. Elsewhere, plain links to each network's
 * own compose page: no script or request of theirs on our page (P6a).
 * Then, when CHALLENGE.posts is on, "Add where you posted it".
 */
export function ChallengeShare({ versionId, what, posts }: { versionId: string; what: string; posts: boolean }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const [inApp, setInApp] = useState(false);
  const [origin, setOrigin] = useState('https://snowmoon.party');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false));
    setOrigin(window.location.origin);
  }, []);
  const url = `${origin}/references/designs/${versionId}`;
  const text = W.shareText(what);
  const signedIn = auth.kind === 'signed-in' || wallet !== null;

  const add = async (payload: { url: string } | { castHash: string }) => {
    setBusy(true);
    setNote(null);
    const res = await authFetch('/api/challenge/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId, ...payload }) }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { added?: boolean; error?: string } | undefined;
    setBusy(false);
    if (res?.ok) {
      setAddress('');
      setNote(out?.added ? W.added : W.already);
    } else setNote(out?.error ?? 'Could not add it');
  };

  const cast = async () => {
    const r = await sdk.actions.composeCast({ text, embeds: [url] }).catch(() => null);
    if (posts && signedIn && r?.cast?.hash) await add({ castHash: r.cast.hash });
  };
  const farcaster = (() => {
    const u = new URL('https://farcaster.xyz/~/compose');
    u.searchParams.set('text', text);
    u.searchParams.append('embeds[]', url);
    return u.toString();
  })();
  const bluesky = `https://bsky.app/intent/compose?${new URLSearchParams({ text: `${text} ${url}` })}`;
  const lens = `https://hey.xyz/?${new URLSearchParams({ text: `${text} ${url}` })}`;

  return (
    <section className="dz-section ch-share" aria-labelledby={`share-${versionId}`}>
      <p className="dz-label" id={`share-${versionId}`}>
        {W.shareHead}
      </p>
      <div className="ia-row">
        {inApp ? (
          <button type="button" className="ia-button" onClick={cast}>
            Farcaster
          </button>
        ) : (
          <a className="ia-button" href={farcaster} target="_blank" rel="noopener noreferrer" aria-label={W.shareOn('Farcaster')}>
            Farcaster
          </a>
        )}
        <a className="ia-button" href={bluesky} target="_blank" rel="noopener noreferrer" aria-label={W.shareOn('Bluesky')}>
          Bluesky
        </a>
        <a className="ia-button" href={lens} target="_blank" rel="noopener noreferrer" aria-label={W.shareOn('Lens')}>
          Lens
        </a>
      </div>
      <p className="ia-note ch-guidance">{W.guidance}</p>
      {posts && signedIn && (
        <form
          className="ch-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (address.trim()) void add({ url: address.trim() });
          }}
        >
          <p className="dz-label">{W.addHead}</p>
          <PostLinkField id={`post-${versionId}`} label={W.addLabel} value={address} onChange={setAddress} />
          <button type="submit" className="ic-secondary" disabled={busy || !address.trim()}>
            {W.addButton}
          </button>
        </form>
      )}
      {note && (
        <p className="ia-note" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
