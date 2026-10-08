'use client';

import { useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { SYSTEM_FID } from '~/lib/config';

/** The maintainer's storage check (POST /api/images/storage-check): shown to FID 6786 only. */
export function StorageCheck() {
  const auth = useAuth();
  const [out, setOut] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  if (auth.kind !== 'signed-in' || auth.fid !== SYSTEM_FID) return null;
  const run = async () => {
    setBusy(true);
    const res = await authFetch('/api/images/storage-check', { method: 'POST' });
    setOut((await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Record<string, unknown>);
    setBusy(false);
  };
  return (
    <section className="storage-check" aria-label="Storage check">
      <h2>Image storage check</h2>
      <p>Writes one small text file to the readers&apos; bucket and the private bucket, reads it back, deletes it, and tries to write to the book&apos;s media bucket, which must be refused.</p>
      <button type="button" className="ia-button" onClick={run} disabled={busy}>
        {busy ? 'Checking…' : 'Run the check'}
      </button>
      {out && <pre className="recipe-prompt">{JSON.stringify(out, null, 2)}</pre>}
    </section>
  );
}
