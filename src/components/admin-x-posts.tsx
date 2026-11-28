'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import type { XPostsView } from '~/lib/x-posts/admin';
import '../styles/admin-activity.css';

/**
 * /admin/x-posts for a signed-in admin (owner, 2026-11-25). Everyone else sees `fallback` (the site's usual "not
 * found"). DRAFT wording, pending the owner's reread.
 */
export function AdminXPosts({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [view, setView] = useState<XPostsView | null>(null);
  const [said, setSaid] = useState('');
  useEffect(() => {
    if (!admin) return;
    void authFetch('/api/admin/x-posts', { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as XPostsView) : null))
      .then(setView)
      .catch(() => setView(null));
  }, [admin]);
  if (!admin || !view) return <>{fallback}</>;
  const register = async () => {
    setSaid('Registering…');
    const r = await authFetch('/api/admin/x-posts/commands', { method: 'POST' }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : {};
    setSaid(j.ok ? 'Registered: /xpost is in the server.' : `Not registered: ${j.error ?? 'no answer'}`);
  };
  return (
    <main className="aa">
      <p className="aa-kicker">Admin</p>
      <h1>X posts</h1>
      <p className="aa-note">
        Cards {view.cards ? 'on' : 'off'} · posting to X {view.post ? 'on' : 'off'} · this month ${view.spent.toFixed(2)} of ${view.monthlyUsd} · today {view.today} of {view.perDay} posts
      </p>
      {view.canRegister && (
        <p>
          <button type="button" onClick={() => void register()}>Register commands</button> <span className="aa-note">{said}</span>
        </p>
      )}
      <section className="aa-section">
        <h2>Log</h2>
        {view.rows.length === 0 && <p className="aa-note">Nothing yet.</p>}
        {view.rows.length > 0 && (
          <div className="aa-scroll">
            <table>
              <thead>
                <tr><th scope="col">When (UTC)</th><th scope="col">Card</th><th scope="col">What</th><th scope="col">Who</th><th scope="col">Cost</th><th scope="col">Post</th></tr>
              </thead>
              <tbody>
                {view.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.at.slice(0, 16).replace('T', ' ')}</td>
                    <td>{r.proposal}</td>
                    <td>{r.event.replace(/_/g, ' ')}{r.detail ? ` (${r.detail})` : ''}</td>
                    <td>{r.who ?? ''}</td>
                    <td>{r.cost ? `$${Number(r.cost).toFixed(3)}` : ''}</td>
                    <td>{r.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
