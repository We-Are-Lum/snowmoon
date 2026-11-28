'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, inMiniApp, useAuth } from '~/lib/client-auth';
import { HOST_CHECK_MS, withTimeout } from '~/lib/host-timeout';
import { loadTake, removeTake, saveTake, type DeviceTake } from '~/lib/voice/device-takes';
import { CONVERT_AGAIN } from '~/lib/voice/convert-again';
import { IMPROV_WORDING } from '~/lib/voice/improv-wording';
import { RECORDER as W } from '~/lib/voice/recorder-wording';
import { withReset } from '~/lib/challenge/model-wording';
import { loadWords, removeWords, saveWords, splitSentences } from '~/lib/voice/device-words';
import { LocalTextField } from '~/components/local-text-field';
import { EphelionEntry } from '~/components/ephelion-entry';
import { SignedAudio, joined, mmss, useRecorder, useStepLog, wordCount, type Check, type Converted, type Redo } from '~/components/voice-recorder-core';
import '../styles/ephelion-recorder.css';

/**
 * /ephelion/record, the four-step recorder (Nate, 2026-11-25 and 26; his Recorder and PhoneFlow files, plan v3, PR 2):
 * 1 Speech, 2 Voice, 3 Record, 4 Listen, always shown, greyed until reached, each reached one a way back. The same
 * gate as /ephelion (GET /api/voice/status answers 404 to anyone the voice switch doesn't let in); signed out, the
 * sign-in line. It uses the routes the voice page always has (consent, convert, transcribe, drafts, accept).
 * - Two panes when the page itself is 760 px or wider (measured on the page, not the window): the step's controls on the
 *   left, what it shows on the right. Narrower, one screen at a time, with the Exit bar and the steps pinned at the top
 *   and the step's controls pinned at the bottom (PhoneFlow).
 * - The raw take stays on this device (IndexedDB, under the signed-in person and the speech) until a new take replaces
 *   it or the speech is changed; it is sent only when "Make it his voice" is pressed. Edited words stay on this device
 *   too (src/lib/voice/device-words.ts) and are never sent: the word check compares the converted take with the speech
 *   as written, so a take of edited words is labelled improvised, as any take that isn't word for word.
 * - The highlight is timed (no speech recognition): it moves sentence by sentence at the page's pace, can be nudged, moved
 *   by tapping a sentence, paused by scrolling by hand, or turned off.
 * Publishing, scenes and paying are not here (later PRs).
 */
interface Choice { presetId: string; name: string; description: string; candidate: number; saved: boolean }
interface Speech { id: string; maxSeconds: number; title: string; label: { kind: 'book'; text: string; block: string } | { kind: 'invented'; text: string; writers: string[] }; version: number; paragraphs: string[]; sentences: { n: number; text: string }[]; credit: string | null }
interface Status {
  ready: boolean;
  speeches: Speech[];
  choices: Choice[];
  consent: { version: string; reread: string | null; line: string; title: string; text: string[]; sha256: string; agreed: boolean };
  limits: { maxTakeSeconds: number; maxSentenceSeconds: number; maxTakeBytes: number; creditsPerMinute: number };
  today: { funded: string; credits: number; capCredits: number; conversionsLeft: number } | null;
  drafts: { id: string; kind: string; speechId: string; presetId: string; madeAt: string; recipe: Record<string, unknown> }[];
}
interface Samples { samples: { speechId: string; presetId: string; ready: boolean }[]; canMake: boolean; missing: number; missingCredits: number }

const WPM = 140;
const SIZES = [20, 24, 28, 32];
const READER_KEY = 'snowmoon.ephelion.reader';
const COUNTDOWN = 3;
const TOO_LARGE = (bytes: number, max: number) => `This recording is ${(Math.ceil(bytes / 100_000) / 10).toFixed(1)} MB, over the ${Math.round(max / 1_000_000)} MB a take can be, so it can't be sent. Record it again, a little shorter.`;

