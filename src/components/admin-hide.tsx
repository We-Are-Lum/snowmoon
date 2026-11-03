'use client';

import { useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';

/**
 * An admin's Hide in the reader (owner, 2026-10-29): on a seeded image or a reader's image, shown to admins only
 * (src/lib/config.ts, ADMINS). It hides and nothing else (principle 5). Model-drafted wording (coding agent, 2026-10-29).
 */
export function AdminHide({ kind, id }: { kind: 'seeded' | 'reader'; id: string }) {
  const auth = useAuth();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle');
  if (auth.kind !== 'signed-in' || !isAdmin(auth.fid)) return null;
  if (state === 'done') return <span className="admin-hide-done"> · Hidden. Reload to see the page without it.</span>;
  const hide = async () => {
    if (!window.confirm('Hide this image for everyone? Only an admin can do this.')) return;
    setState('busy');
    const r = await authFetch('/api/admin/hide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, id }) }).catch(() => null);
    setState(r?.ok ? 'done' : (((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'That didn’t work.'));
  };
  return (
    <>
      {' · '}
      <button type="button" className="admin-hide" disabled={state === 'busy'} onClick={() => void hide()}>
        Hide (admin)
      </button>
      {state !== 'idle' && state !== 'busy' && <span role="alert"> {state}</span>}
    </>
  );
}
