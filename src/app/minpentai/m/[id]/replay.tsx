'use client';

import { useEffect, useState } from 'react';
import { ViewBoard } from './view-board';
import type { turnFrames } from '~/lib/minpentai/agent-play/solo';

type Frame = ReturnType<typeof turnFrames>[number];

/**
 * A turn's steps, played back (owner, 2026-11-03): the frames come from the engine (solo.ts turnFrames), your side's
 * view at each step while the match is on, the whole board once it's over. Play, pause, a step at a time.
 */
export function Replay({ frames, width, height, summary, whole }: { frames: Frame[]; width: number; height: number; summary?: string[]; whole: boolean }) {
  const [i, setI] = useState(0), [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setI((n) => (n + 1 < frames.length ? n + 1 : (setPlaying(false), n))), 450);
    return () => window.clearInterval(t);
  }, [playing, frames.length]);
  if (!frames.length) return null;
  const f = frames[Math.min(i, frames.length - 1)];
  return (
    <div className="mb-replay">
      <div className="mb-replay-board">
        <ViewBoard board={f.board} width={width} height={height} seen={whole ? null : (f.seen as [number, number][])} label={whole ? 'The whole board at this step' : 'Your side\'s view at this step'} />
        <div className="mb-replay-controls">
          <button type="button" onClick={() => { setPlaying(false); setI((n) => Math.max(0, n - 1)); }} aria-label="Step back">◀</button>
          <button type="button" onClick={() => { if (i + 1 >= frames.length) setI(0); setPlaying((p) => !p); }}>{playing ? 'Pause' : 'Play'}</button>
          <button type="button" onClick={() => { setPlaying(false); setI((n) => Math.min(frames.length - 1, n + 1)); }} aria-label="Step forward">▶</button>
          <span className="mb-note"> Step {f.step}{i === 0 ? ' (the placements appear)' : ''} · {i} of {frames.length - 1}{whole ? ' · whole board' : ' · shaded: out of your sight'}</span>
        </div>
      </div>
      {summary?.length ? <ul className="mb-moves mb-replay-summary">{summary.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}
    </div>
  );
}
