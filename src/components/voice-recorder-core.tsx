'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, inMiniApp } from '~/lib/client-auth';
import { HOST_CHECK_MS, HOST_PROMPT_MS, withTimeout } from '~/lib/host-timeout';
import { MIC_HELP, micPlace } from '~/lib/mic-help';

/**
 * The voice recorders' shared pieces (moved here from src/components/voice-record.tsx for the four-step recorder,
 * 2026-11-26, unchanged): the microphone and MediaRecorder hook, the step log, joining redone sentences into one take,
 * and audio fetched behind the sign-in.
 */
/** The recorder's bitrate: about 2.9 MB for a 3:00 take (Nate's review, 2026-11-24). */
export const TAKE_BITS_PER_SECOND = 128_000;

export interface Check { n: number; ok: boolean; bySound?: { expected: string; heard: string }[]; missing: string[]; extra: string[]; start: number | null; end: number | null }
export interface Converted { blob: Blob; url: string; ticket: string; check?: string; checks?: Check[]; seconds: number; draftId?: string }
export interface Redo extends Converted { n: number }

export const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus'];
export const pickType = () => (typeof MediaRecorder === 'undefined' ? '' : (TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''));
export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A small recorder: the microphone (asked of the Farcaster app first when it offers it), MediaRecorder, a level. */
/**
 * A plain step log for troubleshooting (Nate, 2026-11-21: Chrome and the Farcaster app fail where Safari works), shown
 * under the recorder as /admin/mic-test shows its own. Text only: what each step answered, never any audio.
 */
export type Note = (s: string) => void;
export function useStepLog() {
  const [lines, setLines] = useState<string[]>([]);
  const t0 = useRef(typeof performance === 'undefined' ? 0 : performance.now());
  const note: Note = useCallback((s: string) => setLines((l) => [...l.slice(-80), `${((performance.now() - t0.current) / 1000).toFixed(1)}s ${s}`]), []);
  return { lines, note };
}
export const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
export const raced = (what: string, r: { ok: boolean; why?: string; error?: string }, ok: string) =>
  r.ok ? `${what}: ${ok}` : `${what}: ${r.why === 'timeout' ? 'no answer in time (timed out), treated as unknown' : `error (${r.error}), treated as unknown`}`;

export function useRecorder(note: Note) {
  const [state, setState] = useState<'idle' | 'asking' | 'recording'>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const done = useRef<((r: { blob: Blob; seconds: number } | null) => void) | null>(null);
  const timer = useRef<number | null>(null);

  const stopAll = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopAll, []);

  const inApp = useRef<boolean | null>(null);
  const start = async (limitSeconds: number): Promise<{ blob: Blob; seconds: number } | null> => {
    setError(null);
    setState('asking');
    try {
      // Never block Record on a host check (Nate, 2026-11-21): each is raced (2 s), and no answer is "unknown", treated
      // as maybe the Farcaster app. There, the app is asked for the microphone when it says it can, or when that's
      // unknown and the SDK has the action (10 s for its prompt); then getUserMedia either way.
      note('Record pressed');
      const app = await withTimeout(inMiniApp(), HOST_CHECK_MS);
      inApp.current = app.ok ? app.value : null;
      note(raced('host check: in the Farcaster app?', app, app.ok ? (app.value ? 'yes' : 'no') : ''));
      if (inApp.current !== false) {
        const caps = await withTimeout(() => sdk.getCapabilities(), HOST_CHECK_MS);
        const has = caps.ok ? caps.value.includes('actions.requestCameraAndMicrophoneAccess') : null;
        note(raced('host check: capabilities', caps, caps.ok ? `answered; microphone action ${has ? 'offered' : 'not offered'}` : ''));
        if (has === true || (has === null && typeof sdk.actions?.requestCameraAndMicrophoneAccess === 'function')) {
          note("asking the Farcaster app for the microphone");
          const asked = await withTimeout(() => sdk.actions.requestCameraAndMicrophoneAccess(), HOST_PROMPT_MS);
          note(raced("the app's microphone prompt", asked, 'answered'));
        }
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no microphone access (no getUserMedia).');
      note('asking the browser for the microphone (getUserMedia)');
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      note(`microphone granted: ${s.getAudioTracks().length} audio track(s)`);
      stream.current = s;
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        if (!stream.current) return void ac.close();
        an.getByteTimeDomainData(buf);
        let m = 0;
        for (const v of buf) m = Math.max(m, Math.abs(v - 128));
        setLevel(m / 128);
        requestAnimationFrame(tick);
      };
      tick();
      const type = pickType();
      const supported = typeof MediaRecorder === 'undefined' ? 'none (no MediaRecorder)' : TYPES.filter((t) => MediaRecorder.isTypeSupported(t)).join(', ') || 'none of ours';
      note(`recording format: asked ${type || '(browser default)'}; supported: ${supported}`);
      // 128 kb/s (Nate's review, 2026-11-24): a 3:00 take is then about 2.9 MB, under the 4 MB a take may be. The browser's
      // default can be 192 kb/s or more, about 4.3 MB for 3:00.
      const r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: TAKE_BITS_PER_SECOND });
      r.onerror = (e) => note(`recorder error: ${errText((e as unknown as { error?: unknown }).error ?? e)}`);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      const result = new Promise<{ blob: Blob; seconds: number } | null>((res) => (done.current = res));
      r.onstop = () => {
        const seconds = (performance.now() - started.current) / 1000;
        stopAll();
        setState('idle');
        const blob = new Blob(parts, { type: r.mimeType || type || 'audio/webm' });
        parts.length = 0;
        note(`recording stopped: ${seconds.toFixed(1)} s, ${blob.size} bytes, ${blob.type || 'no type'}`);
        done.current?.(blob.size ? { blob, seconds } : null);
      };
      rec.current = r;
      started.current = performance.now();
      setElapsed(0);
      timer.current = window.setInterval(() => {
        const t = (performance.now() - started.current) / 1000;
        setElapsed(t);
        if (t >= limitSeconds && r.state === 'recording') r.stop();
      }, 200);
      r.start(1000);
      note(`recording started (${r.mimeType || 'no type reported'})`);
      setState('recording');
      return result;
    } catch (e) {
      stopAll();
      setState('idle');
      note(`microphone or recorder failed: ${errText(e)}`);
      // Refused: the line for this browser or the app (src/lib/mic-help.ts, reread 2026-11-21).
      setError(e instanceof Error && /denied|NotAllowed/i.test(`${e.name} ${e.message}`) ? MIC_HELP[micPlace(navigator.userAgent, inApp.current === true)] : 'The microphone could not be opened here.');
      return null;
    }
  };
  const stop = () => rec.current?.state === 'recording' && rec.current.stop();
  return { state, level, elapsed, error, start, stop };
}

