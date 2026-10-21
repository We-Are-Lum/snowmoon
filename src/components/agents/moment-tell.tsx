'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { TellAgent, sendRequest } from './tell-agent';
import './agents.css';

/** On a moment (owner, 2026-10-20): say what you want here, and your agent makes it. Signed-in people only. */
export function MomentTell({ moment }: { moment: string }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  // Shown only to people agents are open to (the owner, for now): /api/agents answers 404 to everyone else.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (signedIn) void authFetch('/api/agents').then((r) => setOpen(r.ok)).catch(() => setOpen(false));
  }, [signedIn]);
  if (!signedIn || !open) return null;
  return (
    <section className="moment-tell" aria-label={AGENT_WORDING.tell.moment}>
      <TellAgent id="moment-tell" label={AGENT_WORDING.tell.moment} send={(words, spoken) => sendRequest({ kind: 'idea', words, spoken, moment })} />
    </section>
  );
}
