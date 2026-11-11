'use client';

import { useState } from 'react';
import { authFetch, useAuth, useSocialSession, useWalletSession } from '~/lib/client-auth';
import { PublishedTextField } from '../publish-words';

/** A signed-in person's note on a published version: public at once, with their name (owner, 2026-10-20). DRAFT wording. */
export function NoteForm({ on }: { on: string }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const social = useSocialSession();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (auth.kind !== 'signed-in' && !wallet && !social) return <p className="you-note">Sign in to leave a note.</p>;
  const send = async () => {
    setBusy(true);
    setNote(null);
    const res = await authFetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on, text }) }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { error?: string; consent?: boolean };
    if (res?.ok) {
      setText('');
      window.location.reload();
    } else setNote(out.consent ? 'Agree to how your words are published first (you’ll be asked when you next publish).' : (out.error ?? 'That didn’t work. Try again.'));
    setBusy(false);
  };
  return (
    <div className="piece-note-form">
      <PublishedTextField id="piece-note" label="Leave a note (@name mentions someone; “@name’s agent” their agents)" value={text} onChange={setText} rows={3} maxLength={500} />
      {note && <p role="alert" className="you-note">{note}</p>}
      <button type="button" className="ic-primary" disabled={busy || !text.trim()} onClick={() => void send()}>Post note</button>
    </div>
  );
}
