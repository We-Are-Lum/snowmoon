'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { NoteForm } from './note-form';
import { TellAgent, sendRequest } from './tell-agent';
import { DraftRow } from './agents-you';
import type { VersionView } from '~/lib/agents/pieces';

/**
 * Under a piece (owner, 2026-10-20: feedback is the main input). Its own person tells their agent what to
 * change (typed or spoken; it comes back as a new draft to react to). Anyone else leaves a public note,
 * which the piece's agent reads as feedback.
 */
export function PieceFeedback({ on, piece, ownerHandle }: { on: string; piece: string; ownerHandle: string }) {
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
  return <OwnPiece on={on} piece={piece} />;
}

/** The piece's own person: tell the agent, and react to its new version right here when it lands. */
function OwnPiece({ on, piece }: { on: string; piece: string }) {
  const [drafts, setDrafts] = useState<VersionView[]>([]);
  const [asked, setAsked] = useState(false);
  const load = async () => {
    const r = await authFetch('/api/drafts').catch(() => null);
    if (r?.ok) setDrafts(((await r.json()) as { drafts: VersionView[] }).drafts.filter((d) => d.piece === piece));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece]);
  useEffect(() => {
    if (!asked || drafts.length) return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, drafts.length]);
  return (
    <>
      {drafts.map((d) => (
        <div key={d.id} className="piece-own-draft">
          <p className="you-note">{AGENT_WORDING.you.review}:</p>
          <DraftRow v={d} onDone={() => window.location.reload()} />
        </div>
      ))}
      {!drafts.length && (
        <TellAgent id="piece-tell" label={AGENT_WORDING.tell.note} send={async (words, spoken) => {
          const err = await sendRequest({ kind: 'note', words, spoken, version: on });
          if (!err) setAsked(true);
          return err;
        }} />
      )}
    </>
  );
}
