'use client';

import { useEffect, useRef } from 'react';
import type { ReplayScene } from './replay-scene';
import type { Moment } from './replay-events';
import type { boardOut } from '~/lib/minpentai/agent-play/solo';

type Board = ReturnType<typeof boardOut>;
/** The frame target: below it at the low quality level, the action plays in 2D instead. */
export const FPS_TARGET = 50;

/**
 * The 3D view (replay-scene.ts): given exactly what the 2D board is given for the same frame (the board in the side's
 * view, the squares it sees, and the frame before it), never more. three.js and the scene load only when this mounts.
 * It holds the frame target by stepping down: after 1.5 s below it, the low quality level (no shadows, pixel ratio 1,
 * fewer bits of debris); after another 1.5 s still below it, `onSlow`, and the page plays the action in 2D.
 */
export function Board3D({ board, seen, prev, width, height, stepMs, focus = null, big = false, onSlow, onFail }: {
  board: Board; seen: [number, number][] | null; prev: Board | null; width: number; height: number; stepMs: number;
  /** An instant replay's camera, on a square replay-events found in sight. */
  focus?: { at: [number, number]; mode: Moment['mode']; ms: number } | null;
  /** Larger pieces (a wide screen, where the board is small beside the 2D one). */
  big?: boolean;
  onSlow?: () => void; onFail?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null), scene = useRef<ReplayScene | null>(null), latest = useRef({ board, seen, prev, stepMs });
  latest.current = { board, seen, prev, stepMs };
  const cb = useRef({ onSlow, onFail });
  cb.current = { onSlow, onFail };
  useEffect(() => {
    let alive = true, timer = 0, level: 'high' | 'low' = 'high';
    const check = () => {
      const s = scene.current;
      if (!alive || !s) return;
      const { fps, seconds } = s.fps();
      if (seconds >= 1.5 && fps > 0) {
        if (fps < FPS_TARGET && level === 'high') { level = 'low'; s.setQuality('low'); s.resetFps(); }
        else if (fps < FPS_TARGET - 5 && level === 'low') { cb.current.onSlow?.(); return; }
        else if (seconds >= 3) return; // holding it
      }
      timer = window.setTimeout(check, 500);
    };
    void Promise.all([import('three'), import('./replay-scene')]).then(([THREE, m]) => {
      if (!alive || !el.current) return;
      try {
        scene.current = m.buildReplayScene(THREE, el.current, width, height, 'high', big ? 1.3 : 1);
        const l = latest.current;
        scene.current.show(l.board, l.seen, l.prev, l.stepMs);
        timer = window.setTimeout(check, 500);
      } catch { cb.current.onFail?.(); }
    }, () => cb.current.onFail?.());
    return () => { alive = false; window.clearTimeout(timer); scene.current?.dispose(); scene.current = null; };
    // Built once per board size; frames are shown below.
  }, [width, height, big]);
  useEffect(() => { scene.current?.show(board, seen, prev, stepMs); }, [board, seen, prev, stepMs]);
  const fk = focus ? `${focus.at}|${focus.mode}|${focus.ms}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.focus(focus); }, [fk]);
  return <div ref={el} className="mb-board3d" style={{ aspectRatio: `${width} / ${height}` }} role="img" aria-label={seen ? 'The action in 3D, from your side: the cloud covers what you can’t see' : 'The whole board in 3D'} />;
}
