'use client';

import { useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';

/** "Mark as my entry" (the remix challenge): shown only to the version's maker, when it isn't already their entry. */
export function ChallengeMark({ versionId, byFid }: { versionId: string; byFid: number }) {
  const auth = useAuth();
  const [note, setNote] = useState<string | null>(null);
  if (auth.kind !== 'signed-in' || auth.fid !== byFid) return null;
  const mark = async () => {
    const r = await authFetch('/api/challenge/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setNote(r?.ok ? W.marked : (out?.error ?? 'Could not mark it'));
  };
  return (
    <p className="ch-mark">
      <button type="button" className="ic-secondary" onClick={mark}>
        {W.mark}
      </button>
      {note && <span role="status"> {note}</span>}
    </p>
  );
}
