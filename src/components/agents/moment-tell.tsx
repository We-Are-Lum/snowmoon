'use client';

import { useAuth, useWalletSession } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { TellAgent, sendRequest } from './tell-agent';
import './agents.css';

/** On a moment (owner, 2026-10-20): say what you want here, and your agent makes it. Signed-in people only. */
export function MomentTell({ moment }: { moment: string }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  if (auth.kind !== 'signed-in' && !wallet) return null;
  return (
    <section className="moment-tell" aria-label={AGENT_WORDING.tell.moment}>
      <TellAgent id="moment-tell" label={AGENT_WORDING.tell.moment} send={(words, spoken) => sendRequest({ kind: 'idea', words, spoken, moment })} />
    </section>
  );
}
