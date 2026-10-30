'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { CONTACT_EMAIL } from '~/lib/config';
import { NETWORK_NAME, type SocialPost } from '~/lib/social/parse';

type Row = SocialPost & { hidden: boolean };

/**
 * "Posts that link here", for moderators (branch social-read): every post read from Farcaster and Bluesky, newest
 * first as the server sends them, each with the page it links to and one action, Hide, with the reason. A hidden post
 * stays in this list, marked, and leaves every page. There is no unhide here (P5b).
 */
export function ModerateSocial() {
  const auth = useAuth();
  const [state, setState] = useState<{ on: boolean; ready: boolean; posts: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await authFetch('/api/moderate/social');
    if (res.ok) setState((await res.json()) as { on: boolean; ready: boolean; posts: Row[] });
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not load the posts');
  }, []);
  useEffect(() => {
    if (auth.kind === 'signed-in') void load();
  }, [auth.kind, load]);
  const hide = async (p: Row, reason: 'writer_asked' | 'terms') => {
    const res = await authFetch('/api/moderate/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ network: p.network, id: p.id, reason }) });
    if (res.ok) void load();
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not hide it');
  };
  if (auth.kind !== 'signed-in' || !state?.on) return null;
  return (
    <section className="moderate-social" aria-labelledby="moderate-social-title" data-moderate-social="">
      <h2 id="moderate-social-title">Posts that link here</h2>
      <p>
        Public posts on Farcaster and Bluesky that link to a page here, newest first. Hide one when the person who wrote it asks
        (by email to {CONTACT_EMAIL}), or when it breaks the Terms. It leaves every page within a few minutes.
      </p>
      {error && <p role="alert">{error}</p>}
      {!state.ready ? (
        <p className="label">Not shown on any page yet: the hide list isn&apos;t set up (NEXT_social_read.sql).</p>
      ) : !state.posts.length ? (
        <p className="label">No posts read.</p>
      ) : (
        <ul className="moderate-social-list">
          {state.posts.map((p) => (
            <li key={`${p.network} ${p.id}`} data-network={p.network} data-post-id={p.id}>
              <p className="label">
                {NETWORK_NAME[p.network]} · @{p.handle} · {p.at.slice(0, 10)} · links to {p.pages.join(', ')}
                {p.hidden ? ' · hidden' : ''}
              </p>
              <blockquote>{p.text}</blockquote>
              <p>
                <a href={p.url} rel="nofollow noopener noreferrer ugc" target="_blank">
                  See it on {NETWORK_NAME[p.network]}
                </a>
              </p>
              {!p.hidden && (
                <div className="mq-actions">
                  <button type="button" className="mq-hide" onClick={() => void hide(p, 'writer_asked')}>
                    Hide: the writer asked
                  </button>
                  <button type="button" className="mq-hide" onClick={() => void hide(p, 'terms')}>
                    Hide: breaks the Terms
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
