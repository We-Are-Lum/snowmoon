'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { PostLinkField } from './post-link-field';

/**
 * Submit (the remix challenge, owner 2026-11-04): shown only to the version's maker. A remix becomes an entry only
 * when its maker presses Submit here, with the link to a post about it on Farcaster, Bluesky or Lens; the server reads
 * the post and checks it links to this page, as "Add where you posted it" does. Up to three per person, across all
 * characters. Once submitted, the maker can withdraw it until entries close, which frees the slot.
 */
export function ChallengeSubmit({ versionId, byFid, submitted, open }: { versionId: string; byFid: number; submitted: boolean; open: boolean }) {
  const auth = useAuth();
  const [address, setAddress] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(submitted);
  const [left, setLeft] = useState<number | null>(null);
  const mine = auth.kind === 'signed-in' && auth.fid === byFid;
  useEffect(() => {
    if (!mine) return;
    authFetch('/api/challenge/submit')
      .then((r) => (r.ok ? r.json() : null))
      .then((out: { left?: number | null } | null) => setLeft(typeof out?.left === 'number' ? out.left : null))
      .catch(() => setLeft(null));
  }, [mine, done]);
  if (!mine || !open) return null;

  const send = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setNote(null);
    const body = method === 'POST' ? { versionId, url: address.trim() } : { versionId };
    const r = await authFetch('/api/challenge/submit', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { error?: string; left?: number } | undefined;
    setBusy(false);
    if (r?.ok) {
      setDone(method === 'POST');
      setAddress('');
      setNote(method === 'POST' ? W.submitted : W.withdrawn);
      if (typeof out?.left === 'number') setLeft(out.left);
    } else setNote(out?.error ?? (method === 'POST' ? 'Could not submit it' : 'Could not withdraw it'));
  };

  return (
    <div className="ch-submit">
      {done ? (
        <p className="ch-mark">
          <button type="button" className="ic-secondary" onClick={() => send('DELETE')} disabled={busy}>
            {W.withdraw}
          </button>{' '}
          <span className="dz-muted">{W.withdrawNote}</span>
        </p>
      ) : (
        <form
          className="ch-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (address.trim()) void send('POST');
          }}
        >
          <p className="dz-label">{W.submitHead}</p>
          <p className="dz-note">{W.submitNote()}</p>
          <PostLinkField id={`submit-${versionId}`} label={W.submitLabel} value={address} onChange={setAddress} />
          <button type="submit" className="ic-primary" disabled={busy || !address.trim() || left === 0}>
            {W.submit}
          </button>
        </form>
      )}
      {left !== null && <p className="dz-note">{W.submissionsLeft(left)}</p>}
      {note && (
        <p className="ia-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
