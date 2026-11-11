'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import type { ActivityView } from '~/lib/admin-activity';
import '../styles/admin-activity.css';

/**
 * /admin/activity for a signed-in admin (owner, 2026-11-05). Everyone else, and everyone until their sign-in is known,
 * sees `fallback` (the site's usual "not found"). The admin's browser asks GET /api/admin/activity, which answers admins
 * only (404 to everyone else), and draws what it returns: its titles and labels come from that answer. One person's
 * public work is chosen from a byline ("only theirs"), never typed.
 */
export function AdminActivity({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [days, setDays] = useState(30);
  const [asked, setAsked] = useState('');
  const [view, setView] = useState<ActivityView | null>(null);
  useEffect(() => {
    if (!admin) return;
    const q = new URLSearchParams({ days: String(days), ...(asked ? { who: asked } : {}) });
    void authFetch(`/api/admin/activity?${q}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as ActivityView) : null))
      .then(setView)
      .catch(() => setView(null));
  }, [admin, days, asked]);
  if (!admin || !view) return <>{fallback}</>;
  const fmt = (unit: 'count' | 'usd', n: number | undefined) => (n === undefined ? '' : unit === 'usd' ? n.toFixed(2) : String(n));
  return (
    <main className="aa">
      <p className="aa-kicker">Admin</p>
      <h1>Activity</h1>
      <div className="aa-controls">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
        ))}
        {view.who && <button type="button" onClick={() => setAsked('')}>Back to everyone</button>}
      </div>
      {view.who && <p className="aa-note">Only {view.who}&rsquo;s public work.</p>}
      {asked && !view.who && <p className="aa-note">No one found for {asked}.</p>}
      {!view.who && view.sections.map((s) => { const shown = s.days === 'UTC' ? view.dayListUtc : view.dayList; return (
        <section key={s.id} className="aa-section">
          <h2>{s.title}</h2>
          {s.note && <p className="aa-note">{s.note}</p>}
          {s.metrics.length === 0 && <p className="aa-note">Nothing kept here yet.</p>}
          {s.metrics.length > 0 && <div className="aa-scroll">
            <table>
              <thead>
                <tr><th scope="col"></th><th scope="col">All time</th>{s.days && shown.map((d) => <th key={d} scope="col">{d.slice(5)}</th>)}</tr>
              </thead>
              <tbody>
                {s.metrics.map((m) => (
                  <tr key={m.key}>
                    <th scope="row">{m.key}</th>
                    <td>{fmt(m.unit, m.total)}</td>
                    {s.days && shown.map((d) => <td key={d}>{fmt(m.unit, m.byDay[d])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
          {s.days && s.metrics.length > 0 && <p className="aa-note">Days: {s.days}.</p>}
        </section>
      ); })}
      {view.lists.map((l) => (
        <section key={l.id} className="aa-section">
          <h2>{l.title}</h2>
          {l.rows.length === 0 && <p className="aa-note">None yet.</p>}
          <ul className="aa-list">
            {l.rows.map((r, i) => (
              <li key={i}>
                {r.href ? <a href={r.href}>{r.title}</a> : r.title} <span className="aa-note">{r.by} · {r.at.slice(0, 10)}{r.note ? ` · ${r.note}` : ''}</span>
                {/* One person's public work: by their public @name (no text box: nothing typed is sent). */}
                {!view.who && r.by.startsWith('@') && <button type="button" className="aa-only" onClick={() => setAsked(r.by)}>only theirs</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {view.notHere.length > 0 && <p className="aa-note">Not on this database yet: {view.notHere.join(', ')}.</p>}
      <p className="aa-note">Read {view.generatedAt.slice(0, 16).replace('T', ' ')} UTC.</p>
    </main>
  );
}
