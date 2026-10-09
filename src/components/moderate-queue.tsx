'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { REASON_LABELS } from '~/lib/images/reasons';
import { IMAGE_WORDING as W } from '~/lib/images/wording';
import { SignInButton } from './sign-in';

type Item = {
  version_id: string;
  asset_url: string;
  status: string;
  created_by_fid: number;
  created_at: string;
  prompt: string;
  model: string;
  params: { user_prompt?: string; style?: { text: string } | null; checks?: unknown };
  chapter: number;
  start_idx: number;
  end_idx: number;
  last_step: string;
  last_role: string;
  reasons: { reason: keyof typeof REASON_LABELS; n: number }[] | null;
  notes: string[] | null;
};

/**
 * Hide or dismiss: the only two things a moderator can do here. Laid out as Claude Design's
 * queue: a red "moderators only" strip naming the order, then each reported image with what
 * was sent, the reasons and the notes, and the two actions. The list is the server's, oldest first.
 */
export function ModerateQueue() {
  const auth = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await authFetch('/api/moderate');
    if (res.ok) setItems(((await res.json()) as { items: Item[] }).items);
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not load the queue');
  }, []);
  useEffect(() => {
    if (auth.kind === 'signed-in') void load();
  }, [auth.kind, load]);
  const act = async (versionId: string, action: 'hide' | 'dismiss') => {
    const res = await authFetch('/api/moderate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId, action }) });
    if (res.ok) void load();
  };
  if (auth.kind === 'signed-out') return <SignInButton />;
  if (error) return <p>{error}</p>;
  if (!items) return <p className="label">…</p>;
  return (
    <>
      <p className="mq-strip">
        <span>{W.moderate.strip}</span>
        <span>{W.moderate.waiting(items.length)}</span>
      </p>
      {!items.length ? (
        <p className="mq-empty">No reports waiting.</p>
      ) : (
        <ul className="moderate-list">
          {items.map((it) => (
            <li key={it.version_id}>
              <figure className="mq-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.asset_url} alt="The reported image" width={1024} height={576} />
                <figcaption className="mq-caption">AI-generated image · not by the author</figcaption>
              </figure>
              <div className="mq-detail">
                <p className="mq-meta">
                  by FID {it.created_by_fid} · Chapter {it.chapter} · blocks {it.start_idx}–{it.end_idx} · {it.created_at.slice(0, 10)}
                  <br />
                  <span className="mq-muted">
                    {it.model} · {it.status}
                    {it.last_role === 'rule' ? ' · hidden by a stated rule' : ''}
                  </span>
                </p>
                <div className="mq-section">
                  <p className="mq-label">{W.moderate.prompt}</p>
                  <p className="mq-prompt">{it.prompt}</p>
                </div>
                <div className="mq-section">
                  <p className="mq-label">{W.moderate.reasons}</p>
                  <ul className="mq-reasons">
                    {(it.reasons ?? []).map((r) => (
                      <li key={r.reason}>
                        {REASON_LABELS[r.reason] ?? r.reason}: {r.n}
                      </li>
                    ))}
                  </ul>
                  {(it.notes ?? []).map((n, i) => (
                    <p key={i} className="moderate-note">
                      “{n}”
                    </p>
                  ))}
                </div>
                <div className="mq-actions">
                  <button type="button" className="mq-dismiss" onClick={() => act(it.version_id, 'dismiss')}>
                    Dismiss the reports
                  </button>
                  {it.status === 'published' && (
                    <button type="button" className="mq-hide" onClick={() => act(it.version_id, 'hide')}>
                      Hide
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
