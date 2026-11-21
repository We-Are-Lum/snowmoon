'use client';

import { useEffect, useRef, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { inMiniApp, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { MIC_HELP, micPermission, micPlace, promptShown } from '~/lib/mic-help';
import { HOST_CHECK_MS, HOST_PROMPT_MS, withTimeout } from '~/lib/host-timeout';

/**
 * The microphone go/no-go (Nate, 2026-11-19). Asks for the microphone (inside a Farcaster app through
 * sdk.actions.requestCameraAndMicrophoneAccess when the host offers it), records up to 20 seconds with MediaRecorder and
 * plays it back from memory. Nothing is sent anywhere or kept: the recording is a Blob in this tab, dropped on reload.
 * The summary line at the end is what to screenshot.
 */
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus', 'audio/wav'];
const LIMIT_S = 20;

/** inApp and hasAction are null when the host didn't answer in time ("unknown"): Record is enabled anyway. */
type Env = { inApp: boolean | null; platform: string; client: string; hasAction: boolean | null; ua: string; recorder: boolean; types: string[] };

export function MicTest({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [env, setEnv] = useState<Env | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'done' | 'failed'>('idle');
  const [take, setTake] = useState<{ url: string; type: string; bytes: number; seconds: number } | null>(null);
  const [level, setLevel] = useState(0);
  const [help, setHelp] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ before: string | null; after: string | null } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const peak = useRef(0);
  const note = (s: string) => setLog((l) => [...l, `${((performance.now() / 1000) | 0)}s ${s}`]);

  useEffect(() => {
    if (!admin) return;
    void (async () => {
      // Each host check is raced against HOST_CHECK_MS: one that doesn't answer is logged and treated as unknown, and
      // Record is enabled regardless (Nate, 2026-11-21).
      const said = (what: string, r: { ok: boolean; why?: string; error?: string }) => {
        if (!r.ok) note(`${what} didn't answer (${r.why === 'timeout' ? `no answer in ${HOST_CHECK_MS / 1000} s` : r.error}): treated as unknown`);
      };
      const app = await withTimeout(inMiniApp(), HOST_CHECK_MS);
      said('isInMiniApp', app);
      const inApp = app.ok ? app.value : null;
      let platform = '';
      let client = '';
      let hasAction: boolean | null = inApp === false ? false : null;
      if (inApp !== false) {
        const [ctx, caps] = await Promise.all([withTimeout(sdk.context, HOST_CHECK_MS), withTimeout(() => sdk.getCapabilities(), HOST_CHECK_MS)]);
        said('sdk.context', ctx);
        said('sdk.getCapabilities()', caps);
        if (ctx.ok) {
          platform = ctx.value?.client?.platformType ?? '';
          client = ctx.value?.client?.clientFid ? `client ${ctx.value.client.clientFid}` : '';
        }
        if (caps.ok) hasAction = caps.value.includes('actions.requestCameraAndMicrophoneAccess');
      }
      const recorder = typeof MediaRecorder !== 'undefined';
      setEnv({ inApp, platform, client, hasAction, ua: navigator.userAgent, recorder, types: recorder ? TYPES.filter((t) => MediaRecorder.isTypeSupported(t)) : [] });
    })();
  }, [admin]);

  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); if (take) URL.revokeObjectURL(take.url); }, [take]);

  if (!admin) return <>{fallback}</>;

  async function start() {
    setState('asking');
    setTake(null);
    setHelp(null);
    peak.current = 0;
    // Started, not awaited: nothing should come between the tap and the microphone request.
    const beforeP = micPermission();
    try {
      // In the app (or maybe in it), ask it for the microphone when it says it can, or when that's unknown and the
      // SDK has the action; with a time limit, then getUserMedia either way.
      const mayAsk = env?.inApp !== false && (env?.hasAction === true || (env?.hasAction === null && typeof sdk.actions?.requestCameraAndMicrophoneAccess === 'function'));
      if (mayAsk) {
        note(`asking the Farcaster app for the microphone${env?.hasAction === null ? ' (its capabilities are unknown)' : ''}`);
        const asked = await withTimeout(() => sdk.actions.requestCameraAndMicrophoneAccess(), HOST_PROMPT_MS);
        note(asked.ok ? 'the Farcaster app said yes' : asked.why === 'timeout' ? `the Farcaster app didn't answer in ${HOST_PROMPT_MS / 1000} s: trying the microphone anyway` : `the Farcaster app said no or failed (${asked.error}): trying the microphone anyway`);
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('navigator.mediaDevices.getUserMedia is missing');
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      stream.current = s;
      setPrompt({ before: await beforeP, after: await micPermission() });
      note(`microphone open: ${s.getAudioTracks()[0]?.label || 'unnamed'}`);
      // A level meter, so a silent stream (permission given but no sound) shows up.
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        if (!stream.current) { void ac.close(); return; }
        an.getByteTimeDomainData(buf);
        let m = 0;
        for (const v of buf) m = Math.max(m, Math.abs(v - 128));
        peak.current = Math.max(peak.current, m);
        setLevel(m / 128);
        requestAnimationFrame(tick);
      };
      tick();
      const type = env?.types[0];
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(parts, { type: r.mimeType || type || '' });
        const seconds = (performance.now() - started.current) / 1000;
        s.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setTake({ url: URL.createObjectURL(blob), type: blob.type, bytes: blob.size, seconds });
        note(`stopped: ${blob.size} bytes, ${blob.type || 'no type'}, peak level ${(peak.current / 128).toFixed(2)}`);
        setState(blob.size > 0 ? 'done' : 'failed');
      };
      r.onerror = (e) => { note(`recorder error: ${String((e as unknown as { error?: Error }).error ?? e)}`); setState('failed'); };
      rec.current = r;
      started.current = performance.now();
      r.start(1000);
      note(`recording as ${r.mimeType || 'default type'}`);
      setState('recording');
      setTimeout(() => { if (r.state === 'recording') r.stop(); }, LIMIT_S * 1000);
    } catch (e) {
      note(`failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
      setPrompt({ before: await beforeP, after: await micPermission() });
      if (e instanceof Error && e.name === 'NotAllowedError') setHelp(MIC_HELP[micPlace(navigator.userAgent, Boolean(env?.inApp))]);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setState('failed');
    }
  }

  // Farcaster's own docs: "Camera and microphone access is not supported in web mini apps. The action will always reject
  // on web platforms." (miniapps.farcaster.xyz, request-camera-and-microphone-access). Say so plainly, before Record.
  const webClient = Boolean(env?.inApp && env.platform === 'web');
  const where = !env ? '' : env.inApp ? `Farcaster app (${env.platform || 'unknown platform'}${env.client ? `, ${env.client}` : ''})` : env.inApp === null ? 'unknown host (no answer)' : 'browser';
  const shown = prompt ? promptShown(prompt.before, prompt.after) : null;
  const promptNote = prompt ? `; prompt shown: ${shown}${prompt.before ? ` (permission ${prompt.before} → ${prompt.after ?? 'unknown'})` : ' (the browser doesn\'t report it)'}` : '';
  const verdict =
    state === 'done' && take && peak.current > 4 ? 'PASS' : state === 'done' ? 'RECORDED BUT SILENT' : state === 'failed' ? 'FAIL' : '';
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.45 }}>
      <p style={{ textTransform: 'uppercase', fontSize: 12, letterSpacing: 1, opacity: 0.7 }}>Admin</p>
      <h1 style={{ fontSize: 24 }}>Microphone test</h1>
      <p>Records up to {LIMIT_S} seconds and plays it back. The recording stays in this tab: nothing is sent or kept.</p>
      {env && (
        <ul style={{ fontSize: 14 }}>
          <li>Where: {where}</li>
          {env.inApp !== false && <li>Host offers the microphone action: {env.hasAction === null ? 'unknown (no answer)' : env.hasAction ? 'yes' : 'no'}</li>}
          <li>MediaRecorder: {env.recorder ? 'yes' : 'no'}; formats: {env.types.join(', ') || 'none listed'}</li>
          <li style={{ wordBreak: 'break-all', opacity: 0.7 }}>{env.ua}</li>
        </ul>
      )}
      {webClient && (
        <p role="note" style={{ padding: 12, border: '2px solid #c60', borderRadius: 8 }}>
          Recording doesn&rsquo;t work in Farcaster on the web. Open this page in the Farcaster app on your phone, or in a
          browser at snowmoon.party/admin/mic-test.
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
        <button type="button" onClick={start} disabled={!env || state === 'asking' || state === 'recording'} style={{ padding: '12px 20px', fontSize: 16 }}>
          {webClient ? 'Try anyway' : state === 'idle' ? 'Record' : 'Record again'}
        </button>
        <button type="button" onClick={() => rec.current?.state === 'recording' && rec.current.stop()} disabled={state !== 'recording'} style={{ padding: '12px 20px', fontSize: 16 }}>
          Stop
        </button>
      </div>
      {state === 'recording' && (
        <div aria-label="Level" style={{ height: 10, background: '#ddd', borderRadius: 5 }}>
          <div style={{ width: `${Math.min(100, level * 300)}%`, height: 10, background: '#2a7', borderRadius: 5 }} />
        </div>
      )}
      {take && (
        <p>
          <audio controls src={take.url} style={{ width: '100%' }} />
        </p>
      )}
      {verdict && (
        <p style={{ fontWeight: 700, fontSize: 18 }}>
          {verdict}: {where}
          {take ? `, ${take.seconds.toFixed(1)} s, ${take.type || 'no type'}, ${(take.bytes / 1024).toFixed(0)} KB` : ''}
          {promptNote}
        </p>
      )}
      {help && (
        <p role="alert" style={{ padding: 12, border: '2px solid #c60', borderRadius: 8 }}>
          {help}
        </p>
      )}
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f4f4f4', padding: 8 }}>{log.join('\n')}</pre>
    </main>
  );
}
