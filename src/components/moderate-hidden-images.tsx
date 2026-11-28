'use client';
import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';

/**
 * Hidden readers' images on /moderate (Nate, 2026-11-27: the follow-up to #255): the ones a moderator or a stated rule
 * hid, with who and when, and Unhide, asked in the page first. Unhide puts back exactly the picture its maker published
 * (byte for byte) and the takes hidden only because of it (principle 5). A maker's own hide isn't listed: it's theirs to
 * undo. Wording drafted by the coding agent; reread by Nate as listed in #257 (2026-11-27).
 */
type Hidden = { versionId: string; hiddenAt: string; hiddenBy: string };
const W = {
  title: 'Hidden pictures',
  none: 'No pictures hidden by a moderator or a rule.',
  note: 'Unhide puts back exactly the picture its maker published, and the takes hidden only because of it.',
  unhide: 'Unhide',
  yes: 'Unhide it',
  no: 'Keep it hidden',
  done: (n: number) => (n ? `Unhidden, with ${n} take${n === 1 ? '' : 's'}.` : 'Unhidden.'),
  hidden: (by: string, at: string) => `Hidden by ${by}, ${at}`,
} as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' });

export function ModerateHiddenImages() {
  const auth = useAuth();
  const [items, setItems] = useState<Hidden[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await authFetch('/api/moderate', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setItems(((await r.json()) as { hiddenImages?: Hidden[] }).hiddenImages ?? []);
  }, []);
  useEffect(() => {
    if (auth.kind === 'signed-in') void load();
  }, [auth.kind, load]);
  if (!items) return null;
  const unhide = async (versionId: string) => {
    setBusy(true);
    setMsg(null);
    const r = await authFetch('/api/moderate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId, action: 'unhide' }) }).catch(() => null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { takes?: number; error?: string };
    setBusy(false);
    setMsg(r?.ok ? W.done(j.takes ?? 0) : (j.error ?? 'That didn’t go through. Nothing changed.'));
    void load();
  };
  return (
    <section className="moderate-hidden-images" aria-labelledby="mhi-h">
      <h2 id="mhi-h">{W.title}</h2>
      <p className="ic-note">{W.note}</p>
      {msg && <p className="ic-note" role="status">{msg}</p>}
      {items.length === 0 ? (
        <p className="ic-note">{W.none}</p>
      ) : (
        <ul className="you-list">
          {items.map((x) => (
            <li key={x.versionId} data-version={x.versionId}>
              <span>{W.hidden(x.hiddenBy, day(x.hiddenAt))}</span>{' '}
              {asking === x.versionId ? (
                <span className="you-actions">
                  <button type="button" className="ic-secondary" disabled={busy} onClick={() => { setAsking(null); void unhide(x.versionId); }}>{W.yes}</button>
                  <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(null)}>{W.no}</button>
                </span>
              ) : (
                <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(x.versionId)}>{W.unhide}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
