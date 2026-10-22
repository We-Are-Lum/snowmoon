'use client';

import { notFound } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { SYSTEM_FID } from '~/lib/config';
import type { VOICE_TEST } from '~/lib/voice-test';

type Manifest = typeof VOICE_TEST & { media: string };
type Results = Record<string, unknown>;
interface Stored {
  status: 'running' | 'done' | 'error';
  stage: string;
  startedAt: string;
  ep: string;
  where?: string;
  partial?: Results;
}

/** Progress is kept here as the test runs, so a tab that reloads (iOS ends a tab that runs out of memory) can say where it stopped. */
const KEY = 'snowmoon.voice-test.run';
const MEDIA = 'https://media.snowmoon.party';
/** Origins media.snowmoon.party's CORS lets read it; elsewhere (a preview) the page reads the same files through the site's own /voice-media/. */
const DIRECT = ['https://snowmoon.party', 'https://www.snowmoon.party', 'http://localhost:3000'];
const COMMIT = (process.env.APP_COMMIT ?? 'unknown').slice(0, 7);

function store(s: Stored) {
  const v = JSON.stringify(s);
  try {
    sessionStorage.setItem(KEY, v);
    localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked: a reload can't be detected */
  }
}
function stored(): Stored | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY) ?? 'null') as Stored | null;
  } catch {
    return null;
  }
}

