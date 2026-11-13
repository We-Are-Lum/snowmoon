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
import { AdminExampleLabel } from './admin-example-label';
import { BackstoryShown } from './challenge-backstory';

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
    <div className="mk-page chp" data-step="published">
      <nav className="mk-bar chp-bar">
        <Link className="chp-back" href={`/challenge/${v.character}`}>
          ← {v.name}
        </Link>
        <Link className="mk-close" href={hub} aria-label={v.w.close}>
          ✕
        </Link>
      </nav>
      <div className="chp-grid">
        <figure className="mk-figure chp-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mk-picture chp-img" src={v.url} alt={v.alt} />
          <figcaption className="mk-cap chp-cap">
            <AiTag />{v.aiMaker && <span className="chp-ai-maker"> · {v.aiMaker}</span>} {v.badge && <span className="ch-badge">{v.badge}</span>}
            {v.example && <AdminExampleLabel label={v.example.label} info={v.example.info} />}
          </figcaption>
        </figure>
        <div className="chp-side">
          {/* Its backstory, under the picture (owner, 2026-11-09): invented by its maker, not from the book. */}
          {v.backstory && <BackstoryShown backstory={v.backstory} maker={v.maker} />}
          {known && mine && <ChallengeShareFirst path={path} w={{ head: v.w.published, texts: v.w.postTexts, copy: v.w.copy, copied: v.w.copied, on: v.w.on }} onCast={setCastHash} />}
          {/* Anyone else (owner, 2026-11-07): "Remix this" first, not "Post it"; sharing it never says "My remix". */}
          {known && !mine && (
            <>
              {v.remixHref && (
                <Link className="rl-remix mk-remix-this" href={v.remixHref}>
                  {v.w.remixThis}
                </Link>
              )}
              <ChallengeShareFirst path={path} w={{ head: null, texts: v.w.othersTexts, copy: v.w.copy, copied: v.w.copied, on: v.w.on }} />
            </>
          )}
          {known && mine && v.notYet && (
            <section className="sf-submit">
              <p className="ch-not-yet">{v.notYet}</p>
            </section>
          )}
          {known && mine && v.beforeOpen && (
            <section className="sf-submit">
              <p className="ch-before-open">
                {v.beforeOpen.text}
                <Link href={v.beforeOpen.href}>{v.beforeOpen.link}</Link>
                {v.beforeOpen.after}
              </p>
            </section>
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
                    {v.w.thenSubmit} {v.w.oneADay && <span className="dz-muted">· {v.w.oneADay}</span>}
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
          <p className="dz-muted mk-by">
            {v.by} · {v.date}
          </p>
          {/* The full AI line (owner's rule): the declaration, the model and, for a closed model, its maker. */}
          <p className="chp-ai" data-slot="ai-line">
            <span className="chp-ai-chip" aria-hidden="true">
              AI
            </span>
            <span>{v.aiLine}</span>
          </p>
          {v.chain.length > 0 && (
            <section className="chp-chain" aria-labelledby="chp-chain-h">
              <h2 id="chp-chain-h" className="chp-h">
                {v.w.remixedFrom}
              </h2>
              <ol className="chp-steps">
                {v.chain.map((c, i) => (
                  <li key={c.versionId} className={c.current ? 'chp-step chp-current' : 'chp-step'} aria-current={c.current ? 'page' : undefined} data-hidden={c.hidden ? '' : undefined}>
                    {i > 0 && (
                      <span className="chp-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                    {c.href ? (
                      <Link className="chp-thumb" href={c.href} prefetch={false}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.thumb ? <img src={c.thumb} alt="" width={100} height={100} loading="lazy" /> : <span className="cc-empty" />}
                        <span className="chp-step-by">{c.label}</span>
                      </Link>
                    ) : (
                      <span className="chp-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.thumb ? <img src={c.thumb} alt="" width={100} height={100} loading="lazy" /> : <span className="cc-empty" />}
                        <span className="chp-step-by">{c.label}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {v.note && <p className="dz-muted">{v.note}</p>}
          {v.posts.length > 0 && <PostedOn versionId={v.versionId} posts={v.posts} head={v.w.postsHead} note={v.w.postsNote} />}
          <details className="chp-made">
            <summary>{v.w.madeHead}</summary>
            <dl className="chp-made-list">
              {v.words && (
                <>
                  <dt>{v.w.madeWords}</dt>
                  <dd className="mk-words">“{v.words}”</dd>
                </>
              )}
              {v.made.style && (
                <>
                  <dt>{v.w.madeStyle}</dt>
                  <dd>{v.made.style}</dd>
                </>
              )}
              {v.made.model && (
                <>
                  <dt>{v.w.madeModel}</dt>
                  <dd>{v.made.model}</dd>
                </>
              )}
              {v.made.startedFrom && (
                <>
                  <dt>{v.w.madeFrom}</dt>
                  <dd>{v.made.startedFrom}</dd>
                </>
              )}
              {v.made.prompt && (
                <>
                  <dt>{v.w.madePrompt}</dt>
                  <dd>
                    <pre className="chp-prompt">{v.made.prompt}</pre>
                  </dd>
                </>
              )}
            </dl>
            <p className="chp-full">
              <Link href={`/image/${v.versionId}`}>{v.w.madeFull} →</Link>
            </p>
          </details>
          <p className="mk-links">
            <Link href="/challenge/entries">{v.w.every}</Link> · <Link href={hub}>{v.w.another}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
