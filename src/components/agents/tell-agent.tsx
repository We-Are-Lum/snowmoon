'use client';

import { useRef, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { PublishedTextField } from '../publish-words';

/**
 * The one place a person does the creative act (owner, 2026-10-20): say or type an idea or a note; the
 * agent does the work. Speaking counts as writing: the recording goes to our server to be transcribed and
 * is never kept; the words come back into the box for the person to check, then they send them as theirs.
 * Used on /you (a new idea), on a piece (a note on it), on a moment, and as "Say more" on a draft.
 */
const W = AGENT_WORDING.tell;

export function TellAgent({ id, label, send, compact = false }: { id: string; label: string; send: (words: string, spoken: boolean) => Promise<string | null>; compact?: boolean }) {
  const [words, setWords] = useState('');
  const [spoken, setSpoken] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const start = async () => {
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
        const res = await authFetch('/api/requests/transcribe', { method: 'POST', headers: { 'content-type': blob.type.split(';')[0] }, body: blob }).catch(() => null);
        const out = (await res?.json().catch(() => ({}))) as { text?: string; error?: string };
        if (res?.ok && out.text) {
          setWords((w) => (w ? `${w} ${out.text}` : out.text!));
          setSpoken(true);
          setNote(W.check);
        } else setNote(out.error ?? W.failed);
        setBusy(false);
      };
      rec.current = r;
      r.start();
      setRecording(true);
      setTimeout(() => r.state === 'recording' && r.stop(), 120_000);
    } catch {
      setNote(W.noMic);
    }
  };
  const stop = () => {
    rec.current?.stop();
    setRecording(false);
  };
  const go = async () => {
    setBusy(true);
    const err = await send(words, spoken);
    if (err) setNote(err);
    else {
      setWords('');
      setSpoken(false);
      setNote(W.sent);
    }
    setBusy(false);
  };
  return (
    <div className={`tell-agent${compact ? ' tell-agent-compact' : ''}`}>
      <PublishedTextField id={id} label={label} value={words} onChange={(v) => setWords(v)} rows={compact ? 2 : 3} maxLength={2000} />
      <p className="you-note">{W.when}</p>
      <div className="tell-buttons">
        {recording ? (
          <button type="button" className="ic-secondary tell-mic tell-mic-on" onClick={stop}>{W.stop}</button>
        ) : (
          <button type="button" className="ic-secondary tell-mic" disabled={busy} onClick={() => void start()}>{W.speak}</button>
        )}
        <button type="button" className="ic-primary" disabled={busy || recording || !words.trim()} onClick={() => void go()}>{W.send}</button>
      </div>
      {note && <p className="you-note" role="status">{note}</p>}
    </div>
  );
}

export async function sendRequest(body: Record<string, unknown>): Promise<string | null> {
  const r = await authFetch('/api/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (r?.ok) return null;
  const out = (await r?.json().catch(() => ({}))) as { error?: string; consent?: boolean };
  return out.consent ? W.consent : (out.error ?? W.failed);
}