async function decode(url: string, sr: number, maxSeconds?: number): Promise<Float32Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.split('/').pop()}`);
  const buf = await res.arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 1, sr).decodeAudioData(buf);
  let x = decoded.getChannelData(0);
  if (maxSeconds) x = x.slice(0, Math.floor(maxSeconds * sr));
  return Float32Array.from(x);
}

/** 16-bit PCM WAV (Safari's <audio> may not play float WAV). */
function wav(samples: Float32Array, sr: number): Blob {
  const b = new ArrayBuffer(44 + samples.length * 2);
  const d = new DataView(b);
  const w = (o: number, s: string) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); d.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, sr, true);
  d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] || 0)) * 0x7fff, true);
  return new Blob([b], { type: 'audio/wav' });
}

interface GpuInfo {
  present: boolean;
  adapter?: { vendor: string; architecture: string; device: string; description: string } | null;
  shaderF16?: boolean;
  maxBufferMB?: number;
  maxStorageBindingMB?: number;
  error?: string;
}
type BenchModule = {
  bench: (cfg: unknown, input: unknown, emit: (stage: string, partial: Results) => void) => Promise<{ results: Results; audio: Float32Array; sampleRate: number }>;
  gpuInfo: () => Promise<GpuInfo>;
};
const loadBench = (): Promise<BenchModule> => {
  const url = '/voice-test/bench.js';
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<BenchModule>;
};

const gpuText = (g: GpuInfo | null | undefined) =>
  !g ? '…' : !g.present ? 'no (navigator.gpu missing)' : !g.adapter ? `navigator.gpu present, no adapter${g.error ? ` (${g.error})` : ''}` : `yes: ${[g.adapter.vendor, g.adapter.architecture, g.adapter.device, g.adapter.description].filter(Boolean).join(' · ') || 'adapter (no info)'}${g.shaderF16 ? ', shader-f16' : ''}, max buffer ${g.maxBufferMB} MB`;

export function VoiceTest() {
  const auth = useAuth();
  const [gate, setGate] = useState<'checking' | 'owner' | 'denied'>('checking');
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [device, setDevice] = useState<Results | null>(null);
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [previous, setPrevious] = useState<Stored | null>(null);
  const [stage, setStage] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hidden = useRef(false);

  useEffect(() => {
    if (auth.kind === 'loading') return;
    if (auth.kind !== 'signed-in' || auth.fid !== SYSTEM_FID) {
      setGate('denied');
      return;
    }
    let alive = true;
    void authFetch('/api/voice-test')
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setGate('denied');
        setManifest((await r.json()) as Manifest);
        setGate('owner');
      })
      .catch(() => alive && setGate('denied'));
    return () => {
      alive = false;
    };
  }, [auth]);

  useEffect(() => {
    if (gate !== 'owner') return;
    const nav = navigator as Navigator & { deviceMemory?: number };
    setDevice({
      userAgent: navigator.userAgent,
      deviceMemoryGB: nav.deviceMemory ?? 'not exposed',
      cores: navigator.hardwareConcurrency ?? 'not exposed',
      screen: `${screen.width}×${screen.height} @${devicePixelRatio}x`,
      crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
    });
    void loadBench().then((m) => m.gpuInfo()).then(setGpu).catch((e) => setGpu({ present: !!(navigator as Navigator & { gpu?: unknown }).gpu, adapter: null, error: String(e) }));
    const s = stored();
    // A run that never finished: the tab reloaded or was ended while it ran.
    if (s?.status === 'running') {
      setPrevious(s);
      store({ ...s, status: 'error', stage: `${s.stage} (the tab reloaded or crashed here)` });
    } else if (s) setPrevious(s);
    const vis = () => {
      if (document.hidden) hidden.current = true;
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [gate]);

  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    const id = setInterval(() => setElapsed(Math.round((performance.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [running]);

  if (gate === 'denied') notFound();
  if (gate !== 'owner' || !manifest) return <div className="page voice-test" aria-busy="true" />;

  const run = async (ep: 'webgpu' | 'wasm') => {
    setRunning(true);
    setResults(null);
    setError(null);
    setCopied(false);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    hidden.current = document.hidden;
    const viaProxy = !DIRECT.includes(location.origin) || new URLSearchParams(location.search).get('via') === 'proxy';
    const base = viaProxy ? `${location.origin}/voice-media/` : `${MEDIA}/${manifest.media}/`;
    const started = new Date().toISOString();
    let where = 'worker';
    let partial: Results = {};
    const progress = (s: string, p?: Results) => {
      if (p) partial = p;
      setStage(s);
      store({ status: 'running', stage: s, startedAt: started, ep, where, partial });
    };
    const R: Results = { page: `${location.origin}/voice-test`, commit: COMMIT, at: started, files_from: viaProxy ? 'site (/voice-media/ → media.snowmoon.party)' : 'media.snowmoon.party', runs: 2 };
    try {
      progress('loading the test line');
      let t = performance.now();
      const [line, ref] = await Promise.all([decode(base + manifest.line.key, 24000), decode(base + manifest.reference.key, 24000, 10)]);
      R.decode_audio_ms = Math.round(performance.now() - t);
      const cfg = { base, files: manifest, ep, runs: 2 };
      let out: { results: Results; audio: Float32Array; sampleRate: number };
      // In a worker when it can see the GPU too; otherwise on the page.
      let worker: Worker | null = null;
      try {
        worker = new Worker('/voice-test/worker.js', { type: 'module' });
        const w = worker;
        const hello = await new Promise<{ gpu: GpuInfo }>((res, rej) => {
          const to = setTimeout(() => rej(new Error('worker did not answer')), 15000);
          w.onmessage = (e) => { clearTimeout(to); res(e.data as { gpu: GpuInfo }); };
          w.onerror = (e) => { clearTimeout(to); rej(new Error(e.message || 'worker failed to start')); };
          w.postMessage({ type: 'hello' });
        });
        R.gpu_in_worker = gpuText(hello.gpu);
        if (ep === 'webgpu' && !hello.gpu.adapter && gpu?.adapter) throw new Error('no WebGPU adapter in the worker');
      } catch (e) {
        worker?.terminate();
        worker = null;
        where = 'page (main thread)';
        R.worker_note = String((e as Error).message ?? e);
      }
      R.ran_in = where;
      if (worker) {
        const w = worker;
        out = await new Promise((res, rej) => {
          w.onmessage = (e) => {
            const m = e.data as { type: string; stage?: string; partial?: Results; error?: string; results?: Results; audio?: Float32Array; sampleRate?: number };
            if (m.type === 'progress') progress(m.stage!, m.partial);
            else if (m.type === 'done') res({ results: m.results!, audio: m.audio!, sampleRate: m.sampleRate! });
            else if (m.type === 'error') rej(new Error(m.error));
          };
          w.onerror = (e) => rej(new Error(e.message || 'the worker stopped'));
          w.postMessage({ type: 'run', cfg, input: { line, ref } }, [line.buffer, ref.buffer]);
        });
        w.terminate();
      } else {
        const mod = await loadBench();
        out = await mod.bench(cfg, { line, ref }, (s, p) => progress(s, p));
      }
      const all = { ...R, ...out.results, total_s: Math.round((Date.now() - Date.parse(started)) / 1000), tab_hidden_during_run: hidden.current };
      setResults(all);
      setAudioUrl(URL.createObjectURL(wav(out.audio, out.sampleRate)));
      store({ status: 'done', stage: 'done', startedAt: started, ep, where, partial: all });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      setError(msg);
      setResults({ ...R, ...partial, error: msg });
      store({ status: 'error', stage: `error: ${msg}`, startedAt: started, ep, where, partial });
    } finally {
      setRunning(false);
      setStage('');
    }
  };

  const report = () =>
    JSON.stringify({ device, gpu_on_page: gpuText(gpu), previous_run: previous ? { status: previous.status, stage: previous.stage, startedAt: previous.startedAt, ep: previous.ep, partial: previous.partial } : null, results }, null, 1);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
    } catch {
      setCopied(false);
      // No clipboard: select the text below so it can be copied by hand.
      const pre = document.getElementById('vt-report');
      if (pre) {
        const r = document.createRange();
        r.selectNodeContents(pre);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(r);
      }
    }
  };
  const ms = (v: unknown) => (typeof v === 'number' ? `${(v / 1000).toFixed(1)} s` : '—');
  const r = results ?? {};
  const sessions = (r.session_ms ?? {}) as Record<string, number>;
  const converts = (r.convert_ms ?? []) as number[];
  const rows: [string, string][] = results
    ? [
        ['Ran on', `${String(r.ep).toUpperCase()}, in the ${String(r.ran_in)}`],
        ['Download', `${r.download_mb ?? '—'} MB in ${ms(r.download_ms)}${r.download_mbps ? ` (${r.download_mbps} MB/s)` : ''}`],
        ['Open encoder', ms(sessions.encoder)],
        ['Open decoder', ms(sessions.decoder)],
        ['Conditioning (Bai)', ms(r.conditioning_ms)],
        ['Convert, first run', ms(converts[0])],
        ['Convert, second run', ms(converts[1])],
        ['Line length', r.input_s ? `${r.input_s} s` : '—'],
        ['Real-time factor', r.rtf_first ? `${r.rtf_first} first, ${r.rtf_best} best (below 1 is faster than real time)` : '—'],
        ['Whole test', r.total_s ? `${r.total_s} s` : '—'],
        ['Output check', r.output_check ? JSON.stringify(r.output_check) : '—'],
        ['Tab hidden during run', r.tab_hidden_during_run ? 'yes (times may be longer)' : 'no'],
      ]
    : [];

  return (
    <div className="page voice-test">
      <h1>Voice test</h1>
      <p className="vt-lede">
        Owner only. Converts Zei&apos;s finished line &ldquo;Take it easy, you&apos;re my competition too.&rdquo; into Bai&apos;s voice, on this device. No microphone; nothing is uploaded. It downloads about {Math.round((manifest.model.encoderData.bytes + manifest.model.decoderData.bytes) / 2 ** 20)} MB from the site&apos;s media, then takes a minute or more.
      </p>

      {previous?.status === 'running' || (previous?.status === 'error' && /reloaded or crashed/.test(previous.stage)) ? (
        <p className="vt-alert" role="alert">
          The last run did not finish. It stopped at: <strong>{previous.stage.replace(/ \(the tab reloaded or crashed here\)$/, '')}</strong>. The tab reloaded or crashed (on an iPhone, usually out of memory).
        </p>
      ) : null}

      <dl className="vt-rows">
        <div className="vt-row">
          <dt>WebGPU</dt>
          <dd>{gpuText(gpu)}</dd>
        </div>
        <div className="vt-row">
          <dt>Device memory</dt>
          <dd>{String(device?.deviceMemoryGB ?? '…')}{typeof device?.deviceMemoryGB === 'number' ? ' GB' : ''}</dd>
        </div>
        <div className="vt-row">
          <dt>Browser</dt>
          <dd className="vt-ua">{String(device?.userAgent ?? '…')}</dd>
        </div>
      </dl>

      <div className="vt-actions">
        {gpu?.adapter ? (
          <button type="button" className="vt-button" disabled={running} onClick={() => void run('webgpu')}>
            Run the test (WebGPU)
          </button>
        ) : null}
        <button type="button" className={gpu?.adapter ? 'vt-button vt-secondary' : 'vt-button'} disabled={running || !gpu} onClick={() => void run('wasm')}>
          {gpu?.adapter ? 'Run on WASM instead (slow)' : 'Run the test (WASM, slow)'}
        </button>
      </div>

      {running ? (
        <p className="vt-stage" aria-live="polite">
          {stage || 'starting'} · {elapsed} s
        </p>
      ) : null}
      {error ? (
        <p className="vt-alert" role="alert">
          It failed: {error.split('\n')[0]}
        </p>
      ) : null}

      {results ? (
        <>
          <dl className="vt-rows vt-results">
            {rows.map(([k, v]) => (
              <div key={k} className="vt-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {audioUrl ? (
            <div className="vt-play">
              <p>Bai, converted on this device:</p>
              <audio controls src={audioUrl} preload="auto" />
            </div>
          ) : null}
        </>
      ) : null}

      {results || previous ? (
        <div className="vt-actions">
          <button type="button" className="vt-button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy results'}
          </button>
        </div>
      ) : null}
      {results || previous ? <pre id="vt-report" className="vt-report" aria-label="Results as text">{report()}</pre> : null}

      <p className="vt-fine">
        Model: {manifest.model.name}, from {manifest.model.source}. Runtime: {manifest.runtime.name}. Reference: {manifest.reference.label}. Build {COMMIT}.
      </p>
      <p className="as-draft">Draft wording</p>
    </div>
  );
}
