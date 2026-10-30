'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { SignInChoices } from '~/components/sign-in-choices';

const W = AGENT_WORDING.authorize;

export function AuthorizeConsent({ query, client, scopes, backHost }: { query: string; client: string; scopes: string[]; backHost: string }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  const [handle, setHandle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    void authFetch('/api/you').then(async (r) => (r.ok ? setHandle(((await r.json()) as { who: { handle: string | null; label?: string } }).who.handle) : null)).catch(() => null);
  }, [signedIn]);
  const answer = async (allow: boolean) => {
    setBusy(true);
    setError(null);
    const res = await authFetch('/api/oauth/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, allow }) }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { to?: string; error?: string };
    if (res?.ok && out.to) window.location.assign(out.to);
    else {
      setError(out.error ?? 'Something went wrong. Try again.');
      setBusy(false);
    }
  };
  const short = handle ? (handle.startsWith('0x') ? `${handle.slice(0, 6)}…${handle.slice(-4)}` : handle) : '…';
  return (
    <>
      <h1>{W.title(client)}</h1>
      {!signedIn ? (
        <>
          <p>{W.signIn}</p>
          <div className="you-sign-in">
            <SignInChoices wallet={auth.kind === 'signed-out' && !auth.inApp} />
          </div>
        </>
      ) : (
        <>
          <p className="agent-lede">{W.lede(client, short)}</p>
          <p>{W.can}</p>
          <ul>{scopes.map((s) => <li key={s}>{s}</li>)}</ul>
          <p>{W.cannot}</p>
          <p>{W.pays}</p>
          <p className="you-note">{W.limits}</p>
          <p className="you-note">{W.responsible}</p>
          <p className="you-note">{W.back(backHost)}</p>
          {error && <p role="alert">{error}</p>}
          <div className="agent-buttons">
            <button type="button" className="ic-primary" disabled={busy || !handle} onClick={() => void answer(true)}>{busy ? W.working : W.allow}</button>
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => void answer(false)}>{W.deny}</button>
          </div>
        </>
      )}
    </>
  );
}
