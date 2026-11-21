'use client';

import { useEffect, useRef, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { inMiniApp, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { MIC_HELP, micPermission, micPlace, promptShown } from '~/lib/mic-help';

/**
 * The microphone go/no-go (Nate, 2026-11-19). Asks for the microphone (inside a Farcaster app through
 * sdk.actions.requestCameraAndMicrophoneAccess when the host offers it), records up to 20 seconds with MediaRecorder and
 * plays it back from memory. Nothing is sent anywhere or kept: the recording is a Blob in this tab, dropped on reload.
 * The summary line at the end is what to screenshot.
 */
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus', 'audio/wav'];
const LIMIT_S = 20;

type Env = { inApp: boolean; platform: string; client: string; hasAction: boolean | null; ua: string; recorder: boolean; types: string[] };

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
      const inApp = await inMiniApp();
      let platform = '';
      let client = '';
      let hasAction: boolean | null = null;
      if (inApp) {
        const ctx = await sdk.context.catch(() => null);
        platform = ctx?.client?.platformType ?? '';
        client = ctx?.client?.clientFid ? `client ${ctx.client.clientFid}` : '';
        const caps = await sdk.getCapabilities().catch(() => [] as string[]);
        hasAction = caps.includes('actions.requestCameraAndMicrophoneAccess');
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
      if (env?.inApp && env.hasAction) {
        note('asking the Farcaster app for the microphone');
        await sdk.actions.requestCameraAndMicrophoneAccess();
        note('the Farcaster app said yes');
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
  const where = !env ? '' : env.inApp ? `Farcaster app (${env.platform || 'unknown platform'}${env.client ? `, ${env.client}` : ''})` : 'browser';
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
          {env.inApp && <li>Host offers the microphone action: {env.hasAction ? 'yes' : 'no'}</li>}
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
