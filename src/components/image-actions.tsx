'use client';

import { useEffect, useRef, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, useAuth } from '~/lib/client-auth';
import { REASONS, REASON_LABELS } from '~/lib/images/reasons';
import { IMAGE_WORDING as W } from '~/lib/images/wording';
import { SignInButton } from './sign-in';
import { PrivateNoteField } from './private-note-field';

/**
 * On a reader's image: Like (the existing likes), "Cast this" with its share card (like quote
 * cards), the author's "Hide this", and "Report" for everyone else signed in. Laid out as Claude
 * Design's image page: one row of equal buttons; the report form is a bottom sheet.
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
  const reportButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false));
  }, []);
  useEffect(() => {
    if (auth.kind === 'loading') return;
    void authFetch(`/api/images/${versionId}/like`).then(async (r) => r.ok && setLikes(await r.json()));
  }, [versionId, auth.kind]);

  // The report sheet: focus in, Escape closes, focus back on Report.
  useEffect(() => {
    if (!reporting) return;
    sheet.current?.querySelector<HTMLElement>('input, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setReporting(false);
    document.addEventListener('keydown', onKey);
    const back = reportButton.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      back?.focus();
    };
  }, [reporting]);

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
        <button type="button" className="ia-button ia-like" aria-pressed={likes?.liked ?? false} onClick={like} disabled={auth.kind !== 'signed-in'}>
          {likes?.liked ? '♥ Liked' : '♡ Like'} · {likes?.likes ?? 0}
        </button>
        <button type="button" className="ia-button" onClick={cast}>
          Cast this
        </button>
        <a className="ia-button" href={`/api/image-card/${versionId}`} target="_blank" rel="noopener noreferrer">
          Share card
        </a>
        {mine && (
          <button type="button" className={`ia-button${hidden ? '' : ' ia-warn'}`} onClick={hide}>
            {hidden ? 'Unhide' : 'Hide this'}
          </button>
        )}
        {!mine && auth.kind === 'signed-in' && (
          <button ref={reportButton} type="button" className="ia-button ia-warn" aria-haspopup="dialog" aria-expanded={reporting} onClick={() => setReporting(true)}>
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
        <div className="sheet-overlay ia-overlay" onClick={(e) => e.target === e.currentTarget && setReporting(false)}>
          <div ref={sheet} className="recipe-sheet ia-sheet" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <button type="button" className="sheet-x" aria-label="Close" onClick={() => setReporting(false)}>
              ×
            </button>
            <fieldset className="ia-report">
              <legend id="report-title">Why are you reporting this image?</legend>
              {REASONS.map((r) => (
                <label key={r}>
                  <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {REASON_LABELS[r]}
                </label>
              ))}
            </fieldset>
            <PrivateNoteField id="report-note" label="A note for the moderators (optional)" value={why} onChange={setWhy} maxLength={280} />
            <div className="ia-sheet-actions">
              <button type="button" className="ia-cancel" onClick={() => setReporting(false)}>
                Cancel
              </button>
              <button type="button" className="ia-send" onClick={report} disabled={!reason}>
                Send report
              </button>
            </div>
            {note && <p className="ia-note">{note}</p>}
            <p className="as-draft ic-draftline">{W.draftLine}</p>
          </div>
        </div>
      )}
      {hidden && <p className="ia-note">Hidden. It is gone from view; you can unhide it.</p>}
      {note && !reporting && (
        <p className="ia-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
