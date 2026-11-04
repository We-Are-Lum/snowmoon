'use client';

import { useEffect, useRef } from 'react';
import type { ReplayScene } from './replay-scene';
import type { boardOut } from '~/lib/minpentai/agent-play/solo';

type Board = ReturnType<typeof boardOut>;

/**
 * The 3D replay's view (replay-scene.ts): given exactly what the 2D board is given for the same frame (the board in the
 * side's view, the squares it sees, and the frame before it), never more. three.js and the scene load only when this
 * mounts, that is, when a replay opens. Reports its frame rate once it has two seconds of it, and any failure, so the
 * page can fall back to 2D.
 */
export function Board3D({ board, seen, prev, width, height, stepMs, onFps, onFail }: {
  board: Board; seen: [number, number][] | null; prev: Board | null; width: number; height: number; stepMs: number;
  onFps?: (fps: number) => void; onFail?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null), scene = useRef<ReplayScene | null>(null), latest = useRef({ board, seen, prev, stepMs });
  latest.current = { board, seen, prev, stepMs };
  useEffect(() => {
    let alive = true, timer = 0;
    void Promise.all([import('three'), import('./replay-scene')]).then(([THREE, m]) => {
      if (!alive || !el.current) return;
      try {
        scene.current = m.buildReplayScene(THREE, el.current, width, height);
        const l = latest.current;
        scene.current.show(l.board, l.seen, l.prev, l.stepMs);
        timer = window.setTimeout(() => { const f = scene.current?.fps(); if (f) onFps?.(f); }, 2600);
      } catch { onFail?.(); }
    }, () => onFail?.());
    return () => { alive = false; window.clearTimeout(timer); scene.current?.dispose(); scene.current = null; };
    // Built once per board size; frames are shown below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);
  useEffect(() => { scene.current?.show(board, seen, prev, stepMs); }, [board, seen, prev, stepMs]);
  return <div ref={el} className="mb-board3d" style={{ aspectRatio: `${width} / ${height}` }} role="img" aria-label={seen ? 'Your side’s view at this step, in 3D: the cloud covers what you can’t see' : 'The whole board at this step, in 3D'} />;
}
