'use client';

import { useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { ADMINS } from '~/lib/config';
import { BACKSTORY_MAX, BACKSTORY_WORDING as B, type StoredBackstory } from '~/lib/challenge/backstory';
import { PublishedTextField } from './publish-words';

/**
 * The Backstory box (owner, 2026-11-09): the three starter questions as hints above it (never put in the box), the box
 * itself (a PublishedTextField: typed text only, at most BACKSTORY_MAX characters, with the publication line), and the
 * tick "Mentions things from later in the book". No request and no model here: what's in the box is what was typed.
 */
export function BackstoryField(p: { name: string; text: string; spoils: boolean; onText: (v: string) => void; onSpoils: (v: boolean) => void; id?: string }) {
  const id = p.id ?? 'mk-backstory';
  return (
    <section className="mk-backstory" data-slot="backstory">
      <ul className="mk-backstory-hints dz-muted" aria-label="Questions to start from">
        {B.hints(p.name).map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <PublishedTextField id={id} label={`${B.label} ${B.optional}`} value={p.text} onChange={p.onText} rows={4} maxLength={BACKSTORY_MAX} />
      <label className="mk-backstory-tick">
        <input type="checkbox" checked={p.spoils} onChange={(e) => p.onSpoils(e.target.checked)} /> {B.spoilTick}
      </label>
    </section>
  );
}

/** A picture's backstory as shown under it: the words, "Invented by @maker, not from the book", and the spoiler label. */
export function BackstoryShown(p: { backstory: StoredBackstory; maker: string }) {
  return (
    <section className="mk-backstory-shown" data-slot="backstory-shown">
      <p className="mk-backstory-text">{p.backstory.text}</p>
      <p className="dz-muted mk-backstory-by">{B.invented(p.maker)}</p>
      {p.backstory.spoils && <p className="dz-muted mk-backstory-spoils">{B.spoils}</p>}
    </section>
  );
}

/** "Add backstory" for an admin on their own published challenge picture or first remix (POST /api/challenge/backstory). */
export function AddBackstory(p: { versionId: string; name: string; onAdded: (b: StoredBackstory) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [spoils, setSpoils] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="ic-secondary mk-backstory-add" onClick={() => setOpen(true)}>
        {B.add}
      </button>
    );
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await authFetch('/api/challenge/backstory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId: p.versionId, backstory: { text, spoils } }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { backstory?: StoredBackstory; error?: string };
    setBusy(false);
    if (!r?.ok || !out.backstory) return setError(out.error ?? 'Could not save it');
    p.onAdded(out.backstory);
  };
  return (
    <div className="mk-backstory-admin">
      <BackstoryField id="mk-backstory-add" name={p.name} text={text} spoils={spoils} onText={setText} onSpoils={setSpoils} />
      <button type="button" className="rl-remix" onClick={save} disabled={busy || !text.trim()}>
        {B.save}
      </button>
      {error && (
        <p className="ia-note" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** On a sheet page (a first remix): "Add backstory" for its maker when they are an admin; the page reloads after. */
export function AdminAddBackstory(p: { versionId: string; byFid: number; name: string }) {
  const auth = useAuth();
  if (auth.kind !== 'signed-in' || auth.fid !== p.byFid || !ADMINS.includes(auth.fid)) return null;
  return <AddBackstory versionId={p.versionId} name={p.name} onAdded={() => window.location.reload()} />;
}
