'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, useAuth } from '~/lib/client-auth';
import { REASONS, REASON_LABELS } from '~/lib/images/reasons';
import { SignInButton } from './sign-in';
import { PrivateNoteField } from './private-note-field';

/**
 * On a reader's image: Like (the existing likes), "Cast this" with its share card (like quote
 * cards), the author's "Hide this", and "Report" for everyone else signed in.
 */
export function ImageActions({ versionId, byFid, chapter }: { versionId: string; byFid: number; chapter: number }) {
  const auth = useAuth();
  const [likes, setLikes] = useState<{ likes: number; liked: boolean } | null>(null);
  const [inApp, setInApp] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [why, setWhy] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false));
  }, []);
  useEffect(() => {
    if (auth.kind === 'loading') return;
    void authFetch(`/api/images/${versionId}/like`).then(async (r) => r.ok && setLikes(await r.json()));
  }, [versionId, auth.kind]);

  const like = async () => {
    const res = await authFetch(`/api/images/${versionId}/like`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ like: !likes?.liked }) });
    if (res.ok) setLikes(await res.json());
    else setNote(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not record the like');
  };
  const cast = async () => {
    const text = `An image for Snowmoon, Chapter ${chapter}`;
    const url = `${window.location.origin}/image/${versionId}`;
    if (inApp) await sdk.actions.composeCast({ text, embeds: [url] });
    else {
      const u = new URL('https://farcaster.xyz/~/compose');
      u.searchParams.set('text', text);
      u.searchParams.append('embeds[]', url);
      window.open(u.toString(), '_blank', 'noopener');
    }
  };
  const hide = async () => {
    const res = await authFetch(`/api/images/${versionId}/hide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hide: !hidden }) });
    const out = (await res.json().catch(() => ({}))) as { hidden?: boolean; error?: string };
    if (res.ok) setHidden(Boolean(out.hidden));
    else setNote(out.error ?? 'Could not change it');
  };
  const report = async () => {
    const res = await authFetch(`/api/images/${versionId}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason, note: why }) });
    const out = (await res.json().catch(() => ({}))) as { hidden?: boolean; error?: string };
    if (res.ok) {
      setReporting(false);
      setNote(out.hidden ? 'Reported. It is hidden until a moderator looks.' : 'Reported. A moderator will look. Thank you.');
    } else setNote(out.error ?? 'Could not send the report');
  };

  const mine = auth.kind === 'signed-in' && auth.fid === byFid;
  return (
    <div className="image-actions">
      <div className="ia-row">
        <button type="button" className="ia-button" aria-pressed={likes?.liked ?? false} onClick={like} disabled={auth.kind !== 'signed-in'}>
          {likes?.liked ? '♥ Liked' : '♡ Like'} · {likes?.likes ?? 0}
        </button>
        <button type="button" className="ia-button" onClick={cast}>
          Cast this
        </button>
        <a className="ia-button" href={`/api/image-card/${versionId}`} target="_blank" rel="noopener noreferrer">
          Share card
        </a>
        {mine && (
          <button type="button" className="ia-button" onClick={hide}>
            {hidden ? 'Unhide' : 'Hide this'}
          </button>
        )}
        {!mine && auth.kind === 'signed-in' && !reporting && (
          <button type="button" className="ia-quiet" onClick={() => setReporting(true)}>
            Report
          </button>
        )}
      </div>
      {auth.kind === 'signed-out' && (
        <p className="ia-note">
          <SignInButton className="like-sign-in" label="Sign in to like or report" />
        </p>
      )}
      {reporting && (
        <fieldset className="ia-report">
          <legend>Why are you reporting this image?</legend>
          {REASONS.map((r) => (
            <label key={r}>
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {REASON_LABELS[r]}
            </label>
          ))}
          <PrivateNoteField id="report-note" label="A note for the moderators (optional)" value={why} onChange={setWhy} maxLength={280} />
          <div className="ia-row">
            <button type="button" className="ia-button" onClick={report} disabled={!reason}>
              Send report
            </button>
            <button type="button" className="ia-quiet" onClick={() => setReporting(false)}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
      {hidden && <p className="ia-note">Hidden. It is gone from view; you can unhide it.</p>}
      {note && <p className="ia-note">{note}</p>}
    </div>
  );
}

