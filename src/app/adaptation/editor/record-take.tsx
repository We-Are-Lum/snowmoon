'use client';

import { useEffect, useRef, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { TAKES } from '~/lib/config';

/**
 * "Record your own take" under a line (owner, 2026-10-19; switched off with TAKES.enabled). Records in
 * the browser only, never from a file, up to TAKES.maxSeconds; you can listen before sending. Sending
 * converts it into the character's voice on our server; only the converted take is kept, labelled
 * AI-converted. Your own recording stays in this page until you send or discard it, and is never kept.
 * DRAFT wording.
 */
type Take = { id: string; url: string; seconds: number; by: string | null; label: string };
const pickType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
};

export function RecordTake({ adaptation, version, cue, speaker }: { adaptation: number; version: number; cue: string; speaker: string }) {
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'sending'>('idle');
  const [secs, setSecs] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const q = `adaptation=${adaptation}&version=${version}&cue=${encodeURIComponent(cue)}`;

  useEffect(() => {
    void fetch(`/api/takes?${q}`).then((r) => (r.ok ? r.json() : null)).then((j: { takes?: Take[] } | null) => j?.takes && setTakes(j.takes)).catch(() => {});
  }, [q]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
  };
  const start = async () => {
    setNote(null);
    const type = pickType();
    if (type === null) return setNote('This browser can’t record audio.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setNote('The microphone wasn’t allowed.');
    }
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      blob.current = new Blob(chunks.current, { type: (r.mimeType || 'audio/webm').split(';')[0] });
      setPreview(URL.createObjectURL(blob.current));
      setState('review');
    };
    rec.current = r;
    r.start();
    setSecs(0);
    setState('recording');
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setSecs(s);
      if (s >= TAKES.maxSeconds) stop();
    }, 200);
  };
  const discard = () => {
    blob.current = null;
    setPreview(null);
    setState('idle');
  };
  const send = async () => {
    if (!blob.current) return;
    setState('sending');
    setNote('Converting into ' + speaker + '’s voice…');
    const res = await authFetch(`/api/takes?${q}`, { method: 'POST', headers: { 'content-type': blob.current.type }, body: blob.current }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as Partial<Take> & { error?: string };
    if (res?.ok && j.id && j.url) {
      setTakes([{ id: j.id, url: j.url, seconds: j.seconds ?? 0, by: null, label: j.label ?? TAKES.label }, ...takes]);
      setNote('Your take is saved to this line, in ' + speaker + '’s voice. Your own recording wasn’t kept.');
      discard();
    } else {
      setNote(j.error ?? 'That didn’t work. Try again in a moment.');
      setState('review');
    }
  };

  return (
    <div className="ed-take">
      <p className="label">Record your take · {speaker} · up to {TAKES.maxSeconds} s</p>
      {state === 'idle' && <button type="button" className="ed-btn" onClick={() => void start()}>Record</button>}
      {state === 'recording' && <button type="button" className="ed-btn" onClick={stop}>Stop · {secs.toFixed(0)} s</button>}
      {(state === 'review' || state === 'sending') && preview && (
        <div className="ed-row">
          <audio controls src={preview} aria-label="Your recording, on this device only" />
          <button type="button" className="ed-btn" disabled={state === 'sending'} onClick={() => void send()}>Convert and save</button>
          <button type="button" className="ed-btn" disabled={state === 'sending'} onClick={discard}>Discard</button>
        </div>
      )}
      <p className="ed-help">
        Your recording is sent to our server and converted into {speaker}&rsquo;s voice by Chatterbox (open weights), which we run ourselves on Modal; Modal may not train on it. Only the converted take is kept, public with your name; your own recording is never kept or published.
      </p>
      {note && <p className="ed-help" role="status">{note}</p>}
      {takes.length > 0 && (
        <ul className="ed-takes">
          {takes.map((t) => (
            <li key={t.id}>
              <audio controls preload="none" src={t.url} aria-label={`A take of ${speaker}${t.by ? ` by ${t.by}` : ''}`} />
              <span className="label">{t.by ? `by ${t.by} · ` : ''}{t.seconds.toFixed(1)} s · {t.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
