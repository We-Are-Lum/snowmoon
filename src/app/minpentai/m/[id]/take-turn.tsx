'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { SignInButton } from '~/components/sign-in';

/**
 * Take turn (owner, 2026-11-03): approves the AI's draft as this turn's orders. Shown to anyone with the link, but only
 * the match's own person, signed in, is answered: the server checks (api/minpentai/m/[id]/take-turn). The link alone
 * never plays a turn.
 */
export function TakeTurn({ id, turn }: { id: string; turn: number }) {
  const auth = useAuth(), wallet = useWalletSession(), router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  if (auth.kind === 'loading') return null;
  if (auth.kind === 'signed-out' && !wallet) return <p className="mb-note">To take this turn here, sign in as this match&rsquo;s player. <SignInButton /></p>;
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await authFetch(`/api/minpentai/m/${id}/take-turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ turn }) });
      if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'That didn’t work. Try again in a moment.'); return; }
      router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <div className="mb-take">
      <button type="button" className="mb-take-button" onClick={go} disabled={busy}>{busy ? 'Taking your turn…' : 'Take turn'}</button>
      <span className="mb-note"> as yours; the turn then plays here.</span>
      {err ? <p className="mb-error" role="alert">{err}</p> : null}
    </div>
  );
}
