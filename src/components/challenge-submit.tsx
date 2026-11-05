'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, useAuth, useSocialSession } from '~/lib/client-auth';
import type { SubmitWords } from '~/lib/challenge/sheet-lines';
import { PostLinkField } from './post-link-field';

/**
 * Submit (the remix challenge, owner 2026-11-04): shown only to the version's maker. A remix becomes an entry only
 * when its maker presses Submit here, with the link to a post about it on Farcaster, Bluesky or Lens; the server reads
 * the post and checks it links to this page, as "Add where you posted it" does. Up to three per person, across all
 * characters. Once submitted, the maker can withdraw it until entries close, which frees the slot. Its words come from
 * the server (`words`, src/lib/challenge/sheet-lines.ts), so this script carries none of the challenge's.
 *
 * "Post it first" (overnight run 2026-11-05, item 4): a button per network opens its own compose screen with the
 * server's short text and this page's link filled in: inside the Farcaster app the SDK's composeCast (the cast it makes
 * fills the address field); elsewhere Farcaster's compose page (farcaster.xyz/~/compose?text=…&embeds[]=…), Bluesky's
 * (bsky.app/intent/compose?text=…) and Hey's for Lens (hey.xyz/?text=…, which opens Hey's composer: read from Hey's own
 * page script, 2026-11-05). Plain links: no script or request of theirs on our page, no new sign-in scope, nothing
 * stored. The person then pastes their post's address, as before.
 */
export function ChallengeSubmit({ versionId, byFid, words: W }: { versionId: string; byFid: number; words: SubmitWords }) {
  const auth = useAuth();
  const social = useSocialSession();
  const [person, setPerson] = useState<number | null>(null);
  const [inApp, setInApp] = useState(false);
  const [origin, setOrigin] = useState('https://snowmoon.party');
  const [address, setAddress] = useState('');
  /** The cast just made in the Farcaster app (composeCast's answer), sent with Submit when no address is typed. */
  const [castHash, setCastHash] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(W.submitted);
  const [left, setLeft] = useState<number | null>(null);
  // A Farcaster maker is known on the page; a Lens or Bluesky maker by the person number the server answers with.
  const signedIn = auth.kind === 'signed-in' || social !== null;
  const mine = (auth.kind === 'signed-in' && auth.fid === byFid) || (social !== null && person === byFid);
  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false));
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    authFetch('/api/challenge/submit')
      .then((r) => (r.ok ? r.json() : null))
      .then((out: { left?: number | null; person?: number | null } | null) => {
        setLeft(typeof out?.left === 'number' ? out.left : null);
        setPerson(typeof out?.person === 'number' ? out.person : null);
      })
      .catch(() => setLeft(null));
  }, [signedIn, done]);
  if (!mine) return null;

  const page = `${origin}/references/designs/${versionId}`;
  const farcaster = (() => {
    const u = new URL('https://farcaster.xyz/~/compose');
    u.searchParams.set('text', W.postText);
    u.searchParams.append('embeds[]', page);
    return u.toString();
  })();
  const bluesky = `https://bsky.app/intent/compose?${new URLSearchParams({ text: `${W.postText} ${page}` })}`;
  const lens = `https://hey.xyz/?${new URLSearchParams({ text: `${W.postText} ${page}` })}`;
  const cast = async () => {
    const r = await sdk.actions.composeCast({ text: W.postText, embeds: [page] }).catch(() => null);
    // The cast just made: kept for Submit (nothing is sent until the person presses it).
    if (r?.cast?.hash) setCastHash(r.cast.hash);
  };

  const send = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setNote(null);
    const body = method === 'POST' ? (address.trim() || !castHash ? { versionId, url: address.trim() } : { versionId, castHash }) : { versionId };
    const r = await authFetch('/api/challenge/submit', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { error?: string; left?: number } | undefined;
    setBusy(false);
    if (r?.ok) {
      setDone(method === 'POST');
      setAddress('');
      setCastHash(null);
      setNote(method === 'POST' ? W.done : W.withdrawn);
      if (typeof out?.left === 'number') setLeft(out.left);
    } else setNote(out?.error ?? (method === 'POST' ? 'Could not submit it' : 'Could not withdraw it'));
  };

  return (
    <div className="ch-submit">
      {done ? (
        <p className="ch-mark">
          <button type="button" className="ic-secondary" onClick={() => send('DELETE')} disabled={busy}>
            {W.withdraw}
          </button>{' '}
          <span className="dz-muted">{W.withdrawNote}</span>
        </p>
      ) : (
        <form
          className="ch-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (address.trim() || castHash) void send('POST');
          }}
        >
          <p className="dz-label">{W.head}</p>
          <p className="dz-note">{W.note}</p>
          <p className="dz-label">{W.postHead}</p>
          <p className="dz-note">{W.postNote}</p>
          <div className="ia-row">
            {inApp ? (
              <button type="button" className="ia-button" onClick={cast}>
                {W.postOn.farcaster}
              </button>
            ) : (
              <a className="ia-button" href={farcaster} target="_blank" rel="noopener noreferrer">
                {W.postOn.farcaster}
              </a>
            )}
            <a className="ia-button" href={bluesky} target="_blank" rel="noopener noreferrer">
              {W.postOn.bluesky}
            </a>
            <a className="ia-button" href={lens} target="_blank" rel="noopener noreferrer">
              {W.postOn.lens}
            </a>
          </div>
          <PostLinkField id={`submit-${versionId}`} label={W.label} value={address} onChange={setAddress} />
          <button type="submit" className="ic-primary" disabled={busy || !(address.trim() || castHash) || left === 0}>
            {W.submit}
          </button>
        </form>
      )}
      {left !== null && <p className="dz-note">{W.left[left] ?? W.left[W.left.length - 1]}</p>}
      {note && (
        <p className="ia-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
