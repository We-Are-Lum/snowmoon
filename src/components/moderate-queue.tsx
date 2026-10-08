'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { REASON_LABELS } from '~/lib/images/reasons';
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

/** Hide or dismiss: the only two things a moderator can do here. */
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
  if (!items.length) return <p>No reports waiting.</p>;
  return (
    <ul className="moderate-list">
      {items.map((it) => (
        <li key={it.version_id}>
          <p className="label">
            Chapter {it.chapter} · blocks {it.start_idx}–{it.end_idx} · by FID {it.created_by_fid} · {it.created_at.slice(0, 10)} · {it.model} · {it.status}
            {it.last_role === 'rule' ? ' · hidden by a stated rule' : ''}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.asset_url} alt="The reported image" width={1024} height={576} />
          <pre className="recipe-prompt">{it.prompt}</pre>
          <ul>
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
          <div className="ia-row">
            {it.status === 'published' && (
              <button type="button" className="ia-button" onClick={() => act(it.version_id, 'hide')}>
                Hide
              </button>
            )}
            <button type="button" className="ia-quiet" onClick={() => act(it.version_id, 'dismiss')}>
              Dismiss the reports
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
