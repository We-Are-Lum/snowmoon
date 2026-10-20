'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { NoteForm } from './note-form';
import { TellAgent, sendRequest } from './tell-agent';

/**
 * Under a piece (owner, 2026-10-20: feedback is the main input). Its own person tells their agent what to
 * change (typed or spoken; it comes back as a new draft to react to). Anyone else leaves a public note,
 * which the piece's agent reads as feedback.
 */
export function PieceFeedback({ on, ownerHandle }: { on: string; ownerHandle: string }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  const [mine, setMine] = useState<boolean | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    void authFetch('/api/you').then(async (r) => setMine(r.ok ? ((await r.json()) as { who: { handle: string | null } }).who.handle?.toLowerCase() === ownerHandle.toLowerCase() : false)).catch(() => setMine(false));
  }, [signedIn, ownerHandle]);
  if (!signedIn || mine === null) return <NoteForm on={on} />;
  if (!mine) return <NoteForm on={on} />;
  return <TellAgent id="piece-tell" label={AGENT_WORDING.tell.note} send={(words, spoken) => sendRequest({ kind: 'note', words, spoken, version: on })} />;
}
