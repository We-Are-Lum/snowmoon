'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';

const NETWORK_NAME = { farcaster: 'Farcaster', bluesky: 'Bluesky', lens: 'Lens' } as const;
export interface PostedOnItem {
  id: string;
  network: keyof typeof NETWORK_NAME;
  handle: string;
  at: string;
  url: string;
}

/**
 * "Posted on" (the remix challenge, owner 2026-10-31): posts that link to this version's page, newest first (the order
 * the server gives; nothing else orders them). Text and a link only: the network, the writer's @handle, the date and
 * a link to the post on its network. No avatar, embed, picture or words from the networks (P6a). Signed in, the
 * person who added a post (or a moderator) sees Remove on it; who added what is never shown.
 */
export function PostedOn({ versionId, posts }: { versionId: string; posts: PostedOnItem[] }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const [removable, setRemovable] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (auth.kind !== 'signed-in' && !wallet) return;
    void authFetch(`/api/challenge/posts?versionId=${versionId}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { removable?: string[] }) : null))
      .then((o) => o?.removable && setRemovable(new Set(o.removable)))
      .catch(() => {});
  }, [auth.kind, wallet, versionId]);
  const remove = async (id: string) => {
    const r = await authFetch('/api/challenge/posts', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, versionId }) }).catch(() => null);
    if (r?.ok) setGone(new Set([...gone, id]));
  };
  const shown = posts.filter((p) => !gone.has(p.id));
  if (!shown.length) return null;
  return (
    <section className="dz-section ch-posted" aria-labelledby={`posted-${versionId}`}>
      <p className="dz-label" id={`posted-${versionId}`}>
        {W.postedOnHead}
      </p>
      <ul className="ch-posted-list">
        {shown.map((p) => (
          <li key={p.id}>
            <span>
              {NETWORK_NAME[p.network]} · @{p.handle} · {p.at.slice(0, 10)} ·{' '}
              <a href={p.url} target="_blank" rel="noopener noreferrer nofollow ugc">
                {W.seeIt(NETWORK_NAME[p.network])}
              </a>
            </span>
            {removable.has(p.id) && (
              <button type="button" className="ia-button ia-warn ch-remove" onClick={() => remove(p.id)}>
                {W.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="dz-note">{W.postedOnNote}</p>
    </section>
  );
}
