'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, inMiniApp, useAuth } from '~/lib/client-auth';
import { HOST_CHECK_MS, HOST_PROMPT_MS, withTimeout } from '~/lib/host-timeout';
import { MIC_HELP, micPlace } from '~/lib/mic-help';
import { loadTake, removeTake, saveTake, type DeviceTake } from '~/lib/voice/device-takes';
import { VoiceRemove } from '~/components/voice-remove';
import { CorrectWords } from '~/components/voice-correct-words';
import { IMPROV_WORDING } from '~/lib/voice/improv-wording';
import Link from 'next/link';
import { LearnMore, LearnMoreParts } from '~/components/challenge-learn-more';
import type { LearnMoreView } from '~/lib/challenge/learn-more-view';
import { citeHref } from '~/lib/challenge/learn-more';
import '../styles/voice.css';

const REMOVE_DRAFT = 'Remove this draft? Its audio is deleted and it can’t be brought back.';

/**
 * /storyboard/record, the Ephelion voice slice 1 (Nate, 2026-11-19; DRAFT, admins only behind VOICE's switch):
 * consent, pick a voice, record the whole speech with the words scrolling, convert it with ElevenLabs, check it word
 * for word, redo one sentence, accept a private draft; or listen to the ready-made reading.
 *
 * The raw take stays on the person's device (IndexedDB, under their FID and the speech) until they remove it or record
 * again, and is sent only when they press Convert; it is never stored by the site. Each converted take is kept as their
 * private draft as soon as it comes back (own-voice-v3, reread by Nate 2026-11-22).
 */

interface Choice { presetId: string; name: string; description: string; candidate: number; generatedVoiceId: string; previewUrl: string; saved: boolean }
interface Check { n: number; ok: boolean; bySound?: { expected: string; heard: string }[]; missing: string[]; extra: string[]; start: number | null; end: number | null }
interface Status {
  ready: boolean;
  speech: Speech;
  speeches: Speech[];
  choices: Choice[];
  consent: { version: string; line: string; title: string; text: string[]; sha256: string; agreed: boolean };
  models: { convert: string; transcribe: string; reading: string; design: string; provider: string };
  limits: { maxTakeSeconds: number; maxSentenceSeconds: number; maxTakeBytes: number; creditsPerMinute: number; readingCreditsPerChar: number; transcribeCreditsPerSecond: number };
  today: { funded: string; credits: number; capCredits: number; conversionsLeft: number } | null;
  drafts: { id: string; label: string | null; improvised: boolean; sentences: { n: number; text: string }[] | null; kind: string; speechId: string; presetId: string; madeAt: string; publishedAt: string | null; recipe: Record<string, unknown>; audio: { n: number; role: string; sentence: number | null }[] }[];
  readings: { speechId: string; presetId: string; id: string; candidate: number | null; madeAt: string }[];
}
interface Speech { id: string; maxSeconds: number; title: string; character: string; source: { kind: string; block?: string }; label: { kind: 'book'; text: string; block: string } | { kind: 'invented'; text: string; writers: string[] }; version: number; standIn: boolean; paragraphs: string[]; sentences: { n: number; text: string }[]; characters: number; names: string[]; aiHelp: boolean | null; credit: string | null }
interface Converted { blob: Blob; url: string; ticket: string; check?: string; checks?: Check[]; seconds: number; draftId?: string }
interface Redo extends Converted { n: number }

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus'];
const pickType = () => (typeof MediaRecorder === 'undefined' ? '' : (TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''));
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A small recorder: the microphone (asked of the Farcaster app first when it offers it), MediaRecorder, a level. */
/**
 * A plain step log for troubleshooting (Nate, 2026-11-21: Chrome and the Farcaster app fail where Safari works), shown
 * under the recorder as /admin/mic-test shows its own. Text only: what each step answered, never any audio.
 */
