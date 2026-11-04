'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { instantReplays, type Moment } from './replay-events';
import type { Replays } from './use-3d';
import type { turnFrames } from '~/lib/minpentai/agent-play/solo';

type Frame = ReturnType<typeof turnFrames>[number];

/**
 * Instant replays after a 3D playback that reached its end (owner, 2026-11-04): a turn's action on the live page, and
 * Watch again in 3D, for the latest turn and past turns. Its moments in sight (replay-events.ts instantReplays, from the
 * same frames), each a few frames around it, slower, the camera on it. `begin` starts them (false if there are none
 * or the setting is off); `end` stops them (tap to skip) and calls `onFinish`. `frame` is the frame to show while they
 * play, `focus` the camera's.
 */
export function useReplays(frames: Frame[], o: { whole: boolean; ended: boolean; size: [number, number]; setting: Replays; onFinish: () => void }) {
  const [rep, setRep] = useState<{ list: Moment[]; k: number; j: number } | null>(null);
  const now = useRef(o);
  now.current = o;
  const begin = useCallback(() => {
    const c = now.current;
    if (c.setting === 'off') return false;
    const list = instantReplays(frames.map((x) => ({ board: x.board, seen: c.whole ? null : (x.seen as [number, number][]) })), c.size, { ended: c.ended, only: c.setting === 'big' ? 'big' : undefined });
    if (!list.length) return false;
    setRep({ list, k: 0, j: list[0].from });
    return true;
  }, [frames]);
  const end = useCallback(() => { setRep(null); now.current.onFinish(); }, []);
  useEffect(() => {
    if (!rep) return;
    const m = rep.list[rep.k];
    const t = window.setTimeout(() => {
      if (rep.j < m.to) setRep({ ...rep, j: rep.j + 1 });
      else if (rep.k + 1 < rep.list.length) setRep({ list: rep.list, k: rep.k + 1, j: rep.list[rep.k + 1].from });
      else end();
    }, rep.j < m.to ? m.stepMs : m.stepMs + m.holdMs);
    return () => window.clearTimeout(t);
  }, [rep, end]);
  const m = rep ? rep.list[rep.k] : null, rf = rep ? frames[rep.j] : null, rprev = rep && rep.j > 0 ? frames[rep.j - 1] : null;
  const frame = m && rf ? { board: rf.board, prev: rprev?.board ?? null, seen: o.whole ? null : (rf.seen as [number, number][]), stepMs: m.stepMs } : null;
  const focus = m ? { at: m.at, mode: m.mode, ms: (m.to - m.from + 1) * m.stepMs + m.holdMs } : null;
  return { on: !!rep, k: rep?.k ?? 0, count: rep?.list.length ?? 0, begin, end, cancel: () => setRep(null), frame, focus };
}
