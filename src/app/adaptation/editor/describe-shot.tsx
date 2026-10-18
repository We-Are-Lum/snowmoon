'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { SignInButton } from '~/components/sign-in';
import { DescribeTextField } from '~/components/describe-text-field';
import type { ShotCamera } from './set3d';

/**
 * "Describe the shot" (branch describe-shot, 2026-10-18): say how to move the camera or the people, and
 * the editor applies the answer like a preset (the sliders, the handles, the live layout, and the change
 * kept in this browser for "Play with my changes", my-changes.ts). One step of Undo puts back the shot as
 * it was before. Signed in with Farcaster only, like the assistant, and counted in its daily limit.
 * Wording DRAFTED by the coding agent.
 */
export interface DescribePlace {
  name: string;
  kind: string;
  at: [number, number];
}
interface Status {
  ready: boolean;
  signedIn: boolean;
  perDay: number;
  left?: number;
}

export function DescribeShot({
  camera,
  set,
  ground,
  places,
  size,
  setup,
  apply,
}: {
  camera: ShotCamera | null;
  set: string;
  ground: number;
  places: DescribePlace[];
  size: string | null;
  setup: string | null;
  apply: (c: ShotCamera) => void;
}) {
  const auth = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [before, setBefore] = useState<ShotCamera | null>(null);

  const refresh = useCallback(async () => {
    const r = await authFetch('/api/describe-shot').catch(() => null);
    if (r?.ok) setStatus((await r.json()) as Status);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, auth.kind]);

  const describe = async () => {
    if (!camera || !words.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await authFetch('/api/describe-shot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ words, set, ground, camera, places, size, setup }),
      });
      const out = (await r.json().catch(() => ({}))) as { camera?: ShotCamera; clamped?: string[]; changed?: boolean; left?: number; error?: string };
      if (typeof out.left === 'number') setStatus((s) => (s ? { ...s, left: out.left } : s));
      if (r.status === 401) {
        setStatus((s) => (s ? { ...s, signedIn: false } : s));
        return setNote(out.error ?? 'Sign in with Farcaster to describe a shot');
      }
      if (!r.ok || !out.camera) return setNote(out.error ?? 'Could not work out the move');
      if (!out.changed) return setNote('Nothing to change: try other words.');
      setBefore(camera);
      apply(out.camera);
      setNote(out.clamped?.length ? 'Done, kept within the editor’s limits.' : 'Done.');
    } catch {
      setNote('Could not work out the move');
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    if (!before) return;
    apply(before);
    setBefore(null);
    setNote('Undone.');
  };

  if (status && !status.ready) return null;
  const signedIn = status ? status.signedIn : auth.kind === 'signed-in';
  return (
    <fieldset className="ed-controls ed-describe">
      <legend className="label">Describe the shot</legend>
      {!status ? (
        <p className="ed-help">…</p>
      ) : !signedIn ? (
        <div className="ed-row">
          <p className="ed-help">Sign in to move the camera and the people by describing the shot, for example &ldquo;lower, from behind Zei, tighter on Deluin&rdquo;.</p>
          <SignInButton className="ed-small" />
        </div>
      ) : (
        <>
          <DescribeTextField
            id="ed-describe"
            label="How should the camera or the people move?"
            value={words}
            onChange={setWords}
            maxLength={300}
            disabled={busy || !camera}
            placeholder="lower, from behind Zei, tighter on Deluin"
          />
          <div className="ed-describe-actions">
            <button type="button" className="ed-small" onClick={describe} disabled={busy || !camera || !words.trim() || status.left === 0}>
              {busy ? 'Working it out…' : 'Move it'}
            </button>
            <button type="button" className="ed-small" onClick={undo} disabled={!before || busy}>
              Undo
            </button>
          </div>
          {typeof status.left === 'number' && (
            <p className="label ed-muted ed-describe-left">
              {status.left} of {status.perDay} left today, shared with the assistant
            </p>
          )}
        </>
      )}
      {note && (
        <p className="ed-help" role="status">
          {note}
        </p>
      )}
    </fieldset>
  );
}
