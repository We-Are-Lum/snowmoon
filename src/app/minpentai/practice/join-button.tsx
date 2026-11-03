'use client';

import { useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { SignInButton } from '~/components/sign-in';

/** Join a practice match as Amber (a private invite, or one from the open list), signed in. Goes to your live page. */
export function JoinButton({ matchId, invite }: { matchId: string; invite?: string }) {
  const auth = useAuth(), wallet = useWalletSession();
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [show, setShow] = useState(false);
  if (auth.kind === 'loading') return null;
  if (auth.kind === 'signed-out' && !wallet) return <p className="mb-note">Sign in to join. <SignInButton /></p>;
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await authFetch('/api/minpentai/practice/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ match_id: matchId, invite, show_name: show }) });
      const b = (await r.json().catch(() => ({}))) as { live_url?: string; error?: string };
      if (!r.ok || !b.live_url) { setErr(b.error ?? 'That didn’t work. Try again in a moment.'); return; }
      window.location.href = b.live_url;
    } finally { setBusy(false); }
  };
  return (
    <div className="mb-take">
      <label className="mb-note"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show my name in the public record after the end</label>
      <div><button type="button" className="mb-take-button" onClick={go} disabled={busy}>{busy ? 'Joining…' : 'Join as Amber'}</button></div>
      {err ? <p className="mb-error" role="alert">{err}</p> : null}
    </div>
  );
}
