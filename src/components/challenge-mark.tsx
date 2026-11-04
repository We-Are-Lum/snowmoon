'use client';

import { useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';

/**
 * "Mark as my entry" (the remix challenge): shown only to the version's maker, when it isn't already their entry. Its
 * words come from the server (`words`), so this script carries none of the challenge's.
 */
export function ChallengeMark({ versionId, byFid, words }: { versionId: string; byFid: number; words: { mark: string; marked: string } }) {
  const auth = useAuth();
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (auth.kind !== 'signed-in' || auth.fid !== byFid) return null;
  const mark = async () => {
    const r = await authFetch('/api/challenge/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setNote(r?.ok ? words.marked : (out?.error ?? 'Could not mark it'));
    if (r?.ok) setDone(true);
  };
  return (
    <p className="ch-mark">
      {/* Once marked, the button goes (launch rehearsal, 2026-11-02: it stayed, inviting a second tap). */}
      {!done && (
        <button type="button" className="ic-secondary" onClick={mark}>
          {words.mark}
        </button>
      )}
      {note && <span role="status"> {note}</span>}
    </p>
  );
}
