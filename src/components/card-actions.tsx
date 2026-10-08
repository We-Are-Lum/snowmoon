'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, useAuth } from '~/lib/client-auth';
import { SignInButton } from './sign-in';

/** Like a saved card (studio.likes; never a rating). Signed in through Farcaster, in its app or on the website. */
export function LikeButton({ versionId, initial }: { versionId: string; initial: number }) {
  const [likes, setLikes] = useState(initial);
  const [liked, setLiked] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const auth = useAuth();

  useEffect(() => {
    // Ask once, after sign-in has settled (signed in: the count and whether you liked it).
    if (auth.kind === 'loading') return;
    let live = true;
    void authFetch(`/api/cards/${versionId}/like`)
      .then(async (res) => {
        if (res.ok && live) {
          const s = (await res.json()) as { likes: number; liked: boolean };
          setLikes(s.likes);
          setLiked(s.liked);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [versionId, auth.kind]);

  const toggle = async () => {
    if (auth.kind !== 'signed-in') return setNote('sign-in');
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const res = await authFetch(`/api/cards/${versionId}/like`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ like: next }),
    });
    if (res.ok) {
      const s = (await res.json()) as { likes: number; liked: boolean };
      setLikes(s.likes);
      setLiked(s.liked);
    } else {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      setNote(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not record the like');
    }
  };

  return (
    <span className="like">
      <button type="button" className={`like-button${liked ? ' is-liked' : ''}`} onClick={toggle} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
        {liked ? '♥' : '♡'} {likes}
      </button>
      {note === 'sign-in' ? (
        <span className="like-note">
          <SignInButton className="like-sign-in" label="Sign in to like" />
        </span>
      ) : (
        note && <span className="like-note">{note}</span>
      )}
    </span>
  );
}

/** Cast a saved card's page; its likes and the cast both point at the same card. */
export function CastCardButton({ path, chapter }: { path: string; chapter: number }) {
  const cast = async () => {
    const url = `${window.location.origin}${path}`;
    const text = `From Snowmoon, Chapter ${chapter}`;
    if (await sdk.isInMiniApp().catch(() => false)) {
      await sdk.actions.composeCast({ text, embeds: [url] });
    } else {
      const u = new URL('https://farcaster.xyz/~/compose');
      u.searchParams.set('text', text);
      u.searchParams.append('embeds[]', url);
      window.open(u.toString(), '_blank', 'noopener');
    }
  };
  return (
    <button type="button" className="cast-card" onClick={cast}>
      Cast
    </button>
  );
}
