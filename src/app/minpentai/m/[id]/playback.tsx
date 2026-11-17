'use client';

import { useEffect, useState } from 'react';
import type { turnFrames } from '~/lib/minpentai/agent-play/solo';

type Frame = ReturnType<typeof turnFrames>[number];
export const STEP_MS = 450;

/**
 * One playback of a turn's frames, the same in 2D and 3D and wherever it plays (owner, 2026-11-03: Skip and 2x speed on
 * every playback): play, pause, a step at a time, 2x, Skip. When it reaches the end by itself, or on Skip, `onDone` a
 * moment later (Skip: at once).
 */
export function usePlayback(frames: Frame[], onDone: (how: 'end' | 'skip') => void, autoStart = true) {
  const n = frames.length;
  const [i, setI] = useState(0), [playing, setPlaying] = useState(autoStart), [fast, setFast] = useState(false), [done, setDone] = useState(false);
  const stepMs = fast ? STEP_MS / 2 : STEP_MS;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setI((k) => Math.min(k + 1, n - 1)), stepMs);
    return () => window.clearInterval(id);
  }, [playing, n, stepMs]);
  useEffect(() => {
    if (!n || i < n - 1 || !playing) return;
    setPlaying(false); setDone(true);
  }, [i, n, playing]);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => onDone('end'), 1200);
    return () => window.clearTimeout(t);
  }, [done, onDone]);
  const f = n ? frames[Math.min(i, n - 1)] : null, prev = n && i > 0 ? frames[Math.min(i, n - 1) - 1] : null;
  return {
    i, n, f, prev, playing, fast, stepMs,
    toggle: () => { setDone(false); if (i + 1 >= n) setI(0); setPlaying((x) => !x); },
    back: () => { setDone(false); setPlaying(false); setI((k) => Math.max(0, k - 1)); },
    forward: () => { setDone(false); setPlaying(false); setI((k) => Math.min(n - 1, k + 1)); },
    setFast,
    skip: () => { setPlaying(false); setDone(false); setI(n - 1); onDone('skip'); },
    /** From the first frame, playing. */
    restart: () => { setDone(false); setI(0); setPlaying(true); },
  };
}

export type Playback = ReturnType<typeof usePlayback>;

export function PlaybackControls({ p, whole, label }: { p: Playback; whole: boolean; label?: string }) {
  if (!p.f) return null;
  return (
    <>
      <button type="button" aria-label="Step back" onClick={p.back}>◀</button>
      <button type="button" onClick={p.toggle}>{p.playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Step forward" onClick={p.forward}>▶</button>
      <button type="button" aria-pressed={p.fast} className="mb-speed" onClick={() => p.setFast((x) => !x)}>2x</button>
      <button type="button" onClick={p.skip}>Skip</button>
      <span className="mb-note">{`${label ? `${label} · ` : ''}step ${p.f.step}${p.i === 0 ? ' (placements appear)' : ''}${whole ? ' · whole board' : ''}`}</span>
    </>
  );
}
