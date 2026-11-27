'use client';

import { useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { RESET_WORDING as W } from '~/lib/voice/free-scene-reset';
import { PersonNumberField } from '~/components/person-number-field';

/**
 * /admin/activity's reset of a person's free Ephelion picture (Nate, 2026-11-27), for someone who lost theirs. Drawn only
 * for a signed-in admin (inside AdminActivity); POST /api/voice/free-scene-reset decides on the server (admins only) and logs it.
 */
export function AdminFreeSceneReset() {
  const [person, setPerson] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const reset = async () => {
    setBusy(true);
    const r = await authFetch('/api/voice/free-scene-reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ person: person.trim() }) }).catch(() => null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { message?: string; error?: string };
    setBusy(false);
    setAsk(false);
    setNote(j.message ?? j.error ?? W.failed);
  };
  return (
    <section className="aa-section" aria-labelledby="aa-free-scene-h">
      <h2 id="aa-free-scene-h">{W.heading}</h2>
      <p className="aa-note">{W.intro}</p>
      <PersonNumberField id="aa-free-scene-person" label={W.label} value={person} onChange={(v) => (setPerson(v), setAsk(false), setNote(null))} />
      {ask ? (
        <div className="aa-controls" role="alert">
          <p>{W.ask(person.trim())}</p>
          <button type="button" onClick={() => void reset()} disabled={busy}>{W.yes}</button>
          <button type="button" onClick={() => setAsk(false)} disabled={busy}>{W.no}</button>
        </div>
      ) : (
        <div className="aa-controls">
          <button type="button" onClick={() => setAsk(true)} disabled={!/^-?[0-9]{1,19}$/.test(person.trim())}>{W.button}</button>
        </div>
      )}
      {note && <p className="aa-note" role="status">{note}</p>}
    </section>
  );
}
