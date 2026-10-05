'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/** Like a saved card (studio.likes; never a rating). Signing in happens inside Farcaster. */
export function LikeButton({ versionId, initial }: { versionId: string; initial: number }) {
  const [likes, setLikes] = useState(initial);
  const [liked, setLiked] = useState(false);
  const [inApp, setInApp] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    sdk
      .isInMiniApp()
      .then(async (yes) => {
        if (!live) return;
        setInApp(yes);
        const res = yes ? await sdk.quickAuth.fetch(`/api/cards/${versionId}/like`) : await fetch(`/api/cards/${versionId}/like`);
        if (res.ok && live) {
          const s = (await res.json()) as { likes: number; liked: boolean };
          setLikes(s.likes);
          setLiked(s.liked);
        }
      })
      .catch(() => setInApp(false));
    return () => {
      live = false;
    };
  }, [versionId]);

  const toggle = async () => {
    if (!inApp) return setNote('Open Snowmoon in Farcaster to like cards');
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const res = await sdk.quickAuth.fetch(`/api/cards/${versionId}/like`, {
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
      {note && <span className="like-note">{note}</span>}
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
