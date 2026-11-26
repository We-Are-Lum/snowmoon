'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { REASONS, REASON_LABELS } from '~/lib/images/reasons';
import { PrivateNoteField } from './private-note-field';
import { SignInButton } from './sign-in';

/**
 * "Report" on a published storyboard (Nate, 2026-11-23): for signed-in people, in the page (no window.confirm), with the
 * images' reasons and a private note for the moderators. Its maker sees no Report (they take it down instead). Wording
 * drafted by the coding agent.
 */
/** Whether the signed-in person made this storyboard, and why it was hidden: asked by their own browser, never in the page. */
function useMine(id: string) {
  const auth = useAuth();
  const [mine, setMine] = useState<{ mine: boolean; hiddenReason?: string | null } | null>(null);
  useEffect(() => {
    if (auth.kind !== 'signed-in') return;
    void authFetch(`/api/voice/publications/${id}/report`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { mine: false }))
      .then((j) => setMine(j as { mine: boolean; hiddenReason?: string | null }), () => setMine({ mine: false }));
  }, [auth.kind, id]);
  return { auth, mine };
}

export function VoiceReport({ id }: { id: string }) {
  const { auth, mine } = useMine(id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (auth.kind === 'loading') return null;
  if (auth.kind !== 'signed-in')
    return (
      <p className="vr-small vr-report">
        <SignInButton className="like-sign-in" label="Sign in to report" />
      </p>
    );
  if (!mine || mine.mine) return null;
  if (done)
    return (
      <p className="vr-small vr-report" role="status">
        {done}
      </p>
    );
  if (!open)
    return (
      <p className="vr-small vr-report">
        <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => setOpen(true)}>
          Report
        </button>
      </p>
    );
  const send = async () => {
    setBusy(true);
    const r = await authFetch(`/api/voice/publications/${id}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason, note }) }).catch(() => null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; hidden?: boolean };
    setBusy(false);
    if (r?.ok) setDone(j.hidden ? 'Thanks. It is hidden until a moderator looks at it.' : 'Thanks. A moderator will look at it.');
    else setDone(j.error ?? 'The report didn’t go through. Try again.');
  };
  return (
    <section className="vr-card vr-report" aria-labelledby="vr-report-h">
      <fieldset className="ia-report">
        <legend id="vr-report-h">Why are you reporting this storyboard?</legend>
        {REASONS.map((r) => (
          <label key={r}>
            <input type="radio" name="vr-report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <PrivateNoteField id="vr-report-note" label="A note for the moderators (optional)" value={note} onChange={setNote} maxLength={280} />
      <p className="vr-row">
        <button type="button" className="vr-btn vr-quiet vr-small-btn" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>{' '}
        <button type="button" className="vr-btn vr-small-btn" disabled={!reason || busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send the report'}
        </button>
      </p>
    </section>
  );
}

/** On a hidden storyboard's page, its maker also sees why, and that they can write to us. */
export function VoiceHiddenForMaker({ id }: { id: string }) {
  const { mine } = useMine(id);
  if (!mine?.mine) return null;
  const reason = mine.hiddenReason ?? null;
  return (
    <p className="vr-small">
      You made it. {reason ? `It was reported as: ${(REASON_LABELS as Record<string, string>)[reason] ?? reason}. ` : ''}Write to us if you think this is wrong.
    </p>
  );
}