/** Play the whole take with redone sentences spliced in: decoded and joined in the browser, played as a WAV. */
export async function joined(main: Blob, redos: Redo[], checks: Check[] | undefined): Promise<string> {
  const ac = new AudioContext();
  try {
    const dec = async (b: Blob) => ac.decodeAudioData(await b.arrayBuffer());
    const m = await dec(main);
    const sr = m.sampleRate;
    const pieces: Float32Array[] = [];
    const ch0 = (b: AudioBuffer) => {
      if (b.numberOfChannels === 1) return b.getChannelData(0);
      const out = new Float32Array(b.length);
      for (let c = 0; c < b.numberOfChannels; c++) b.getChannelData(c).forEach((v, i) => (out[i] += v / b.numberOfChannels));
      return out;
    };
    const mainData = ch0(m);
    let cursor = 0;
    for (const r of [...redos].sort((a, b) => a.n - b.n)) {
      const c = checks?.find((x) => x.n === r.n);
      const start = Math.floor((c?.start ?? cursor / sr) * sr);
      const end = Math.floor((c?.end ?? c?.start ?? cursor / sr) * sr);
      if (start < cursor) continue;
      pieces.push(mainData.subarray(cursor, start));
      const clip = await dec(r.blob);
      // Resampled to the take's rate by the browser's decoder when rates differ.
      pieces.push(ch0(clip));
      cursor = Math.max(start, end);
    }
    pieces.push(mainData.subarray(cursor));
    const total = pieces.reduce((s, p) => s + p.length, 0);
    const wav = new DataView(new ArrayBuffer(44 + total * 2));
    const w = (o: number, s: string) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); wav.setUint32(4, 36 + total * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, sr, true);
    wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, total * 2, true);
    let o = 44;
    for (const p of pieces) for (const v of p) { wav.setInt16(o, Math.max(-1, Math.min(1, v)) * 0x7fff, true); o += 2; }
    return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  } finally {
    void ac.close();
  }
}

/** Audio behind our sign-in (a bearer header, which an <audio> element can't send): fetched on demand, played from memory. */
export function SignedAudio({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (url) return <audio controls autoPlay src={url} className="vr-audio" />;
  return (
    <button
      type="button"
      className="vr-btn vr-quiet vr-small-btn"
      onClick={async () => {
        const r = await authFetch(path).catch(() => null);
        if (r?.ok) setUrl(URL.createObjectURL(await r.blob()));
        else setFailed(true);
      }}
    >
      {failed ? `${label}: not available` : `▶ ${label}`}
    </button>
  );
}

