'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, socialSessionPerson, useAuth, useSocialSession } from '~/lib/client-auth';
import { MODERATOR_FIDS } from '~/lib/config';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { EpisodeShare } from './challenge-episode-share';

/**
 * An outline's page, its actions (owner, 2026-11-24): Share for everyone; Withdraw for its maker while submissions are
 * open; Hide for a moderator (MODERATOR_FIDS). Who is signed in is known only in the browser, so these are drawn here.
 */
export function EpisodeOutlineActions({ id, byFid }: { id: string; byFid: number }) {
  const auth = useAuth();
  const social = useSocialSession();
  const me = auth.kind === 'signed-in' ? auth.fid : social ? socialSessionPerson(social.token) : null;
  const mine = me !== null && me === byFid;
  const moderator = auth.kind === 'signed-in' && MODERATOR_FIDS.includes(auth.fid);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!mine) return;
    void authFetch('/api/challenge/episode-1/mine')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { open?: boolean } | null) => setOpen(Boolean(j?.open)))
      .catch(() => setOpen(false));
  }, [mine]);
  const act = async (kind: 'withdraw' | 'hide') => {
    if (!window.confirm(kind === 'withdraw' ? W.withdrawConfirm : W.hideConfirm)) return;
    const res =
      kind === 'withdraw'
        ? await authFetch('/api/challenge/episode-1/outlines', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null)
        : await authFetch(`/api/challenge/episode-1/outlines/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hide: true }) }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string };
    if (res?.ok) {
      setGone(true);
      setNote(kind === 'withdraw' ? W.withdrawn : W.hidden);
    } else setNote(j?.error ?? 'Something went wrong');
  };
  return (
    <>
      {!gone && <EpisodeShare id={id} mine={mine} />}
      <p className="ep-btns">
        <Link href="/challenge/episode-1" className="ep-btn">
          {W.makeYours}
        </Link>
        {mine && open && !gone && (
          <button type="button" className="ep-btn" onClick={() => void act('withdraw')}>
            {W.withdraw}
          </button>
        )}
        {moderator && !gone && (
          <button type="button" className="ep-btn ep-btn-warn" onClick={() => void act('hide')}>
            {W.hide}
          </button>
        )}
      </p>
      {note && (
        <p className="ep-small" role="status">
          {note}
        </p>
      )}
    </>
  );
}
