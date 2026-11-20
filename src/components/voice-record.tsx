'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, inMiniApp, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import '../styles/voice.css';

/**
 * /storyboard/record, the Ephelion voice slice 1 (Nate, 2026-11-19; DRAFT, admins only behind VOICE's switch):
 * consent, pick a voice, record the whole speech with the words scrolling, convert it with ElevenLabs, check it word
 * for word, redo one sentence, accept a private draft; or listen to the ready-made reading.
 *
 * The raw take lives in this tab only (a Blob in a ref), is sent once for conversion and dropped right after, whatever
 * the answer; it is never stored by the site. Leaving the page before Accept discards everything.
 */

interface Choice { presetId: string; name: string; description: string; candidate: number; generatedVoiceId: string; previewUrl: string; saved: boolean }
interface Check { n: number; ok: boolean; missing: string[]; extra: string[]; start: number | null; end: number | null }
interface Status {
  ready: boolean;
  speech: { id: string; title: string; character: string; source: { kind: string; block?: string }; standIn: boolean; paragraphs: string[]; sentences: { n: number; text: string }[]; characters: number };
  choices: Choice[];
  consent: { version: string; line: string; title: string; text: string[]; sha256: string; agreed: boolean };
  models: { convert: string; transcribe: string; reading: string; design: string; provider: string };
  limits: { maxTakeSeconds: number; maxSentenceSeconds: number; maxTakeBytes: number; creditsPerMinute: number };
  today: { funded: string; credits: number; capCredits: number; conversionsLeft: number } | null;
  drafts: { id: string; kind: string; speechId: string; presetId: string; madeAt: string; publishedAt: string | null; recipe: Record<string, unknown>; audio: { n: number; role: string; sentence: number | null }[] }[];
  readings: { presetId: string; id: string; candidate: number | null; madeAt: string }[];
}
interface Converted { blob: Blob; url: string; ticket: string; check?: string; checks?: Check[]; seconds: number }
interface Redo extends Converted { n: number }

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus'];
const pickType = () => (typeof MediaRecorder === 'undefined' ? '' : (TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''));
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A small recorder: the microphone (asked of the Farcaster app first when it offers it), MediaRecorder, a level. */
function useRecorder() {
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

  const start = async (limitSeconds: number): Promise<{ blob: Blob; seconds: number } | null> => {
    setError(null);
    setState('asking');
    try {
      if (await inMiniApp()) {
        const caps = await sdk.getCapabilities().catch(() => [] as string[]);
        if (caps.includes('actions.requestCameraAndMicrophoneAccess')) await sdk.actions.requestCameraAndMicrophoneAccess();
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no microphone access.');
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
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
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      const result = new Promise<{ blob: Blob; seconds: number } | null>((res) => (done.current = res));
      r.onstop = () => {
        const seconds = (performance.now() - started.current) / 1000;
        stopAll();
        setState('idle');
        const blob = new Blob(parts, { type: r.mimeType || type || 'audio/webm' });
        parts.length = 0;
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
      setState('recording');
      return result;
    } catch (e) {
      stopAll();
      setState('idle');
      setError(e instanceof Error && /denied|NotAllowed/i.test(`${e.name} ${e.message}`) ? 'The microphone was refused. Allow it for this site, then try again.' : 'The microphone could not be opened here.');
      return null;
    }
  };
  const stop = () => rec.current?.state === 'recording' && rec.current.stop();
  return { state, level, elapsed, error, start, stop };
}

/** Play the whole take with redone sentences spliced in: decoded and joined in the browser, played as a WAV. */
async function joined(main: Blob, redos: Redo[], checks: Check[] | undefined): Promise<string> {
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
function SignedAudio({ path, label }: { path: string; label: string }) {
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

export function VoiceRecord({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [status, setStatus] = useState<Status | null | 'none'>(null);
  const [webClient, setWebClient] = useState(false);
  const [choice, setChoice] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [take, setTake] = useState<{ seconds: number; url: string } | null>(null);
  const takeBlob = useRef<Blob | null>(null);
  const [agree, setAgree] = useState(false);
  const [converted, setConverted] = useState<Converted | null>(null);
  const [redos, setRedos] = useState<Redo[]>([]);
  const [redoing, setRedoing] = useState<number | null>(null);
  const [redoAgree, setRedoAgree] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [wpm, setWpm] = useState(140);
  const rec = useRecorder();
  const prompter = useRef<HTMLOListElement | null>(null);

  const load = useCallback(async () => {
    const r = await authFetch('/api/voice/status', { cache: 'no-store' }).catch(() => null);
    setStatus(r?.ok ? ((await r.json()) as Status) : 'none');
  }, []);
  useEffect(() => {
    if (!admin) return;
    void load();
    void (async () => {
      if (await inMiniApp()) {
        const ctx = await sdk.context.catch(() => null);
        setWebClient(ctx?.client?.platformType === 'web');
      }
    })();
  }, [admin, load]);

  // Leaving before Accept discards: say so if there is something to lose.
  useEffect(() => {
    if (!converted || accepted) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [converted, accepted]);

  const s = status && status !== 'none' ? status : null;
  const picked = useMemo(() => s?.choices.find((c) => `${c.presetId}#${c.candidate}` === choice) ?? null, [s, choice]);
  const words = useMemo(() => (s ? s.speech.sentences.map((x) => wordCount(x.text)) : []), [s]);
  const totalWords = words.reduce((a, b) => a + b, 0);
  const estMinutes = totalWords / wpm;

  // The words scroll at the chosen pace while recording.
  const current = useMemo(() => {
    if (rec.state !== 'recording' || redoing !== null) return -1;
    let w = (rec.elapsed / 60) * wpm;
    for (const [i, n] of words.entries()) {
      if (w < n) return i;
      w -= n;
    }
    return words.length - 1;
  }, [rec.state, rec.elapsed, wpm, words, redoing]);
  useEffect(() => {
    const li = prompter.current?.querySelector<HTMLElement>(`[data-n="${current}"]`);
    li?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  if (!admin || status === 'none') return <>{fallback}</>;
  if (!s) return <main className="vr"><p className="vr-note">Loading…</p></main>;

  const credits = (sec: number) => Math.ceil((sec / 60) * s.limits.creditsPerMinute);
  const dropTake = () => {
    if (take) URL.revokeObjectURL(take.url);
    takeBlob.current = null;
    setTake(null);
    setAgree(false);
  };

  async function agreeConsent() {
    setBusy('consent');
    const r = await authFetch('/api/voice/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: s!.consent.sha256 }) });
    setBusy(null);
    if (r.ok) void load();
    else setMessage(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong');
  }

  async function recordWhole() {
    dropTake();
    setConverted(null);
    setRedos([]);
    setAccepted(null);
    setPlayUrl(null);
    setMessage(null);
    const out = await rec.start(s!.limits.maxTakeSeconds);
    if (out) {
      takeBlob.current = out.blob;
      setTake({ seconds: out.seconds, url: URL.createObjectURL(out.blob) });
    }
  }

  /** Send one recording, once, then forget it, whatever the answer. */
  async function convert(blob: Blob, seconds: number, sentence: number | null): Promise<Converted | null> {
    const form = new FormData();
    form.set('take', blob, 'take');
    form.set('speechId', s!.speech.id);
    form.set('presetId', picked!.presetId);
    form.set('candidate', String(picked!.candidate));
    form.set('seconds', String(seconds));
    form.set('agree', s!.consent.sha256);
    if (sentence !== null) form.set('sentence', String(sentence));
    const r = await authFetch('/api/voice/convert', { method: 'POST', body: form }).catch(() => null);
    if (!r?.ok) {
      setMessage(((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? 'The conversion failed. Your recording was not kept.');
      return null;
    }
    const out = await r.blob();
    const c: Converted = { blob: out, url: URL.createObjectURL(out), ticket: r.headers.get('x-voice-ticket') ?? '', seconds };
    const tf = new FormData();
    tf.set('audio', out, 'converted.mp3');
    tf.set('ticket', c.ticket);
    const t = await authFetch('/api/voice/transcribe', { method: 'POST', body: tf }).catch(() => null);
    if (t?.ok) {
      const j = (await t.json()) as { checks: Check[]; check: string };
      c.checks = j.checks;
      c.check = j.check;
    } else setMessage('Converted, but the word check failed. Try the check again later.');
    return c;
  }

  /** Ask for the word check again (the conversion is kept in the tab; only the converted audio is sent). */
  async function recheck() {
    if (!converted) return;
    setBusy('check');
    setMessage(null);
    const tf = new FormData();
    tf.set('audio', converted.blob, 'converted.mp3');
    tf.set('ticket', converted.ticket);
    const t = await authFetch('/api/voice/transcribe', { method: 'POST', body: tf }).catch(() => null);
    setBusy(null);
    if (t?.ok) {
      const j = (await t.json()) as { checks: Check[]; check: string };
      setConverted({ ...converted, checks: j.checks, check: j.check });
    } else setMessage(((await t?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? 'The word check failed again.');
  }

  async function convertWhole() {
    const blob = takeBlob.current;
    if (!blob || !take || !picked) return;
    setBusy('convert');
    setMessage(null);
    const seconds = take.seconds;
    // Sent once: the take leaves this tab's memory now, converted or not.
    dropTake();
    const c = await convert(blob, seconds, null);
    setBusy(null);
    if (c) {
      setConverted(c);
      setPlayUrl(c.url);
      void load();
    }
  }

  async function redoSentence(n: number) {
    setMessage(null);
    setRedoing(n);
    setRedoAgree(false);
  }
  async function recordRedo() {
    if (redoing === null) return;
    const out = await rec.start(s!.limits.maxSentenceSeconds);
    if (!out) return;
    setBusy('redo');
    const c = await convert(out.blob, out.seconds, redoing);
    setBusy(null);
    if (!c) return;
    const r: Redo = { ...c, n: redoing };
    const next = [...redos.filter((x) => x.n !== redoing), r];
    setRedos(next);
    setRedoing(null);
    if (converted) setPlayUrl(await joined(converted.blob, next, converted.checks).catch(() => converted.url));
    void load();
  }

  async function accept() {
    if (!converted?.check) return;
    setBusy('accept');
    const f = new FormData();
    f.set('take', converted.blob, 'take.mp3');
    f.set('ticket', converted.ticket);
    f.set('check', converted.check);
    for (const r of redos) {
      if (!r.check) continue;
      f.append('redo', r.blob, `redo-${r.n}.mp3`);
      f.append('redoTicket', r.ticket);
      f.append('redoCheck', r.check);
    }
    const r = await authFetch('/api/voice/accept', { method: 'POST', body: f });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
    if (r.ok && j.id) {
      setAccepted(j.id);
      void load();
    } else setMessage(j.error ?? 'Nothing was kept');
  }
  function discard() {
    setConverted(null);
    setRedos([]);
    setPlayUrl(null);
    setAccepted(null);
  }

  async function removeDraft(id: string) {
    if (!window.confirm('Remove this draft? Its audio is deleted and it can\'t be brought back.')) return;
    setBusy('remove');
    const r = await authFetch(`/api/voice/drafts/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (r.ok) void load();
    else setMessage(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'It could not be removed');
  }

  async function makeReading() {
    if (!picked) return;
    setBusy('reading');
    const r = await authFetch('/api/voice/reading', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speechId: s!.speech.id, presetId: picked.presetId, candidate: picked.candidate }) });
    setBusy(null);
    if (r.ok) void load();
    else setMessage(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'The reading failed');
  }

  const groups = [...new Set(s.choices.map((c) => c.presetId))].map((id) => ({ id, items: s.choices.filter((c) => c.presetId === id) }));
  const reading = picked ? s.readings.find((r) => r.presetId === picked.presetId) : undefined;
  const checks = converted?.checks;
  const stillWrong = checks?.filter((c) => !c.ok && !redos.find((r) => r.n === c.n && r.checks?.[0]?.ok)) ?? [];
  const recording = rec.state === 'recording';

  return (
    <main className="vr">
      <p className="vr-kicker">Admin trial · Draft</p>
      <h1>{s.speech.title}</h1>
      <p className="vr-labels">
        <span className="vr-tag">Book</span> Lord Ephelion&rsquo;s letter, {s.speech.source.block}, word for word
        {s.speech.standIn && <> · <span className="vr-tag">Stand-in</span> until the team&rsquo;s speeches arrive</>} · <span className="vr-tag">Invented</span> performing it aloud is this edition&rsquo;s
      </p>
      {!s.ready && <p className="vr-warn" role="status">Not ready: the voice service isn&rsquo;t set up on this server.</p>}
      {message && <p className="vr-warn" role="alert">{message}</p>}

      {!s.consent.agreed && (
        <section className="vr-card vr-consent" aria-labelledby="vr-consent-h">
          <p className="vr-kicker">Draft wording · {s.consent.version}</p>
          <h2 id="vr-consent-h">{s.consent.title}</h2>
          <ol>
            {s.consent.text.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <p className="vr-line">{s.consent.line}</p>
          <button type="button" className="vr-btn" onClick={agreeConsent} disabled={busy === 'consent'}>
            I agree
          </button>
        </section>
      )}

      {s.consent.agreed && (
        <>
          <section className="vr-card" aria-labelledby="vr-pick-h">
            <h2 id="vr-pick-h">1. Pick a voice</h2>
            <p className="vr-note">
              Each plays the opening of the letter. <span className="vr-tag">AI</span> Made with ElevenLabs Voice Design ({s.models.design}, a closed model by ElevenLabs) from a description this edition wrote. Until Nate picks, the twelve previews stand in.
            </p>
            {groups.map((g) => (
              <fieldset key={g.id} className="vr-group">
                <legend>{g.items[0].name.replace(/ \d$/, '')}</legend>
                <p className="vr-desc">{g.items[0].description}</p>
                {g.items.map((c) => {
                  const k = `${c.presetId}#${c.candidate}`;
                  return (
                    <label key={k} className={`vr-choice${choice === k ? ' vr-on' : ''}`}>
                      <input type="radio" name="voice" value={k} checked={choice === k} onChange={() => setChoice(k)} />
                      <span>{c.name}</span>
                      <audio controls preload="none" src={c.previewUrl} />
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </section>

          {picked && (
            <section className="vr-card" aria-labelledby="vr-ready-h">
              <h2 id="vr-ready-h">Don&rsquo;t want to record? The ready-made reading</h2>
              <p className="vr-note">
                <span className="vr-tag">AI</span> The letter&rsquo;s words read aloud in {picked.name} by ElevenLabs text-to-speech ({s.models.reading}, a closed model by ElevenLabs).
              </p>
              {reading ? (
                <SignedAudio key={picked.presetId} path={`/api/voice/reading?speech=${s.speech.id}&preset=${picked.presetId}`} label="Play the reading" />
              ) : (
                <button type="button" className="vr-btn vr-quiet" onClick={makeReading} disabled={!s.ready || busy !== null}>
                  Make the reading (≈ {s.speech.characters.toLocaleString()} credits)
                </button>
              )}
            </section>
          )}

          {picked && (
            <section className="vr-card" aria-labelledby="vr-rec-h">
              <h2 id="vr-rec-h">2. Record the whole speech</h2>
              {webClient ? (
                <p className="vr-warn" role="note">
                  Recording doesn&rsquo;t work in Farcaster on the web. Open this page in the Farcaster app on your phone, or in a browser at snowmoon.party/storyboard/record.
                </p>
              ) : (
                <>
                  <p className="vr-note">
                    About {totalWords} words, {mmss(estMinutes * 60)} at your pace. The words scroll while you read; your recording stays in this tab until you send it.
                  </p>
                  <label className="vr-pace">
                    Pace: {wpm} words a minute
                    <input type="range" min={90} max={190} step={10} value={wpm} onChange={(e) => setWpm(Number(e.target.value))} disabled={recording} />
                  </label>
                  <ol className={`vr-prompter${recording && redoing === null ? ' vr-live' : ''}`} ref={prompter} aria-live="off">
                    {s.speech.sentences.map((x) => (
                      <li key={x.n} data-n={x.n} className={x.n === current ? 'vr-now' : x.n < current ? 'vr-past' : ''}>
                        {x.text}
                      </li>
                    ))}
                  </ol>
                  <div className="vr-row">
                    {!recording || redoing !== null ? (
                      <button type="button" className="vr-btn" onClick={recordWhole} disabled={rec.state !== 'idle' || busy !== null || redoing !== null}>
                        {take || converted ? 'Record again' : 'Record'}
                      </button>
                    ) : (
                      <button type="button" className="vr-btn vr-stop" onClick={rec.stop}>
                        Stop · {mmss(rec.elapsed)}
                      </button>
                    )}
                    {recording && redoing === null && <span className="vr-level" aria-hidden><span style={{ width: `${Math.min(100, rec.level * 300)}%` }} /></span>}
                  </div>
                  {rec.error && <p className="vr-warn">{rec.error}</p>}
                  {take && (
                    <div className="vr-take">
                      <p className="vr-note">Your recording, {mmss(take.seconds)}. Only in this tab.</p>
                      <audio controls src={take.url} className="vr-audio" />
                      <label className="vr-tick">
                        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                        <span>Send this recording to ElevenLabs, once, to convert it into {picked.name}. ElevenLabs may keep it under its own privacy policy, in the United States; we keep nothing of it.</span>
                      </label>
                      <div className="vr-row">
                        <button type="button" className="vr-btn" onClick={convertWhole} disabled={!agree || !s.ready || busy !== null}>
                          {busy === 'convert' ? 'Converting…' : `Convert (≈ ${credits(take.seconds).toLocaleString()} credits)`}
                        </button>
                        <button type="button" className="vr-btn vr-quiet" onClick={dropTake} disabled={busy !== null}>
                          Delete it
                        </button>
                      </div>
                      {s.today && <p className="vr-small">Today: {s.today.credits.toLocaleString()} of {s.today.capCredits.toLocaleString()} credits used; {s.today.conversionsLeft} whole takes left for you.</p>}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {converted && (
            <section className="vr-card" aria-labelledby="vr-check-h">
              <h2 id="vr-check-h">3. Listen and check</h2>
              <p className="vr-note">
                <span className="vr-tag">AI</span> Your performance in {picked?.name}, converted by ElevenLabs ({s.models.convert}, a closed model by ElevenLabs). Your recording is gone; this is the converted speech.
              </p>
              {playUrl && <audio controls src={playUrl} className="vr-audio" />}
              {checks ? (
                <>
                  <p className={stillWrong.length ? 'vr-warn' : 'vr-ok'}>
                    {stillWrong.length
                      ? `${stillWrong.length} of ${checks.length} sentences don't match the speech word for word.`
                      : `All ${checks.length} sentences match the speech word for word.`}
                  </p>
                  <ol className="vr-checks">
                    {checks.map((c) => {
                      const redo = redos.find((r) => r.n === c.n);
                      const ok = redo ? Boolean(redo.checks?.[0]?.ok) : c.ok;
                      return (
                        <li key={c.n} className={ok ? 'vr-pass' : 'vr-fail'}>
                          <span className="vr-mark" aria-label={ok ? 'Matches' : "Doesn't match"}>{ok ? '✓' : '✕'}</span>
                          <span>
                            {s.speech.sentences[c.n].text}
                            {!ok && !redo && (c.missing.length > 0 || c.extra.length > 0) && (
                              <span className="vr-diff">
                                {c.missing.length > 0 && <> Not heard: <b>{c.missing.join(' ')}</b>.</>}
                                {c.extra.length > 0 && <> Heard instead: <b>{c.extra.join(' ')}</b>.</>}
                              </span>
                            )}
                            {redo && <span className="vr-diff">{ok ? ' Redone.' : ' Redone, still not matching.'}</span>}
                          </span>
                          {(!c.ok || redo) && redoing !== c.n && (
                            <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => redoSentence(c.n)} disabled={busy !== null || recording}>
                              Redo this sentence
                            </button>
                          )}
                          {redoing === c.n && (
                            <div className="vr-redo">
                              <p className="vr-prompt-one">{s.speech.sentences[c.n].text}</p>
                              <label className="vr-tick">
                                <input type="checkbox" checked={redoAgree} onChange={(e) => setRedoAgree(e.target.checked)} />
                                <span>Send this recording to ElevenLabs, once, to convert it. We keep nothing of it.</span>
                              </label>
                              <div className="vr-row">
                                {recording ? (
                                  <button type="button" className="vr-btn vr-stop" onClick={rec.stop}>Stop · {mmss(rec.elapsed)}</button>
                                ) : (
                                  <button type="button" className="vr-btn" onClick={recordRedo} disabled={!redoAgree || busy !== null}>
                                    {busy === 'redo' ? 'Converting…' : 'Record and convert'}
                                  </button>
                                )}
                                <button type="button" className="vr-btn vr-quiet" onClick={() => setRedoing(null)} disabled={recording || busy !== null}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : busy === 'convert' || busy === 'check' ? (
                <p className="vr-note">Checking the words…</p>
              ) : (
                <button type="button" className="vr-btn vr-quiet" onClick={recheck}>Check the words again</button>
              )}
              {!accepted ? (
                <div className="vr-row">
                  <button type="button" className="vr-btn" onClick={accept} disabled={!converted.check || busy !== null || recording}>
                    {busy === 'accept' ? 'Keeping…' : 'Accept and keep as a draft'}
                  </button>
                  <button type="button" className="vr-btn vr-quiet" onClick={discard} disabled={busy !== null}>Discard</button>
                </div>
              ) : (
                <p className="vr-ok">Kept as your draft. Only you can see it; nothing is published.</p>
              )}
              <p className="vr-small">If you leave before Accept, this is discarded.</p>
            </section>
          )}

          {s.drafts.length > 0 && (
            <section className="vr-card" aria-labelledby="vr-drafts-h">
              <h2 id="vr-drafts-h">Your drafts</h2>
              <ul className="vr-drafts">
                {s.drafts.map((d) => (
                  <li key={d.id}>
                    <p>
                      {d.kind === 'reading' ? 'Ready-made reading' : 'Your performance'} · {String((d.recipe.preset as { name?: string })?.name ?? d.presetId)} · {new Date(d.madeAt).toLocaleString()}
                    </p>
                    {d.audio.map((a) => (
                      <div key={a.n} className="vr-draft-audio">
                        <span className="vr-small">{a.role === 'redo' ? `Sentence ${Number(a.sentence) + 1}, redone` : a.role === 'take' ? 'Whole take' : 'Reading'}</span>
                        <SignedAudio path={`/api/voice/drafts/${d.id}/${a.n}`} label="Play" />
                      </div>
                    ))}
                    <details>
                      <summary>Recipe</summary>
                      <pre>{JSON.stringify(d.recipe, null, 2)}</pre>
                    </details>
                    <button type="button" className="vr-btn vr-quiet vr-small-btn vr-remove" onClick={() => removeDraft(d.id)} disabled={busy !== null}>
                      Remove this draft
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
