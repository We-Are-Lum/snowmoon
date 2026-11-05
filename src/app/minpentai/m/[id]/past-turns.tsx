'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import { ViewBoard } from './view-board';
import { PlaybackControls, usePlayback } from './playback';
import { use3D } from './use-3d';
import { useReplays } from './use-replays';
import type { turnFrames } from '~/lib/minpentai/agent-play/solo';

const Board3D = dynamic(() => import('./board-3d').then((m) => m.Board3D), { ssr: false });

type Frame = ReturnType<typeof turnFrames>[number];
export interface PastTurn { turn: number; step: number; line: string; kills: number; lost: number; who: string; summary: string[] }

/**
 * Past turns, newest first, one line each (owner, 2026-11-03): the turn, what you placed, and towers destroyed. A tap
 * opens its summary and Watch, in 2D or 3D (owner, 2026-11-03; in 3D with its instant replays, 2026-11-04), from the frames fetched then: the same frames the page
 * shows, the side's view, or the whole board once the match is over. The five newest show; "Show earlier turns" for the
 * rest.
 */
export function PastTurns({ matchId, secret, width, height, whole, items }: { matchId: string; secret: string; width: number; height: number; whole: boolean; items: PastTurn[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [frames, setFrames] = useState<Record<number, Frame[] | 'loading' | 'error'>>({});
  const [all, setAll] = useState(false);
  const toggle = async (t: number) => {
    if (open === t) { setOpen(null); return; }
    setOpen(t);
    if (frames[t] && frames[t] !== 'error') return;
    setFrames((f) => ({ ...f, [t]: 'loading' }));
    const r = await fetch(`/api/minpentai/m/${matchId}/turn?k=${encodeURIComponent(secret)}&t=${t}`, { cache: 'no-store' }).catch(() => null);
    const b = r && r.ok ? ((await r.json()) as { frames: Frame[] }) : null;
    setFrames((f) => ({ ...f, [t]: b ? b.frames : 'error' }));
  };
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 5);
  return (
    <section className="mb-past" aria-label="Past turns">
      <h2>Past turns</h2>
      <ul className="mb-past-list">
        {shown.map((x) => {
          const fr = frames[x.turn];
          return (
            <li key={x.turn} className={open === x.turn ? 'is-open' : undefined}>
              <button type="button" className="mb-past-row" aria-expanded={open === x.turn} onClick={() => toggle(x.turn)}>
                <span className="mb-past-turn">Turn {x.turn}</span>
                <span className="mb-past-line">{x.line}</span>
                <span className="mb-past-kills">{[x.kills ? `${x.kills} destroyed` : '', x.lost ? `lost ${x.lost}` : ''].filter(Boolean).join(' · ')}</span>
              </button>
              {open === x.turn ? (
                <div className="mb-past-body">
                  <p className="mb-note">Step {x.step}, chosen by {x.who}.</p>
                  {fr === 'loading' || !fr ? <p className="mb-note">Loading the replay…</p> : fr === 'error' ? <p className="mb-note">The replay didn’t load. Tap the turn again.</p> : <Watch key={x.turn} turn={x.turn} frames={fr} width={width} height={height} whole={whole} summary={x.summary} />}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!all && items.length > 5 ? <button type="button" className="mb-more" onClick={() => setAll(true)}>Show earlier turns ({items.length - 5})</button> : null}
    </section>
  );
}

/** A past turn's summary, and its action played on request, in 2D or 3D, with the same controls as at the top. */
function Watch({ turn, frames, width, height, whole, summary }: { turn: number; frames: Frame[]; width: number; height: number; whole: boolean; summary: string[] }) {
  const d3 = use3D(), [view, setView] = useState<'2d' | '3d' | null>(null), [note, setNote] = useState<string | null>(null);
  // In 3D, played to its end, then its instant replays (skippable), as on the live page.
  const r = useReplays(frames, { whole, ended: false, size: [width, height], setting: d3.replays, onFinish: () => setView(null) });
  const viewRef = useRef(view);
  viewRef.current = view;
  const done = useCallback((how: 'end' | 'skip') => { if (how === 'end' && viewRef.current === '3d' && r.begin()) return; setView(null); }, [r.begin]);
  const pb = usePlayback(frames, done, false);
  const start = (v: '2d' | '3d') => { r.cancel(); setView(v); pb.restart(); };
  const f = view ? pb.f : null;
  const off3d = (why: string) => { r.cancel(); d3.markSlow(); setNote(why); setView((v) => (v === '3d' ? '2d' : v)); };
  const v3 = r.frame ? r.frame : f ? { board: f.board, prev: pb.prev?.board ?? null, seen: whole ? null : (f.seen as [number, number][]), stepMs: pb.stepMs } : null;
  return (
    <div className="mb-replay">
      {v3 && view === '3d' && d3.on ? (
        <div className="mb-board3d-wrap">
          <Board3D {...v3} width={width} height={height} focus={r.focus}
            onSlow={() => off3d('3D couldn’t keep up on this device, so this plays in 2D.')} onFail={() => off3d('3D didn’t start here, so this plays in 2D.')} />
          {r.on ? <button type="button" className="mb-instant" onClick={r.end} aria-label="Skip the instant replay"><span>Instant replay · tap to skip</span></button> : null}
        </div>
      ) : f ? (
        <ViewBoard board={f.board} width={width} height={height} seen={whole ? null : (f.seen as [number, number][])} label={whole ? 'The whole board at this step' : 'Your side’s view at this step'} />
      ) : null}
      <div className="mb-replay-controls">
        {r.on ? (
          <>
            <span className="mb-note">{`Instant replay${r.count > 1 ? ` ${r.k + 1} of ${r.count}` : ''}`}</span>
            <button type="button" onClick={r.end}>Skip</button>
          </>
        ) : f ? <PlaybackControls p={pb} whole={whole} label={`Turn ${turn}${view === '3d' ? ', 3D' : ''}`} /> : (
          <>
            <span className="mb-note">Watch turn {turn}</span>
            <button type="button" aria-label={`Watch turn ${turn} in 2D`} onClick={() => start('2d')}>2D</button>
            {d3.on ? <button type="button" aria-label={`Watch turn ${turn} in 3D`} onClick={() => start('3d')}>3D</button> : null}
          </>
        )}
      </div>
      {note ? <p className="mb-note" role="status">{note}</p> : null}
      {summary.length ? <ul className="mb-moves">{summary.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}
    </div>
  );
}
