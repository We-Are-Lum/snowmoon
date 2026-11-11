'use client';

import { useCallback } from 'react';
import { ViewBoard } from '../../m/[id]/view-board';
import { PlaybackControls, usePlayback } from '../../m/[id]/playback';
import type { turnFrames } from '~/lib/minpentai/agent-play/solo';

type Frame = ReturnType<typeof turnFrames>[number];

/**
 * A finished practice match's turn, played back on the whole board (the record is public once it ends), with the live
 * page's playback controls (playback.tsx). Replaces the old Replay component, which #107 folded into the live page.
 */
export function RecordReplay({ frames, width, height }: { frames: Frame[]; width: number; height: number }) {
  const done = useCallback(() => {}, []);
  const p = usePlayback(frames, done);
  if (!p.f) return null;
  return (
    <div className="mb-replay">
      <div className="mb-replay-board">
        <ViewBoard board={p.f.board} width={width} height={height} label="The whole board at this step" />
        <div className="mb-replay-controls"><PlaybackControls p={p} whole /></div>
      </div>
    </div>
  );
}