/** Save a blob as a file, from this device. */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
const CHOICE_KEY = (fid: number) => `snowmoon.ephelion.choice.${fid}`;
function readChoice(fid: number): { speechId: string; voiceKey: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHOICE_KEY(fid)) ?? 'null') as { speechId?: unknown; voiceKey?: unknown } | null;
    return v && typeof v.speechId === 'string' ? { speechId: v.speechId, voiceKey: typeof v.voiceKey === 'string' ? v.voiceKey : '' } : null;
  } catch {
    return null;
  }
}
function keepChoice(fid: number, v: { speechId: string; voiceKey: string }) {
  try {
    localStorage.setItem(CHOICE_KEY(fid), JSON.stringify(v));
  } catch {
    /* not kept */
  }
}
const extOf = (type: string) => (/mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function Play({ url, label }: { url: string; label: string }) {
  const a = useRef<HTMLAudioElement>(null);
  return (
    <>
      <button type="button" className="er-btn er-quiet er-small" onClick={() => void a.current?.play()} aria-label={label}>
        {W.play}
      </button>
      <audio ref={a} src={url} hidden />
    </>
  );
}

function SamplePlay({ speechId, presetId, ready, label }: { speechId: string; presetId: string; ready: boolean; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const a = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    setUrl(null);
    setFailed(false);
  }, [speechId, presetId]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => void (url && a.current?.play().catch(() => {})), [url]);
  return (
    <>
      <button
        type="button"
        className="er-play"
        aria-label={`${W.play}: ${label}`}
        disabled={!ready || failed}
        onClick={async (e) => {
          e.stopPropagation();
          if (url) return void a.current?.play();
          const r = await authFetch(`/api/voice/samples?speech=${encodeURIComponent(speechId)}&preset=${encodeURIComponent(presetId)}`).catch(() => null);
          if (r?.ok) setUrl(URL.createObjectURL(await r.blob()));
          else setFailed(true);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
      </button>
      {url && <audio ref={a} src={url} hidden />}
    </>
  );
}

export function EphelionRecorder({ fallback, signedOut }: { fallback: React.ReactNode; signedOut: React.ReactNode }) {
  const auth = useAuth();
  const signedIn = auth.kind === 'signed-in';
  const fid = signedIn ? auth.fid : null;
  const [status, setStatus] = useState<Status | 'none' | null>(null);
  const [samples, setSamples] = useState<Samples | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [webClient, setWebClient] = useState(false);
  const log = useStepLog();
  const rec = useRecorder(log.note);

  // The page's own width (not the window's): two panes from 760 px.
  const wrap = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.getBoundingClientRect().width >= 760));
    ro.observe(el);
    return () => ro.disconnect();
  });

  const load = useCallback(async () => {
    const r = await authFetch('/api/voice/status', { cache: 'no-store' }).catch(() => null);
    setStatus(r?.ok ? ((await r.json()) as Status) : 'none');
  }, []);
  const loadSamples = useCallback(async () => {
    const r = await authFetch('/api/voice/samples', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setSamples((await r.json()) as Samples);
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    void load();
    void loadSamples();
    void (async () => {
      const app = await withTimeout(inMiniApp(), HOST_CHECK_MS);
      if (app.ok && !app.value) return;
      const ctx = await withTimeout(sdk.context, HOST_CHECK_MS);
      setWebClient(ctx.ok && ctx.value?.client?.platformType === 'web');
    })();
  }, [signedIn, load, loadSamples]);

  // The steps' state.
  const [speechId, setSpeechId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const [voiceKey, setVoiceKey] = useState('');
  const [step, setStep] = useState(1);
  const [confirmSpeech, setConfirmSpeech] = useState<string | null>(null);
  // ?speech=<id> (a card's "Record your own"): that speech chosen, at step 2.
  const fromLink = useRef(false);
  useEffect(() => {
    if (!status || status === 'none' || fromLink.current) return;
    fromLink.current = true;
    const id = new URLSearchParams(window.location.search).get('speech');
    // The speech and voice this person last chose here (kept on this device, a setting), for after a reload.
    const kept = fid === null ? null : readChoice(fid);
    const keptVoice = (sid: string) => (kept && kept.speechId === sid && kept.voiceKey && status.choices.some((c) => c.saved && `${c.presetId}#${c.candidate}` === kept.voiceKey) ? kept.voiceKey : '');
    if (id && status.speeches.some((x) => x.id === id)) {
      setSpeechId(id);
      setViewing(id);
      const v = keptVoice(id);
      if (v) setVoiceKey(v);
      setStep(v ? 3 : 2);
      return;
    }
    if (kept && status.speeches.some((x) => x.id === kept.speechId)) {
      setSpeechId(kept.speechId);
      setViewing(kept.speechId);
      const v = keptVoice(kept.speechId);
      if (v) setVoiceKey(v);
      setStep(v ? 3 : 2);
    } else setViewing(status.speeches[0]?.id ?? null);
  }, [status, fid]);
  useEffect(() => {
    if (fid !== null && speechId) keepChoice(fid, { speechId, voiceKey });
  }, [fid, speechId, voiceKey]);

  const s = status && status !== 'none' ? status : null;
  const speech = s?.speeches.find((x) => x.id === speechId) ?? null;
  const voices = useMemo(() => (s ? s.choices.filter((c) => c.saved) : []), [s]);
  const picked = voices.find((c) => `${c.presetId}#${c.candidate}` === voiceKey) ?? null;

  // The take of the chosen speech on this device, and the converted take in this tab.
  const [take, setTake] = useState<{ seconds: number; url: string; speechId: string; blob: Blob } | null>(null);
  const [onDevice, setOnDevice] = useState<DeviceTake | null>(null);
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const [converted, setConverted] = useState<(Converted & { presetId: string }) | null>(null);
  const [convertedFor, setConvertedFor] = useState<string | null>(null);
  const [again, setAgain] = useState<'ask' | 'yes' | 'kept'>('ask');
  const [agree, setAgree] = useState(false);
  const [redos, setRedos] = useState<Redo[]>([]);
  const [redoing, setRedoing] = useState<number | null>(null);
  const [redoAgree, setRedoAgree] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const converting = useRef(false);
  useEffect(() => {
    if (fid === null || !speechId) return;
    let alive = true;
    setTake((old) => (old && URL.revokeObjectURL(old.url), null));
    setOnDevice(null);
    void loadTake(fid, speechId)
      .then((t) => {
        if (!alive || !t) return;
        setOnDevice(t);
        setTake({ seconds: t.seconds, url: URL.createObjectURL(t.blob), speechId: t.speechId, blob: t.blob });
      })
      .catch((e) => alive && setDeviceNote(`This browser couldn't read its saved recordings (${e instanceof Error ? e.message : String(e)}).`));
    return () => {
      alive = false;
    };
  }, [fid, speechId]);

  // The words read: the speech as written, or this person's own edit of it, kept on this device.
  const [editedWords, setEditedWords] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftWords, setDraftWords] = useState('');
  useEffect(() => {
    setEditing(false);
    setEditedWords(fid !== null && speechId ? loadWords(fid, speechId) : null);
  }, [fid, speechId]);
  const sentences = useMemo(() => (editedWords !== null ? splitSentences(editedWords) : (speech?.sentences.map((x) => x.text) ?? [])), [editedWords, speech]);
  const words = useMemo(() => sentences.map(wordCount), [sentences]);
  const totalWords = words.reduce((a, b) => a + b, 0);
  const startOf = useCallback((i: number) => (words.slice(0, Math.max(0, i)).reduce((a, b) => a + b, 0) / WPM) * 60, [words]);

  // The reader's settings (on this device): highlight on or off, the text size.
  const [hl, setHl] = useState(true);
  const [size, setSize] = useState(2);
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(READER_KEY) ?? '{}') as { hl?: boolean; size?: number };
      if (typeof r.hl === 'boolean') setHl(r.hl);
      if (typeof r.size === 'number' && r.size >= 0 && r.size < SIZES.length) setSize(r.size);
    } catch {
      /* defaults */
    }
  }, []);
  const keepReader = (next: { hl: boolean; size: number }) => {
    try {
      localStorage.setItem(READER_KEY, JSON.stringify(next));
    } catch {
      /* not kept */
    }
  };

  // The timed highlight: the sentence at (elapsed − shift) at the page's pace; nudged by moving the shift; frozen while
  // the reader scrolls by hand, until Resume.
  const [shift, setShift] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const recording = rec.state === 'recording' && redoing === null;
  const timed = useMemo(() => {
    if (!recording) return -1;
    let w = (Math.max(0, rec.elapsed - shift) / 60) * WPM;
    for (const [i, n] of words.entries()) {
      if (w < n) return i;
      w -= n;
    }
    return words.length - 1;
  }, [recording, rec.elapsed, shift, words]);
  const current = !hl || !recording ? -1 : (pausedAt ?? timed);
  const moveTo = (i: number) => {
    const n = Math.max(0, Math.min(sentences.length - 1, i));
    setShift(rec.elapsed - startOf(n));
    setPausedAt(null);
  };
  const script = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (current < 0 || pausedAt !== null) return;
    const box = script.current;
    const el = box?.querySelector<HTMLElement>(`[data-n="${current}"]`);
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight * 0.18), behavior: 'smooth' });
  }, [current, pausedAt]);
  const byHand = () => {
    if (recording && hl && pausedAt === null) setPausedAt(timed);
  };

  // Leaving while a conversion is in flight: say so (the server keeps a whole take as a draft even if the page goes).
  const inFlight = busy === 'convert' || busy === 'redo';
  useEffect(() => {
    if (!inFlight) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [inFlight]);

  if (auth.kind === 'signed-out') return <>{signedOut}</>;
  if (status === 'none') return <>{fallback}</>;
  if (!signedIn || !s) return <div className="er-wrap" ref={wrap}><p className="er-note er-pad">{W.loading}</p></div>;

  const max = speech ? (speech.maxSeconds ?? s.limits.maxTakeSeconds) : s.limits.maxTakeSeconds;
  const reached = [true, Boolean(speech), Boolean(speech && picked), Boolean(speech && picked && take)];
  const keptFromTake = onDevice ? s.drafts.find((d) => ((d.recipe as { takes?: { takeSha256?: string }[] }).takes ?? [])[0]?.takeSha256 === onDevice.sha256) : undefined;
  const convertedBefore = Boolean(take && (keptFromTake || convertedFor === take.url));
  const credits = (sec: number) => Math.ceil((sec / 60) * s.limits.creditsPerMinute);
  const sampleReady = (sid: string, pid: string) => Boolean(samples?.samples.find((x) => x.speechId === sid && x.presetId === pid)?.ready);

  const resetConverted = () => {
    setConverted(null);
    setRedos([]);
    setRedoing(null);
    setPlayUrl(null);
    setAccepted(null);
    setAgain('ask');
  };
  /** Remove the take from this device (Privacy §3: kept "until you remove it"); back to recording. */
  const removeHere = async () => {
    if (fid !== null && speechId) await removeTake(fid, speechId).catch(() => {});
    setTake((old) => (old && URL.revokeObjectURL(old.url), null));
    setOnDevice(null);
    setStoppedAt(null);
    resetConverted();
    setStep(3);
  };
  const chooseSpeech = (id: string) => {
    if (speechId && id !== speechId && take) return setConfirmSpeech(id);
    if (id !== speechId) resetConverted();
    setSpeechId(id);
    setStep(2);
  };
  const changeSpeech = async () => {
    const to = confirmSpeech;
    if (!to) return;
    setConfirmSpeech(null);
    if (fid !== null && speechId) await removeTake(fid, speechId).catch(() => {});
    setTake((old) => (old && URL.revokeObjectURL(old.url), null));
    setOnDevice(null);
    resetConverted();
    setSpeechId(to);
    setStep(2);
  };
  const chooseVoice = (k: string) => {
    if (k === voiceKey) return;
    setVoiceKey(k);
    // Another voice keeps the take: it is converted again into the new voice when asked.
    if (converted) resetConverted();
  };

  async function agreeConsent() {
    setBusy('consent');
    const r = await authFetch('/api/voice/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: s!.consent.sha256 }) });
    setBusy(null);
    if (r.ok) void load();
    else setMessage(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong');
  }

  async function startTake() {
    if (!speech || countdown !== null || rec.state !== 'idle') return;
    setMessage(null);
    setStoppedAt(null);
    setShift(0);
    setPausedAt(null);
    for (let n = COUNTDOWN; n > 0; n--) {
      setCountdown(n);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    const out = await rec.start(max);
    if (!out) return;
    // A new take: the one before it, and anything converted from it, give way (stopping never discards: this one is kept).
    resetConverted();
    setAgree(false);
    setTake((old) => (old && URL.revokeObjectURL(old.url), { seconds: out.seconds, url: URL.createObjectURL(out.blob), speechId: speech.id, blob: out.blob }));
    setStoppedAt(out.seconds);
    setDeviceNote(null);
    if (fid !== null)
      await saveTake(fid, speech.id, out.blob, out.seconds)
        .then((t) => setOnDevice(t))
        .catch(() => (setOnDevice(null), setDeviceNote(W.onlyInTab)));
  }

  /** Send one recording to be converted (the whole take stays on the device whatever the answer). Never the words. */
  async function convert(blob: Blob, seconds: number, sentence: number | null, convertAgain = false): Promise<Converted | null> {
    const form = new FormData();
    form.set('take', blob, 'take');
    form.set('speechId', speech!.id);
    form.set('presetId', picked!.presetId);
    form.set('candidate', String(picked!.candidate));
    form.set('seconds', String(seconds));
    form.set('agree', s!.consent.sha256);
    if (sentence !== null) form.set('sentence', String(sentence));
    if (convertAgain) form.set('again', '1');
    const r = await authFetch('/api/voice/convert', { method: 'POST', body: form }).catch(() => null);
    if (!r?.ok) {
      // A day's limit (429) answers with #229's reread take lines (src/lib/voice/allowance-wording.ts: "You've converted
      // today's N takes. …" / "Today's voice conversions for everyone are used up. …") and the reset instant; {reset} is
      // written here, in the person's own time (withReset), never by the server.
      const j = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; resetAt?: string };
      if (r?.status === 409) void load();
      setMessage(j.error ? withReset(j.error, j.resetAt) : W.convertFailed);
      return null;
    }
    if (sentence === null) {
      const j = (await r.json()) as { draftId: string; ticket: string; check: string | null; checks: Check[] | null };
      const a = await authFetch(`/api/voice/drafts/${j.draftId}/0`).catch(() => null);
      const kept = a?.ok ? await a.blob() : new Blob();
      return { blob: kept, url: URL.createObjectURL(kept), ticket: j.ticket, seconds, draftId: j.draftId, check: j.check ?? undefined, checks: j.checks ?? undefined };
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
    }
    return c;
  }
  async function makeHis() {
    if (!take || !picked || !speech) return;
    if (take.blob.size > s!.limits.maxTakeBytes) return setMessage(TOO_LARGE(take.blob.size, s!.limits.maxTakeBytes));
    if (converting.current) return;
    converting.current = true;
    setBusy('convert');
    setMessage(null);
    setAgree(false);
    try {
      const c = await convert(take.blob, take.seconds, null, again === 'yes');
      if (c) {
        setConverted({ ...c, presetId: picked.presetId });
        setPlayUrl(c.url);
        setAccepted(c.draftId ?? null);
        setConvertedFor(take.url);
        setAgain('ask');
        void load();
      }
    } finally {
      converting.current = false;
      setBusy(null);
    }
  }
  async function recordRedo() {
    if (redoing === null) return;
    const out = await rec.start(s!.limits.maxSentenceSeconds);
    if (!out) return;
    setBusy('redo');
    const c = await convert(out.blob, out.seconds, redoing);
    setBusy(null);
    if (!c) return;
    const next = [...redos.filter((x) => x.n !== redoing), { ...c, n: redoing }];
    setRedos(next);
    setRedoing(null);
    if (converted) setPlayUrl(await joined(converted.blob, next, converted.checks).catch(() => converted.url));
    void load();
  }
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
  async function checkDraft() {
    if (!converted?.draftId) return;
    setBusy('check');
    setMessage(null);
    const r = await authFetch(`/api/voice/drafts/${converted.draftId}/check`, { method: 'POST' }).catch(() => null);
    setBusy(null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { id?: string; checks?: Check[]; check?: string; error?: string };
    if (!r?.ok || !j.id) return setMessage(j.error ?? W.checkFailed);
    setConverted({ ...converted, draftId: j.id, checks: j.checks, check: j.check });
    setAccepted(j.id);
    void load();
  }
  async function makeSamples() {
    setBusy('samples');
    const r = await authFetch('/api/voice/samples', { method: 'POST' }).catch(() => null);
    setBusy(null);
    const j = ((await r?.json().catch(() => null)) ?? null) as (Samples & { failed?: number; refused?: string | null }) | null;
    if (j?.samples) setSamples({ samples: j.samples, canMake: true, missing: j.missing, missingCredits: j.missingCredits });
    if (!r?.ok || j?.failed || j?.refused) setMessage(j?.refused ?? W.samplesFailed);
  }
  async function saveConverted() {
    if (converted && !redos.length) return saveBlob(converted.blob, `ephelion-${slug(speech!.title)}-${slug(picked?.name ?? 'voice')}.mp3`);
    if (playUrl && redos.length) {
      const b = await (await fetch(playUrl)).blob();
      return saveBlob(b, `ephelion-${slug(speech!.title)}-${slug(picked?.name ?? 'voice')}.${b.type === 'audio/wav' ? 'wav' : 'mp3'}`);
    }
    if (keptFromTake) {
      const r = await authFetch(`/api/voice/drafts/${keptFromTake.id}/0`).catch(() => null);
      if (r?.ok) saveBlob(await r.blob(), `ephelion-${slug(speech!.title)}-converted.mp3`);
    }
  }

  // ----- The pieces of each step -----
  const phone = !wide;
  const saveLabel = phone ? W.savePhone : W.saveComputer;
  const stepBar = (
    <nav className="er-steps" aria-label="Steps">
      <ol>
        {W.steps.map((label, i) => {
          const n = i + 1;
          const can = reached[i] && !recording && countdown === null && busy === null;
          return (
            <li key={label}>
              <button type="button" className={`er-step${step === n ? ' er-step-on' : reached[i] ? ' er-step-done' : ''}`} disabled={!can} aria-current={step === n ? 'step' : undefined} onClick={() => setStep(n)} data-step={n}>
                <span className="er-step-n">{n}</span>
                <span className="er-step-l">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  const speechText = (sp: Speech) => (
    <div className="er-speech-text">
      <p className="er-kicker">{sp.label.kind === 'book' ? `${W.bookLabel} · ${sp.label.block}` : `${W.inventedLabel}${sp.credit ? ` · ${sp.credit}` : ''} · version ${sp.version}`}</p>
      <h2 className="er-h1">{sp.title}</h2>
      {sp.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p className="er-kicker er-meta-line">{W.speechMeta(sp.sentences.reduce((a, x) => a + wordCount(x.text), 0), mmss((sp.sentences.reduce((a, x) => a + wordCount(x.text), 0) / WPM) * 60))}</p>
    </div>
  );
  const confirmBox = confirmSpeech && speech && (
    <div className="er-confirm" role="alertdialog" aria-label={W.changeSpeech(speech.title)}>
      <p>{W.changeSpeech(speech.title)}</p>
      <div className="er-row">
        <button type="button" className="er-btn" onClick={() => void changeSpeech()}>{W.changeYes}</button>
        <button type="button" className="er-btn er-quiet" onClick={() => setConfirmSpeech(null)}>{W.changeNo}</button>
      </div>
    </div>
  );
  const viewed = s.speeches.find((x) => x.id === viewing) ?? s.speeches[0];
  const speechList = (
    <div className="er-list" role="list">
      {s.speeches.map((x) => (
        <button
          key={x.id}
          type="button"
          role="listitem"
          className={`er-opt${(wide ? viewing : speechId) === x.id ? ' er-sel' : ''}`}
          onClick={() => (setViewing(x.id), setDetail(true))}
          data-speech={x.id}
        >
          <span className="er-opt-title">{x.title}</span>
          {phone && <span className="er-opt-line">{x.sentences[0]?.text.slice(0, 90)}…</span>}
          <span className="er-kicker">{x.label.kind === 'book' ? 'Book' : 'Invented'} · about {mmss((x.sentences.reduce((a, y) => a + wordCount(y.text), 0) / WPM) * 60)}</span>
        </button>
      ))}
    </div>
  );

  const voiceList = (
    <div className="er-list" role="radiogroup" aria-label={W.pickVoice}>
      {voices.map((v) => {
        const k = `${v.presetId}#${v.candidate}`;
        return (
          <div key={k} className={`er-opt er-voice${voiceKey === k ? ' er-sel' : ''}`} role="radio" aria-checked={voiceKey === k} tabIndex={0} onClick={() => chooseVoice(k)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && chooseVoice(k)} data-voice={v.presetId}>
            {speech && <SamplePlay speechId={speech.id} presetId={v.presetId} ready={sampleReady(speech.id, v.presetId)} label={v.name} />}
            <span>
              <span className="er-opt-title">{v.name}</span>
              {phone && <span className="er-kicker">{voiceKey === k ? `${W.chosen} · ` : ''}{v.description.slice(0, 60)}{v.description.length > 60 ? '…' : ''}</span>}
              {speech && !sampleReady(speech.id, v.presetId) && <span className="er-kicker">{W.sampleSoon}</span>}
            </span>
          </div>
        );
      })}
      {samples?.canMake && samples.missing > 0 && (
        <button type="button" className="er-btn er-quiet er-small" onClick={() => void makeSamples()} disabled={busy !== null}>
          {busy === 'samples' ? W.makingSamples : W.makeSamples(samples.missingCredits)}
        </button>
      )}
    </div>
  );

  const consentCard = (
    <section className="er-card er-consent" aria-labelledby="er-consent-h">
      <p className="er-kicker">{s.consent.reread ? s.consent.version : `Draft wording · ${s.consent.version}`}</p>
      <h2 id="er-consent-h">{s.consent.title}</h2>
      <ol>
        {s.consent.text.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="er-strong">{s.consent.line}</p>
      <button type="button" className="er-btn" onClick={agreeConsent} disabled={busy === 'consent'}>
        I agree
      </button>
    </section>
  );

  const state = countdown !== null ? 'count' : recording ? 'rec' : take && stoppedAt !== null ? 'stop' : 'ready';
  const badge =
    state === 'count' ? <span className="er-badge er-badge-count">{W.countdown}</span> : state === 'rec' ? <span className="er-badge er-badge-rec">● {W.recording}</span> : state === 'stop' ? <span className="er-badge er-badge-stop">{W.stopped}</span> : null;
  const recButton = (
    <div className="er-recbox">
      {state === 'rec' ? (
        <button type="button" className="er-rec er-rec-stop" onClick={rec.stop} aria-label={W.stop}>
          <span className="er-rec-square" />
        </button>
      ) : (
        <button type="button" className={`er-rec${state === 'count' ? ' er-rec-wait' : ''}`} onClick={() => void startTake()} disabled={state === 'count' || busy !== null || webClient} aria-label={W.start}>
          <span className="er-rec-dot" />
        </button>
      )}
      <div>
        <div className="er-rec-title">{state === 'count' ? String(countdown) : state === 'rec' ? (phone ? W.stopLeft(mmss(Math.max(0, max - rec.elapsed))) : W.stop) : state === 'stop' ? W.stoppedAt(mmss(stoppedAt ?? 0)) : W.start}</div>
        <div className="er-kicker">{state === 'count' ? W.getReady : state === 'rec' ? W.recordingSub(mmss(rec.elapsed), mmss(Math.max(0, max - rec.elapsed))) : state === 'stop' ? (onDevice ? W.savedHere : W.onlyInTab) : W.startSub(mmss(max))}</div>
      </div>
      {phone && <span className="er-badge-slot">{badge}</span>}
    </div>
  );
  const readerControls = (
    <div className="er-reader">
      <label className="er-switch">
        <input type="checkbox" checked={hl} onChange={(e) => (setHl(e.target.checked), keepReader({ hl: e.target.checked, size }))} />
        <span>{phone ? W.highlightShort : W.highlight}</span>
      </label>
      <span className="er-sizes">
        <button type="button" className="er-size" aria-label={W.smaller} disabled={size === 0} onClick={() => (setSize(size - 1), keepReader({ hl, size: size - 1 }))}>A</button>
        <button type="button" className="er-size er-size-big" aria-label={W.bigger} disabled={size === SIZES.length - 1} onClick={() => (setSize(size + 1), keepReader({ hl, size: size + 1 }))}>A</button>
      </span>
    </div>
  );
  const nudge = recording && hl && (
    <div className="er-row">
      <button type="button" className="er-btn er-quiet er-small" onClick={() => moveTo((pausedAt ?? timed) - 1)}>◀ {W.backLine}</button>
      <button type="button" className="er-btn er-quiet er-small" onClick={() => moveTo((pausedAt ?? timed) + 1)}>{W.forwardLine} ▶</button>
    </div>
  );
  const pausedNote = pausedAt !== null && recording && (
    <p className="er-paused" role="status">
      {W.paused}{' '}
      <button type="button" className="er-btn er-small" onClick={() => moveTo(pausedAt)}>{W.resume}</button>
    </p>
  );
  const afterStop = state === 'stop' && (
    <>
      <div className="er-row er-two">
        <button type="button" className="er-btn er-quiet" onClick={() => void startTake()} disabled={busy !== null}>{W.recordAgain}</button>
        <button type="button" className="er-btn" onClick={() => setStep(4)}>{W.nextListen}</button>
      </div>
      <p className="er-note">{phone ? (onDevice ? W.savedPhone(mmss(stoppedAt ?? 0)) : W.onlyInTab) + ' ' : ''}{W.redoLater}</p>
    </>
  );
  const editor = editing && speech && (
    <div className="er-edit">
      {/* The site's "kept in this browser only" box (check:principles P1f; Nate, 2026-11-26): edited words stay on the
          device, are never sent or published, and the box says so. */}
      <LocalTextField id="er-words" label={<span className="er-kicker">{W.editText}</span>} value={draftWords} onChange={setDraftWords} rows={12} />
      <p className="er-note">{W.editKept}</p>
      <div className="er-row">
        <button
          type="button"
          className="er-btn"
          onClick={() => {
            const t = draftWords.trim();
            const asWritten = t === speech.paragraphs.join('\n\n').trim();
            if (fid !== null) (asWritten || !t ? removeWords(fid, speech.id) : saveWords(fid, speech.id, t));
            setEditedWords(asWritten || !t ? null : t);
            setEditing(false);
          }}
        >
          {W.editDone}
        </button>
        {editedWords !== null && (
          <button type="button" className="er-btn er-quiet" onClick={() => (fid !== null && removeWords(fid, speech.id), setEditedWords(null), setEditing(false))}>
            {W.editReset}
          </button>
        )}
      </div>
    </div>
  );
  const openEditor = () => {
    setDraftWords(editedWords ?? speech?.paragraphs.join('\n\n') ?? '');
    setEditing(true);
  };
  const scriptView = speech && (
    <div
      className={`er-script${hl && recording ? ' er-live' : ''}`}
      ref={script}
      style={{ fontSize: SIZES[size] }}
      onWheel={byHand}
      onTouchMove={byHand}
      onKeyDown={(e) => ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key) && byHand()}
      tabIndex={0}
      aria-label={speech.title}
    >
      {editedWords !== null && <p className="er-kicker">{W.editedMark}</p>}
      {sentences.map((t, i) => (
        <p
          key={i}
          data-n={i}
          className={`er-sent${i === current ? ' er-now' : current >= 0 && i < current ? ' er-past' : ''}`}
          onClick={() => recording && hl && moveTo(i)}
        >
          {t}
        </p>
      ))}
    </div>
  );

  const takeBox = take && (
    <div className="er-card er-take">
      <p className="er-kicker">{W.yourRecording(mmss(take.seconds))}</p>
      <div className="er-row">
        <Play url={take.url} label={W.yourRecording(mmss(take.seconds))} />
        <button type="button" className="er-btn er-quiet er-small" onClick={() => saveBlob(take.blob, `ephelion-${slug(speech?.title ?? 'speech')}-my-recording.${extOf(take.blob.type)}`)}>{saveLabel}</button>
        <button type="button" className="er-link" onClick={() => void removeHere()} disabled={busy !== null}>{W.remove}</button>
      </div>
      <p className={onDevice ? 'er-ok' : 'er-note'}>{onDevice ? W.savedHere : W.onlyInTab}</p>
      {deviceNote && <p className="er-warn">{deviceNote}</p>}
    </div>
  );
  const convertPart = take && picked && (
    convertedBefore && again !== 'yes' && !converted ? (
      <div className="er-card" data-slot="convert-again">
        {keptFromTake && keptFromTake.presetId !== picked.presetId && <p className="er-note">{W.voiceChanged}</p>}
        {keptFromTake && keptFromTake.presetId === picked.presetId && (
          <div className="er-row">
            <SignedAudio path={`/api/voice/drafts/${keptFromTake.id}/0`} label={W.inHisVoice(picked.name, mmss(take.seconds))} />
            <button type="button" className="er-btn er-quiet er-small" onClick={() => void saveConverted()}>{saveLabel}</button>
          </div>
        )}
        {again === 'kept' ? null : (
          <p className="er-note">
            {CONVERT_AGAIN.line}{' '}
            <button type="button" className="er-btn er-small" disabled={busy !== null || (s.today?.conversionsLeft ?? 1) <= 0} onClick={() => setAgain('yes')}>{CONVERT_AGAIN.again}</button>{' '}
            <button type="button" className="er-btn er-quiet er-small" disabled={busy !== null} onClick={() => setAgain('kept')}>{CONVERT_AGAIN.keep}</button>
          </p>
        )}
      </div>
    ) : !converted ? (
      <div className="er-card">
        <label className="er-tick">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{W.sendTick(picked.name)}</span>
        </label>
        <button type="button" className="er-btn er-wide" onClick={() => void makeHis()} disabled={!agree || !s.ready || busy !== null}>
          {busy === 'convert' ? W.converting : `${again === 'yes' ? CONVERT_AGAIN.again : phone ? W.makeHisVoice(picked.name) : W.makeHis} (≈ ${credits(take.seconds).toLocaleString('en-US')} credits)`}
        </button>
        {s.today && <p className="er-kicker">{W.today(s.today.credits, s.today.capCredits, s.today.conversionsLeft)}</p>}
      </div>
    ) : (
      <div className="er-card er-converted">
        <p className="er-kicker">{W.inHisVoice(picked.name, mmss(converted.seconds))}</p>
        <div className="er-row">
          {playUrl && <Play url={playUrl} label={W.inHisVoice(picked.name, mmss(converted.seconds))} />}
          <button type="button" className="er-btn er-quiet er-small" onClick={() => void saveConverted()}>{saveLabel}</button>
        </div>
        <p className="er-note">{W.convertedAi(picked.name)}</p>
      </div>
    )
  );
  const checks = converted?.checks;
  const stillWrong = checks?.filter((c) => !c.ok && !redos.find((r) => r.n === c.n && r.checks?.[0]?.ok)) ?? [];
  // The sentence redo the site has today: after converting, on the Listen step, under the word check.
  const checkPart = converted && speech && (
    <section className="er-card" aria-labelledby="er-check-h">
      <h3 id="er-check-h">{W.checkTitle}</h3>
      {checks ? (
        <>
          <p className="er-ok" data-slot="take-label">{stillWrong.length ? IMPROV_WORDING.improvisedLabel(speech.title, speech.version) : IMPROV_WORDING.wordForWordLabel}</p>
          <details className="er-check-list" open={stillWrong.length > 0 && stillWrong.length <= Math.ceil(checks.length / 2)}>
          <summary>{stillWrong.length ? W.checkSome(stillWrong.length, checks.length) : W.checkAll(checks.length)}</summary>
          <ol className="er-checks">
            {checks.map((c) => {
              const redo = redos.find((r) => r.n === c.n);
              const ok = redo ? Boolean(redo.checks?.[0]?.ok) : c.ok;
              return (
                <li key={c.n} className={ok ? 'er-pass' : 'er-fail'}>
                  <span className="er-mark" aria-label={ok ? 'Matches' : "Doesn't match"}>{ok ? '✓' : '✕'}</span>
                  <span>{speech.sentences[c.n]?.text}</span>
                  {(!c.ok || redo) && redoing !== c.n && (
                    <button type="button" className="er-btn er-quiet er-small" onClick={() => (setRedoing(c.n), setRedoAgree(false))} disabled={busy !== null || rec.state !== 'idle'}>{W.redo}</button>
                  )}
                  {redoing === c.n && (
                    <div className="er-redo">
                      <label className="er-tick">
                        <input type="checkbox" checked={redoAgree} onChange={(e) => setRedoAgree(e.target.checked)} />
                        <span>{W.redoTick}</span>
                      </label>
                      <div className="er-row">
                        {rec.state === 'recording' ? (
                          <button type="button" className="er-btn er-stop" onClick={rec.stop}>{W.stop} · {mmss(rec.elapsed)}</button>
                        ) : (
                          <button type="button" className="er-btn" onClick={() => void recordRedo()} disabled={!redoAgree || busy !== null}>{busy === 'redo' ? W.converting : W.redoRecord}</button>
                        )}
                        <button type="button" className="er-btn er-quiet" onClick={() => setRedoing(null)} disabled={rec.state !== 'idle' || busy !== null}>{W.cancel}</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          </details>
          {redos.length > 0 && !(accepted && accepted !== converted.draftId) ? (
            <button type="button" className="er-btn" onClick={() => void accept()} disabled={!converted.check || busy !== null}>{busy === 'accept' ? W.keeping : W.useThis}</button>
          ) : accepted ? (
            <p className="er-ok">{W.kept}</p>
          ) : null}
        </>
      ) : busy === 'convert' || busy === 'check' ? (
        <p className="er-note">{W.checking}</p>
      ) : (
        <>
          <p className="er-note">{W.noCheck}</p>
          <button type="button" className="er-btn er-quiet er-small" onClick={() => void checkDraft()} disabled={busy !== null || !converted.draftId}>{W.checkAgain}</button>
        </>
      )}
    </section>
  );
  // Entering the take (PR 6, 2026-11-26): the converted take as checked; with redone sentences, once "Use this one" kept them.
  const entryDraft = converted && (converted.check || stillWrong.length === 0 || checks) ? (redos.length ? (accepted && accepted !== converted.draftId ? accepted : null) : converted.draftId) : null;
  const entryPart = entryDraft && fid !== null && speech && picked ? <EphelionEntry key={entryDraft} fid={fid} draftId={entryDraft} speechTitle={speech.title} voiceName={picked.name} wide={wide} /> : null;
  const teaser = <p className="er-teaser">{W.teaser}</p>;
  const recordNew = (
    <button type="button" className="er-link" onClick={() => setStep(3)}>{W.recordNew}</button>
  );

  // ----- Each step, laid out for the page's width -----
  let side: React.ReactNode = null;
  let main: React.ReactNode = null;
  let foot: React.ReactNode = null;
  if (step === 1) {
    if (wide) {
      side = (
        <>
          <h2>{W.chooseSpeech}</h2>
          {speechList}
          {confirmBox}
          <button type="button" className="er-btn er-wide" onClick={() => viewed && chooseSpeech(viewed.id)}>{W.useSpeech}</button>
        </>
      );
      main = viewed && speechText(viewed);
    } else if (detail && viewed) {
      main = (
        <>
          <button type="button" className="er-link" onClick={() => setDetail(false)}>{W.allSpeeches}</button>
          {speechText(viewed)}
          {confirmBox}
        </>
      );
      foot = <button type="button" className="er-btn er-wide er-big" onClick={() => chooseSpeech(viewed.id)}>{W.useSpeech}</button>;
    } else {
      main = (
        <>
          <h2>{W.chooseSpeech}</h2>
          {speechList}
        </>
      );
      foot = <button type="button" className="er-btn er-wide er-big er-hint" disabled>{W.tapToRead}</button>;
    }
  } else if (step === 2 && speech) {
    const chosen = picked ?? voices[0];
    if (wide) {
      side = (
        <>
          <h2>{W.pickVoice}</h2>
          <p className="er-note">{W.voiceNote}</p>
          {voiceList}
          <button type="button" className="er-btn er-wide" disabled={!picked} onClick={() => setStep(3)}>{W.nextRecord}</button>
        </>
      );
      main = chosen && (
        <div className="er-voice-detail">
          <p className="er-kicker">{W.hisVoice}</p>
          <h2 className="er-h1">{chosen.name}</h2>
          <p>{chosen.description}</p>
          <div className="er-card er-sample">
            <SamplePlay speechId={speech.id} presetId={chosen.presetId} ready={sampleReady(speech.id, chosen.presetId)} label={chosen.name} />
            <div>
              <p className="er-sample-line">“{speech.sentences[0]?.text}”</p>
              <p className="er-kicker">{sampleReady(speech.id, chosen.presetId) ? W.sampleAi : W.sampleSoon}</p>
            </div>
          </div>
          <p className="er-note">{W.sampleNote}</p>
        </div>
      );
    } else {
      main = (
        <>
          <h2>{W.pickVoice}</h2>
          <p className="er-note">{W.voiceNotePhone(speech.title)}</p>
          {voiceList}
          <p className="er-kicker">{W.sampleAi}</p>
        </>
      );
      foot = <button type="button" className="er-btn er-wide er-big" disabled={!picked} onClick={() => setStep(3)}>{W.nextRecord}</button>;
    }
  } else if (step === 3 && speech && picked) {
    if (!s.consent.agreed) {
      main = consentCard;
      if (wide) side = <h2>{W.record}</h2>;
    } else if (wide) {
      side = (
        <>
          <h2>{W.record}</h2>
          <p className="er-card er-note">{W.recordNote(mmss(max))}</p>
          <button type="button" className="er-btn er-quiet er-small er-self" onClick={openEditor} disabled={recording || countdown !== null || editing}>{W.editText}</button>
          {badge}
          {webClient && <p className="er-warn">{W.webClient}</p>}
          {recButton}
          {rec.error && <p className="er-warn">{rec.error}</p>}
          {nudge}
          {pausedNote}
          {readerControls}
          {afterStop}
        </>
      );
      main = (
        <>
          <p className="er-kicker">{speech.title} · {recording ? (hl ? W.highlightOn : W.highlightOff) : picked.name}</p>
          {editor || scriptView}
        </>
      );
    } else {
      main = (
        <>
          <div className="er-strip">
            <span>{W.recordNotePhone(mmss(max))}</span>
            <button type="button" className="er-link" onClick={openEditor} disabled={recording || countdown !== null || editing}>{W.editTextShort}</button>
          </div>
          <p className="er-kicker">{speech.title} · {picked.name}</p>
          {editor || scriptView}
          {webClient && <p className="er-warn">{W.webClient}</p>}
        </>
      );
      foot = editing ? null :
        state === 'stop' ? (
          afterStop
        ) : (
          <>
            {pausedNote}
            {nudge}
            {readerControls}
            {recButton}
            {rec.error && <p className="er-warn">{rec.error}</p>}
          </>
        );
    }
  } else if (step === 4 && speech && picked) {
    const parts = (
      <>
        {takeBox}
        {convertPart}
      </>
    );
    if (wide) {
      side = (
        <>
          <h2>{W.listen}</h2>
          {parts}
          {recordNew}
        </>
      );
      main = (
        <>
          {checkPart}
          {entryPart}
          {teaser}
        </>
      );
    } else {
      main = (
        <>
          <h2>{W.listen}</h2>
          {parts}
          {checkPart}
          {entryPart}
          {recordNew}
          {teaser}
        </>
      );
    }
  }

  return (
    <div className={`er-wrap${wide ? ' er-wide-page' : ' er-phone'}`} ref={wrap}>
      <header className="er-top">
        <Link href="/ephelion" className="er-exit">‹ {W.exit}</Link>
        <span className="er-title">{W.title}</span>
        <span className="er-kicker er-stepof">{wide ? W.stepOf(step) : ''}</span>
      </header>
      {!wide && <div className="er-pin">{stepBar}</div>}
      {!s.ready && <p className="er-warn er-pad" role="status">{W.notReady}</p>}
      {message && <p className="er-warn er-pad" role="alert">{message}</p>}
      <div className="er">
        {wide && (
          <aside className="er-side">
            {stepBar}
            {side}
          </aside>
        )}
        <section className="er-main">{main}</section>
      </div>
      {!wide && foot && <div className="er-foot">{foot}</div>}
    </div>
  );
}