type Note = (s: string) => void;
function useStepLog() {
  const [lines, setLines] = useState<string[]>([]);
  const t0 = useRef(typeof performance === 'undefined' ? 0 : performance.now());
  const note: Note = useCallback((s: string) => setLines((l) => [...l.slice(-80), `${((performance.now() - t0.current) / 1000).toFixed(1)}s ${s}`]), []);
  return { lines, note };
}
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const raced = (what: string, r: { ok: boolean; why?: string; error?: string }, ok: string) =>
  r.ok ? `${what}: ${ok}` : `${what}: ${r.why === 'timeout' ? 'no answer in time (timed out), treated as unknown' : `error (${r.error}), treated as unknown`}`;

function useRecorder(note: Note) {
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
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
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

/** A citation, linked to its block in the reader (as the Learn more texts link theirs). */
const Cite = ({ b }: { b: string }) => (
  <Link className="chc-cite" href={citeHref(b)} prefetch={false}>
    {b}
  </Link>
);

export function VoiceRecord({ fallback, learn }: { fallback: React.ReactNode; learn?: LearnMoreView }) {
  const auth = useAuth();
  // Who may use it is the server's to say (src/lib/voice/flag.ts): its routes answer 404 to anyone the switch doesn't
  // let in, and the page then shows the site's usual not-found. So no admin list is checked here (P5b).
  const admin = auth.kind === 'signed-in';
  const [status, setStatus] = useState<Status | null | 'none'>(null);
  const [webClient, setWebClient] = useState(false);
  const [choice, setChoice] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The take in the tab, and the speech it is of: only ever shown and sent with that speech (Nate, 2026-11-22).
  const [take, setTake] = useState<{ seconds: number; url: string; speechId: string } | null>(null);
  const takeBlob = useRef<Blob | null>(null);
  // The raw take kept on this device, in this browser's storage, under the signed-in FID (Nate, 2026-11-22).
  const [onDevice, setOnDevice] = useState<DeviceTake | null>(null);
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [converted, setConverted] = useState<Converted | null>(null);
  const [redos, setRedos] = useState<Redo[]>([]);
  const [redoing, setRedoing] = useState<number | null>(null);
  const [redoAgree, setRedoAgree] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [wpm, setWpm] = useState(140);
  const log = useStepLog();
  const rec = useRecorder(log.note);
  const prompter = useRef<HTMLOListElement | null>(null);

  const load = useCallback(async () => {
    const r = await authFetch('/api/voice/status', { cache: 'no-store' }).catch((e) => (log.note(`status: the request failed (${errText(e)})`), null));
    if (r) log.note(`status: HTTP ${r.status}${r.ok ? ', loaded' : ''}`);
    setStatus(r?.ok ? ((await r.json()) as Status) : 'none');
  }, []);
  useEffect(() => {
    if (!admin) return;
    void load();
    void (async () => {
      // The Farcaster-web message only when the host does answer platformType 'web' (each check raced, 2 s).
      log.note(`browser: ${navigator.userAgent}`);
      const app = await withTimeout(inMiniApp(), HOST_CHECK_MS);
      log.note(raced('host check at load: in the Farcaster app?', app, app.ok ? (app.value ? 'yes' : 'no') : ''));
      if (app.ok && !app.value) return;
      const ctx = await withTimeout(sdk.context, HOST_CHECK_MS);
      log.note(raced('host check at load: context', ctx, ctx.ok ? `platform ${ctx.value?.client?.platformType ?? 'not given'}` : ''));
      setWebClient(ctx.ok && ctx.value?.client?.platformType === 'web');
    })();
  }, [admin, load]);

  // The default voice (Nate's first pick) starts selected.
  useEffect(() => {
    if (status && status !== 'none' && !choice && status.choices[0]?.saved) setChoice(`${status.choices[0].presetId}#${status.choices[0].candidate}`);
  }, [status, choice]);

  // Leaving while a conversion is in flight, or with a converted sentence not yet used: say so. (A whole take is kept as a
  // draft by the server even if the page goes, and the raw take stays on the device; the warning is for the wait.)
  const inFlight = busy === 'convert' || busy === 'redo';
  useEffect(() => {
    if (!inFlight && !(converted && redos.length && !accepted)) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [inFlight, converted, redos.length, accepted]);

  // The chosen speech (Nate, 2026-11-22: "a 'pick a speech' step before the voice picker"): the page reads it as s.speech,
  // and the readings shown are that speech's.
  const [speechId, setSpeechId] = useState<string | null>(null);
  const s = useMemo(() => {
    if (!status || status === 'none') return null;
    const sp = status.speeches.find((x) => x.id === speechId) ?? status.speech;
    return { ...status, speech: sp, readings: status.readings.filter((r) => r.speechId === sp.id) };
  }, [status, speechId]);

  // Coming back (a reload, a crash, the app sent to the background): this sign-in's take of this speech, from the device.
  const fid = auth.kind === 'signed-in' ? auth.fid : null;
  const sid = s?.speech.id ?? null;
  useEffect(() => {
    if (fid === null || !sid) return;
    let alive = true;
    // Another speech (or sign-in): its take goes from the tab at once, and this speech's own is read from the device.
    takeBlob.current = null;
    setTake((old) => (old && URL.revokeObjectURL(old.url), null));
    setOnDevice(null);
    setAgree(false);
    void loadTake(fid, sid)
      .then((t) => {
        if (!alive || !t || t.speechId !== sid) return;
        setOnDevice(t);
        takeBlob.current = t.blob;
        setTake({ seconds: t.seconds, url: URL.createObjectURL(t.blob), speechId: t.speechId });
      })
      .catch((e) => alive && setDeviceNote(`This browser couldn't read its saved recordings (${e instanceof Error ? e.message : String(e)}).`));
    return () => {
      alive = false;
    };
  }, [fid, sid]);
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
  /** Remove the take from this device too (the only way it goes, besides recording again or the browser clearing it). */
  const removeHere = async () => {
    dropTake();
    setOnDevice(null);
    if (fid !== null && take) await removeTake(fid, take.speechId).catch(() => {});
  };
  // The draft this device's take became, if it was converted (the recipe keeps only the take's sha256).
  const keptFromTake = onDevice ? s.drafts.find((d) => ((d.recipe as { takes?: { takeSha256?: string }[] }).takes ?? [])[0]?.takeSha256 === onDevice.sha256) : undefined;

  /** Another speech: the converted take shown is already a draft; its own recording, if any, comes from the device. */
  const pickSpeech = (id: string) => {
    setConverted(null);
    setRedos([]);
    setAccepted(null);
    setPlayUrl(null);
    setMessage(null);
    setSpeechId(id);
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
    // At most 2 minutes a take (Nate, 2026-11-24; the book speech 3): the countdown stops the recording at 0.
    const out = await rec.start(s!.speech.maxSeconds ?? s!.limits.maxTakeSeconds);
    if (out) {
      takeBlob.current = out.blob;
      setTake({ seconds: out.seconds, url: URL.createObjectURL(out.blob), speechId: s!.speech.id });
      setDeviceNote(null);
      // Kept on this device until it is removed or recorded again (replaces this speech's earlier take).
      if (fid !== null)
        await saveTake(fid, s!.speech.id, out.blob, out.seconds)
          .then((t) => (setOnDevice(t), log.note(`saved on this device (${out.blob.size} bytes)`)))
          .catch((e) => (setOnDevice(null), setDeviceNote(`Not saved on this device: ${e instanceof Error ? e.message : String(e)}. It is only in this tab.`), log.note(`device save failed: ${errText(e)}`)));
    }
  }

  /** Send one recording to be converted (a whole take stays on the device whatever the answer). */
  async function convert(blob: Blob, seconds: number, sentence: number | null, speechOfTake = s!.speech.id): Promise<Converted | null> {
    const form = new FormData();
    form.set('take', blob, 'take');
    form.set('speechId', speechOfTake);
    form.set('presetId', picked!.presetId);
    form.set('candidate', String(picked!.candidate));
    form.set('seconds', String(seconds));
    form.set('agree', s!.consent.sha256);
    if (sentence !== null) form.set('sentence', String(sentence));
    log.note(`convert: sending ${blob.size} bytes (${blob.type || 'no type'}), ${seconds.toFixed(1)} s${sentence !== null ? `, sentence ${sentence + 1}` : ''}`);
    const r = await authFetch('/api/voice/convert', { method: 'POST', body: form }).catch((e) => (log.note(`convert: the request failed (${errText(e)})`), null));
    if (!r?.ok) {
      const err = ((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      if (r) log.note(`convert: HTTP ${r.status}${err ? `: ${err}` : ''}`);
      setMessage(err ?? (sentence === null ? 'The conversion failed. Your recording is still on this device: tick the box and convert it again.' : 'The conversion failed. Your recording was not kept.'));
      return null;
    }
    if (sentence === null) {
      // A whole take: the server converted it, checked it and kept it as a draft before answering (Nate, 2026-11-22).
      const j = (await r.json()) as { draftId: string; ticket: string; check: string | null; checks: Check[] | null };
      log.note(`convert: HTTP ${r.status}, kept as draft ${j.draftId}${j.checks ? `; ${j.checks.filter((x) => x.ok).length} of ${j.checks.length} sentences match` : '; no word check'}`);
      const a = await authFetch(`/api/voice/drafts/${j.draftId}/0`).catch(() => null);
      const kept = a?.ok ? await a.blob() : new Blob();
      if (!j.checks) setMessage('Converted and kept as your draft, but the word check could not be made.');
      return { blob: kept, url: URL.createObjectURL(kept), ticket: j.ticket, seconds, draftId: j.draftId, check: j.check ?? undefined, checks: j.checks ?? undefined };
    }
    const out = await r.blob();
    log.note(`convert: HTTP ${r.status}, ${out.size} bytes back`);
    const c: Converted = { blob: out, url: URL.createObjectURL(out), ticket: r.headers.get('x-voice-ticket') ?? '', seconds };
    const tf = new FormData();
    tf.set('audio', out, 'converted.mp3');
    tf.set('ticket', c.ticket);
    const t = await authFetch('/api/voice/transcribe', { method: 'POST', body: tf }).catch((e) => (log.note(`transcribe: the request failed (${errText(e)})`), null));
    if (t?.ok) {
      const j = (await t.json()) as { checks: Check[]; check: string };
      c.checks = j.checks;
      c.check = j.check;
      log.note(`transcribe: HTTP ${t.status}, ${j.checks.filter((x) => x.ok).length} of ${j.checks.length} sentences match`);
    } else {
      const err = ((await t?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      if (t) log.note(`transcribe: HTTP ${t.status}${err ? `: ${err}` : ''}`);
      setMessage('Converted, but the word check failed. Try the check again later.');
    }
    return c;
  }

  /**
   * Check the words again on a draft kept without its check (Nate, 2026-11-22): its own converted audio is transcribed
   * once, and it is kept again with the check, under a new id (the old one is removed). Shown on the draft, and used by
   * the check below when the take open here is that draft.
   */
  async function checkDraft(id: string) {
    setBusy('check');
    setMessage(null);
    const r = await authFetch(`/api/voice/drafts/${id}/check`, { method: 'POST' }).catch((e) => (log.note(`check draft: the request failed (${errText(e)})`), null));
    setBusy(null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { id?: string; checks?: Check[]; check?: string; matched?: number; sentences?: number; error?: string };
    if (r) log.note(`check draft: HTTP ${r.status}${j.error ? `: ${j.error}` : ''}`);
    if (!r?.ok || !j.id) return setMessage(j.error ?? 'The word check failed. Try again.');
    setMessage(`Checked: ${j.matched} of ${j.sentences} sentences match. It is kept as a new draft with its check; the one without it is removed.`);
    if (converted?.draftId === id) {
      setConverted({ ...converted, draftId: j.id, checks: j.checks, check: j.check });
      setAccepted(j.id);
    }
    void load();
  }

  /** Ask for the word check again (the conversion is kept in the tab; only the converted audio is sent). */
  async function recheck() {
    if (!converted) return;
    // The take open here was kept without its check: check that draft, so the kept one gets it too.
    const kept = converted.draftId ? s!.drafts.find((d) => d.id === converted.draftId) : undefined;
    if (kept && (kept.recipe as { check?: unknown }).check === null) return checkDraft(kept.id);
    setBusy('check');
    setMessage(null);
    const tf = new FormData();
    tf.set('audio', converted.blob, 'converted.mp3');
    tf.set('ticket', converted.ticket);
    const t = await authFetch('/api/voice/transcribe', { method: 'POST', body: tf }).catch((e) => (log.note(`transcribe again: the request failed (${errText(e)})`), null));
    setBusy(null);
    if (t) log.note(`transcribe again: HTTP ${t.status}`);
    if (t?.ok) {
      const j = (await t.json()) as { checks: Check[]; check: string };
      setConverted({ ...converted, checks: j.checks, check: j.check });
    } else setMessage(((await t?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? 'The word check failed again.');
  }

  async function convertWhole() {
    const blob = takeBlob.current;
    if (!blob || !take || !picked) return;
    // Never another speech's take (the take is shown and sent with its own speech only).
    if (take.speechId !== s!.speech.id) return setMessage('That recording is of another speech: pick that speech to convert it.');
    setBusy('convert');
    setMessage(null);
    const seconds = take.seconds;
    // Sent only now, when Convert is pressed; the take stays on this device until it is removed.
    setAgree(false);
    const c = await convert(blob, seconds, null, take.speechId);
    setBusy(null);
    if (c) {
      setConverted(c);
      setPlayUrl(c.url);
      // Already kept as a draft by the server.
      setAccepted(c.draftId ?? null);
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

  /** "Use this one": the take with its redone sentences, kept as a new draft (the take alone is already kept). */
  async function accept() {
    if (!converted?.check || !redos.length) return;
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

  async function removeDraft(id: string): Promise<boolean> {
    setBusy('remove');
    const r = await authFetch(`/api/voice/drafts/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (r.ok) void load();
    else setMessage(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'It could not be removed');
    return r.ok;
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
      {/* The top of the page (Nate, 2026-11-22; title, intro and the picker's lines reread word for word). */}
      <h1>The Ephelion challenge</h1>
      <div className="vr-intro">
        <p>
          Lord Ephelion is the Arctic Empire&apos;s consul to Veridia (<Cite b="c3-b5" />). In the book his messages reach Veridians everywhere: on a poster in a tunnel (<Cite b="c3-b4" />), in a live debate (<Cite b="c8-b17" />), on a restaurant screen that cuts into a Helisport game (<Cite b="c13-b62" />). As one character puts it, &quot;Ephelion&apos;s goal is to inspire people inside Veridia to join the Arctic cause.&quot; (<Cite b="c21-b76" />)
        </p>
        <p>Give one of his speeches a voice: perform it yourself, or start from a ready-made reading, then storyboard it.</p>
      </div>
      {learn && (
        <LearnMore title={learn.title}>
          <LearnMoreParts learn={learn} />
        </LearnMore>
      )}
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
          <section className="vr-card" aria-labelledby="vr-speech-h">
            <h2 id="vr-speech-h">Pick a speech</h2>
            <fieldset className="vr-speeches" disabled={busy !== null || recording || (Boolean(take) && !onDevice) || Boolean(converted && redos.length && accepted === converted.draftId)}>
              <legend className="vr-small">Lord Ephelion&rsquo;s words to perform. Each speech keeps its own recording on this device.</legend>
              {s.speeches.map((x) => (
                <label key={x.id} className={`vr-speech${x.id === s.speech.id ? ' vr-on' : ''}`}>
                  <input type="radio" name="speech" checked={x.id === s.speech.id} onChange={() => pickSpeech(x.id)} />
                  {/* Its title, and one line under it (Nate, 2026-11-22, reread word for word). */}
                  <span>
                    <strong>{x.title}</strong>
                    <span className="vr-small vr-speech-line">
                      {x.label.kind === 'book'
                        ? `From the book, word for word (${x.label.block}). In the book it is a written message; reading it aloud is this edition's idea.`
                        : `${x.label.text} · ${x.credit} · version ${x.version}`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="vr-card" aria-labelledby="vr-pick-h">
            <h2 id="vr-pick-h">1. Pick a voice</h2>
            <p className="vr-note">
              Each plays the opening of the letter. <span className="vr-tag">AI</span> Made with ElevenLabs Voice Design ({s.models.design}, a closed model by ElevenLabs) from a description this edition wrote.
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
                <>
                  <SignedAudio key={picked.presetId} path={`/api/voice/reading?speech=${s.speech.id}&preset=${picked.presetId}`} label="Play the reading" />
                  <p className="vr-row">
                    <a className="vr-btn vr-small-btn" href={`/storyboard/guide/${reading.id}`}>Storyboard it with the guide</a>{' '}
                    <a className="vr-btn vr-quiet vr-small-btn" href={`/storyboard/board/${reading.id}`}>Write it myself</a>
                    <span className="vr-small">Your own storyboard on this reading: others can make theirs on it too.</span>
                  </p>
                </>
              ) : (
                <button type="button" className="vr-btn vr-quiet" onClick={makeReading} disabled={!s.ready || busy !== null}>
                  Make the reading (≈ {Math.ceil(s.speech.characters * s.limits.readingCreditsPerChar).toLocaleString()} credits)
                </button>
              )}
            </section>
          )}

          {picked && (
            <section className="vr-card" aria-labelledby="vr-rec-h">
              <h2 id="vr-rec-h">2. Record your take</h2>
              {webClient ? (
                <p className="vr-warn" role="note">
                  Recording doesn&rsquo;t work in Farcaster on the web. Open this page in the Farcaster app on your phone, or in a browser at snowmoon.party/storyboard/record.
                </p>
              ) : (
                <>
                  <p className="vr-note">{IMPROV_WORDING.intro(mmss(s.speech.maxSeconds ?? s.limits.maxTakeSeconds))} <span className="vr-tag">{IMPROV_WORDING.draft}</span></p>
                  <p className="vr-note">
                    About {totalWords} words, {mmss(estMinutes * 60)} at your pace word for word. The words scroll while you read; your recording stays on this device until you remove it or record again, and is sent to be converted only when you press Convert.
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
                        Stop · {IMPROV_WORDING.left(mmss(Math.max(0, (s.speech.maxSeconds ?? s.limits.maxTakeSeconds) - rec.elapsed)))}
                      </button>
                    )}
                    {recording && redoing === null && <span className="vr-level" aria-hidden><span style={{ width: `${Math.min(100, rec.level * 300)}%` }} /></span>}
                  </div>
                  {rec.error && <p className="vr-warn">{rec.error}</p>}
                  <details className="vr-steps">
                    <summary>Steps (for troubleshooting)</summary>
                    <p className="vr-small">What each step answered on this device. Text only; no audio. Copy it to send it along.</p>
                    <pre>{log.lines.join('\n') || 'Nothing yet.'}</pre>
                  </details>
                  {take && take.speechId === s.speech.id && (
                    <div className="vr-take">
                      <p className="vr-note">
                        Your recording, {mmss(take.seconds)}.{' '}
                        {onDevice ? <span className="vr-ok">Saved on this device</span> : <>Only in this tab.</>} It stays here until you remove it or record again, and is sent to be converted only when you press Convert.
                      </p>
                      {deviceNote && <p className="vr-warn">{deviceNote}</p>}
                      {keptFromTake && <p className="vr-ok">This recording was converted and kept as your draft ({new Date(keptFromTake.madeAt).toLocaleString()}). It is in your drafts below.</p>}
                      <audio controls src={take.url} className="vr-audio" />
                      <label className="vr-tick">
                        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                        <span>Send this recording to ElevenLabs, once, to convert it into {picked.name}. ElevenLabs may keep it under its own privacy policy, in the United States; we keep nothing of it.</span>
                      </label>
                      <div className="vr-row">
                        <button type="button" className="vr-btn" onClick={convertWhole} disabled={!agree || !s.ready || busy !== null}>
                          {busy === 'convert' ? 'Converting…' : `Convert (≈ ${credits(take.seconds).toLocaleString()} credits)`}
                        </button>
                        <button type="button" className="vr-btn vr-quiet" onClick={() => void removeHere()} disabled={busy !== null}>
                          Remove
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
                <span className="vr-tag">AI</span> Your performance in {picked?.name}, converted by ElevenLabs ({s.models.convert}, a closed model by ElevenLabs). This is the converted speech, kept as your private draft; your recording is still on this device until you remove it.
              </p>
              {playUrl && <audio controls src={playUrl} className="vr-audio" />}
              {checks ? (
                <>
                  <p className="vr-ok" data-slot="take-label">
                    {stillWrong.length ? IMPROV_WORDING.improvisedLabel(s.speech.title, s.speech.version) : IMPROV_WORDING.wordForWordLabel}
                  </p>
                  {stillWrong.length > 0 && <p className="vr-note">{IMPROV_WORDING.improvisedNote} <span className="vr-tag">{IMPROV_WORDING.draft}</span></p>}
                  <details className="vr-word-check" open={stillWrong.length > 0 && stillWrong.length <= Math.ceil(checks.length / 2)}>
                  <summary>{stillWrong.length ? `Meant it word for word? ${stillWrong.length} of ${checks.length} sentences don't match the speech: redo them.` : `All ${checks.length} sentences match the speech word for word.`}</summary>
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
                            {!redo && (c.bySound?.length ?? 0) > 0 && (
                              <span className="vr-sound">Names heard by sound: {c.bySound!.map((b) => `${b.heard} as ${b.expected}`).join(', ')}.</span>
                            )}
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
                  </details>
                </>
              ) : busy === 'convert' || busy === 'check' ? (
                <p className="vr-note">Checking the words…</p>
              ) : (
                <button type="button" className="vr-btn vr-quiet" onClick={recheck}>Check the words again</button>
              )}
              {redos.length > 0 && !(accepted && accepted !== converted.draftId) ? (
                <div className="vr-row">
                  <button type="button" className="vr-btn" onClick={accept} disabled={!converted.check || busy !== null || recording}>
                    {busy === 'accept' ? 'Keeping…' : 'Use this one (with the redone sentences)'}
                  </button>
                  <span className="vr-small">The take alone is already kept as a draft.</span>
                </div>
              ) : !accepted ? (
                <p className="vr-warn">Not kept: the conversion didn&rsquo;t come back as a draft. Your recording is still on this device: convert it again.</p>
              ) : (
                <div className="vr-row">
                  <p className="vr-ok">Kept as your draft. Only you can see it; nothing is published.</p>
                  <VoiceRemove label="Remove" question={REMOVE_DRAFT} disabled={busy !== null} busy={busy === 'remove'} onRemove={async () => { if (await removeDraft(accepted)) discard(); }} />
                </div>
              )}
              <p className="vr-small">Each converted take is kept as your draft as soon as it comes back, until you remove it. Redone sentences are kept when you press &ldquo;Use this one&rdquo;.</p>
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
                      {d.label && <> · <span className="vr-tag" data-slot="draft-label">{d.label}</span></>}
                    </p>
                    {d.improvised && d.sentences && <CorrectWords draftId={d.id} sentences={d.sentences} busy={busy !== null} onSaved={(m) => (setMessage(m), void load())} />}
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
                    {d.kind === 'performance' && (d.recipe as { check?: unknown }).check === null ? (
                      <span className="vr-draft-nocheck">
                        <span className="vr-warn">No word check yet: it was kept without one, so it can&rsquo;t be storyboarded until its words are checked.</span>{' '}
                        <button type="button" className="vr-btn vr-small-btn" onClick={() => checkDraft(d.id)} disabled={busy !== null}>
                          {busy === 'check' ? 'Checking…' : `Check the words (≈ ${Math.ceil(Number(((d.recipe as { takes?: { seconds?: number }[] }).takes ?? [])[0]?.seconds ?? 0) * s.limits.transcribeCreditsPerSecond)} credits)`}
                        </button>
                      </span>
                    ) : d.kind === 'performance' ? (
                      <>
                        <a className="vr-btn vr-small-btn vr-remove" href={`/storyboard/guide/${d.id}`}>Storyboard it with the guide</a>{' '}
                        <a className="vr-btn vr-quiet vr-small-btn vr-remove" href={`/storyboard/board/${d.id}`}>Write it myself</a>
                      </>
                    ) : null}{' '}
                    <VoiceRemove className="vr-btn vr-quiet vr-small-btn vr-remove" label="Remove this draft" question={REMOVE_DRAFT} disabled={busy !== null} onRemove={() => removeDraft(d.id)} />
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
