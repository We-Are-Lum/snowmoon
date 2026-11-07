'use client';

import Link from 'next/link';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { useEffect, useState } from 'react';
import { authFetch, socialSessionPerson, useAuth, useSocialSession } from '~/lib/client-auth';
import type { PictureView } from '~/lib/challenge/picture-view';
import { AiTag } from './ai-tag';
import { ChallengeShareFirst } from './challenge-share-first';
import { ChallengeSubmit } from './challenge-submit';
import { PostedOn } from './posted-on';

/**
 * A challenge picture's page, /challenge/p/<version>, share first (owner, 2026-11-05; docs/proposals/challenge-moments.md
 * §1.3 S4–S5): the picture with its AI label; then, before anything else, the post buttons with the ready post (for its
 * maker: "Published. Now post it:"); then "Then submit it as an entry · one a day" with Submit (paste the post's
 * address, option B; a cast just made in the Farcaster app fills it), the owner's one line ("Sign in with Farcaster,
 * Lens or Bluesky to enter.") and "Rules"; then the character and moment, who made it and their words, "Posted on", and
 * small links to how it was made, every entry and making another. "✕" goes to the hub at the character's card.
 * Publishing replaced the preview with this page, so back never returns to a publish button. Every word comes from the
 * server (src/lib/challenge/picture-view.ts).
 */
export function ChallengePicture({ id }: { id: string }) {
  const auth = useAuth();
  const social = useSocialSession();
  const [v, setV] = useState<PictureView | null | 'missing'>(null);
  const [castHash, setCastHash] = useState<string | null>(null);
  useEffect(() => {
    authFetch(`/api/challenge/picture?id=${encodeURIComponent(id)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as PictureView) : 'missing'))
      .then(setV)
      .catch(() => setV('missing'));
  }, [id]);
  if (v === 'missing') return <NotFound />;
  if (!v) return <div className="mk-page" aria-busy="true" />;
  const hub = `/challenge#${v.character}`;
  const path = `/challenge/p/${v.versionId}`;
  // Its maker: a Farcaster FID, or a Lens or Bluesky account's person number (minus 1e9 + the account, as the server
  // numbers them, src/lib/people.ts), read from the signed session the device holds.
  const mine = (auth.kind === 'signed-in' && auth.fid === v.byFid) || (social !== null && socialSessionPerson(social.token) === v.byFid);
  const signedIn = auth.kind === 'signed-in' || social !== null;
  // Until the sign-in is known, neither the maker's "Post it" nor a visitor's "Remix this" (no flash of the wrong one).
  const known = auth.kind !== 'loading';
  return (
    <div className="mk-page" data-step="published">
      <nav className="mk-bar mk-bar-end">
        <Link className="mk-close" href={hub} aria-label={v.w.close}>
          ✕
        </Link>
      </nav>
      <figure className="mk-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mk-picture" src={v.url} alt={v.alt} />
        <figcaption className="mk-cap">
          <AiTag /> {v.badge && <span className="ch-badge">{v.badge}</span>}
        </figcaption>
      </figure>
      {known && mine && <ChallengeShareFirst path={path} w={{ head: v.w.published, text: v.w.postText, copy: v.w.copy, copied: v.w.copied, on: v.w.on }} onCast={setCastHash} />}
      {/* Anyone else (owner, 2026-11-07): "Remix this" first, not "Post it"; sharing it never says "My remix". */}
      {known && !mine && (
        <>
          {v.remixHref && (
            <Link className="rl-remix mk-remix-this" href={v.remixHref}>
              {v.w.remixThis}
            </Link>
          )}
          <ChallengeShareFirst path={path} w={{ head: null, text: v.w.othersText, copy: v.w.copy, copied: v.w.copied, on: v.w.on }} />
        </>
      )}
      {v.submit && (
        <section className="sf-submit" aria-label={v.w.thenSubmit}>
          <ChallengeSubmit
            versionId={v.versionId}
            byFid={v.byFid}
            words={v.submit}
            path={path}
            compact
            castHash={castHash}
            before={
              <h2 className="sf-head">
                {v.w.thenSubmit} <span className="dz-muted">· {v.w.oneADay}</span>
              </h2>
            }
          />
        </section>
      )}
      {!signedIn && (
        <p className="mk-signin-line">
          {v.w.signInLine} <Link href="/challenge/rules">{v.w.rules}</Link>
        </p>
      )}
      <h1 className="mk-title">{v.title}</h1>
      <p className="dz-muted mk-by">{v.by}</p>
      {v.words && (
        <p className="mk-words">
          <span className="dz-muted">{v.w.wordsHead}:</span> “{v.words}”
        </p>
      )}
      {v.note && <p className="dz-muted">{v.note}</p>}
      {v.posts.length > 0 && <PostedOn versionId={v.versionId} posts={v.posts} />}
      <p className="mk-links">
        <Link href={`/image/${v.versionId}`}>{v.w.recipe}</Link> · <Link href="/challenge/entries">{v.w.every}</Link> · <Link href={hub}>{v.w.another}</Link>
      </p>
    </div>
  );
}
