'use client';

import Link from 'next/link';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import type { PictureView } from '~/lib/challenge/picture-view';
import { AiTag } from './ai-tag';
import { ChallengeSubmit } from './challenge-submit';
import { PostedOn } from './posted-on';

/**
 * A challenge picture's page, /challenge/p/<version> (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3
 * S4–S5): the picture with its AI label, its character and moment, who made it and their words; for its maker, Submit
 * (one a day; paste the post's address, option B) with the owner's one line and "Rules"; "Posted on"; and small links
 * to how it was made, every entry and making another. "✕" goes to the hub at the character's card. Publishing replaced
 * the preview with this page, so back never returns to a publish button. Every word comes from the server
 * (src/lib/challenge/picture-view.ts).
 */
export function ChallengePicture({ id }: { id: string }) {
  const [v, setV] = useState<PictureView | null | 'missing'>(null);
  useEffect(() => {
    authFetch(`/api/challenge/picture?id=${encodeURIComponent(id)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as PictureView) : 'missing'))
      .then(setV)
      .catch(() => setV('missing'));
  }, [id]);
  if (v === 'missing') return <NotFound />;
  if (!v) return <div className="mk-page" aria-busy="true" />;
  const hub = `/challenge#${v.character}`;
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
      <h1 className="mk-title">{v.title}</h1>
      <p className="dz-muted mk-by">{v.by}</p>
      {v.words && (
        <p className="mk-words">
          <span className="dz-muted">{v.w.wordsHead}:</span> “{v.words}”
        </p>
      )}
      {v.note && <p className="dz-muted">{v.note}</p>}
      {v.submit && <ChallengeSubmit versionId={v.versionId} byFid={v.byFid} words={v.submit} path={`/challenge/p/${v.versionId}`} />}
      <p className="mk-signin-line">
        {v.w.signInLine} <Link href="/challenge/rules">{v.w.rules}</Link>
      </p>
      {v.posts.length > 0 && <PostedOn versionId={v.versionId} posts={v.posts} />}
      <p className="mk-links">
        <Link href={`/image/${v.versionId}`}>{v.w.recipe}</Link> · <Link href="/challenge/entries">{v.w.every}</Link> · <Link href={hub}>{v.w.another}</Link>
      </p>
    </div>
  );
}
