'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { REASON_LABELS } from '~/lib/images/reasons';

/**
 * Published storyboards in the one moderator queue (/moderate, with the images'; Nate, 2026-11-23: one queue, so the
 * ntfy alert's count covers both and leads to one page): the reported ones, each with its reasons and counts, how many
 * people reported (never who) and their notes, with Hide or Dismiss; and the hidden ones, with who hid them and Unhide
 * ("A moderator may unhide what was hidden; it puts back exactly what its maker published, and never publishes anything
 * else", principle 5, reread by Nate 2026-11-23). Each action is asked in the page first ("Hide it / Keep it"). Wording
 * drafted by the coding agent.
 */
type Reported = { id: string; title: string; maker: string | null; publishedAt: string; hidden: { at: string; role: string } | null; reasons: { reason: string; n: number }[]; reporters: number; notes: string[] };
type Hidden = { id: string; title: string; maker: string | null; publishedAt: string; hiddenAt: string; hiddenBy: string; reason: string | null };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' });
const label = (r: string | null) => (r ? (REASON_LABELS as Record<string, string>)[r] ?? r : 'no reason given');

function Ask({ label: l, yes, no, onYes, busy }: { label: string; yes: string; no: string; onYes: () => void; busy: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(true)}>
        {l}
      </button>
    );
  return (
    <span className="you-actions">
      <button type="button" className="ic-secondary" disabled={busy} onClick={() => { setAsking(false); onYes(); }}>
        {yes}
      </button>
      <button type="button" className="ic-secondary" disabled={busy} onClick={() => setAsking(false)}>
        {no}
      </button>
    </span>
  );
}

export function ModerateStoryboards() {
  const auth = useAuth();
  const [data, setData] = useState<{ reported: Reported[]; hidden: Hidden[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await authFetch('/api/moderate', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) {
      const j = (await r.json()) as { storyboards?: Reported[]; hiddenStoryboards?: Hidden[] };
      setData({ reported: j.storyboards ?? [], hidden: j.hiddenStoryboards ?? [] });
    }
  }, []);
  useEffect(() => {
    if (auth.kind === 'signed-in') void load();
  }, [auth.kind, load]);
  if (auth.kind !== 'signed-in' || !data) return null;
  const act = async (id: string, action: 'hide' | 'unhide' | 'dismiss') => {
    setBusy(true);
    const r = await authFetch('/api/moderate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicationId: id, action }) }).catch(() => null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; failed?: number };
    setBusy(false);
    setMsg(r?.ok ? (j.failed ? `Done, but ${j.failed} file(s) didn’t move: look again.` : null) : (j.error ?? 'That didn’t work. Try again.'));
    void load();
  };
  return (
    <section className="moderate-storyboards" aria-labelledby="mq-sb-h">
      <h2 id="mq-sb-h">Reported storyboards</h2>
      {msg && <p className="you-note" role="alert">{msg}</p>}
      {data.reported.length === 0 ? (
        <p className="you-note">No storyboard reports waiting.</p>
      ) : (
        <ul className="ar-index">
          {data.reported.map((x) => (
            <li key={x.id}>
              <a href={`/storyboard/spoken/${x.id}`}>{x.title}</a> <span className="you-note">by {x.maker ? `@${x.maker}` : 'a reader'} · published {day(x.publishedAt)}{x.hidden ? ` · hidden by ${x.hidden.role === 'rule' ? 'a stated rule' : 'a moderator'}` : ''}</span>
              <p className="you-note">
                {x.reporters} {x.reporters === 1 ? 'person' : 'people'} reported it: {x.reasons.map((r) => `${label(r.reason)} (${r.n})`).join(', ')}
              </p>
              {x.notes.length > 0 && (
                <ul>
                  {x.notes.map((n, i) => (
                    <li key={i} className="you-note">“{n}”</li>
                  ))}
                </ul>
              )}
              <span className="you-actions">
                {!x.hidden && <Ask label="Hide" yes="Hide it" no="Keep it" busy={busy} onYes={() => void act(x.id, 'hide')} />}
                {x.hidden && <Ask label="Unhide" yes="Unhide it" no="Keep it hidden" busy={busy} onYes={() => void act(x.id, 'unhide')} />}
                <Ask label="Dismiss" yes="Dismiss the reports" no="Keep them" busy={busy} onYes={() => void act(x.id, 'dismiss')} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3>Hidden storyboards</h3>
      {data.hidden.length === 0 ? (
        <p className="you-note">None hidden.</p>
      ) : (
        <ul className="ar-index">
          {data.hidden.map((x) => (
            <li key={x.id}>
              <a href={`/storyboard/spoken/${x.id}`}>{x.title}</a> <span className="you-note">by {x.maker ? `@${x.maker}` : 'a reader'} · hidden {day(x.hiddenAt)} by {x.hiddenBy} · {label(x.reason)}</span>{' '}
              <Ask label="Unhide" yes="Unhide it" no="Keep it hidden" busy={busy} onYes={() => void act(x.id, 'unhide')} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
