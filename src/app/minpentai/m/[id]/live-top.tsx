'use client';

import { useEffect, useRef, useState } from 'react';
import { ViewBoard, type Ghost } from './view-board';
import { TakeTurn } from './take-turn';
import type { boardOut, turnFrames } from '~/lib/minpentai/agent-play/solo';

type Board = ReturnType<typeof boardOut>;
type Frame = ReturnType<typeof turnFrames>[number];
export interface Draft { placements: Ghost[]; cost: number; points: number; warnings: string[]; note?: string; who: string }

/**
 * The live page's top block (owner, 2026-11-03: "This turn" at the top, one screen with no scrolling): one board that
 * shows this turn with the AI's draft on it, and plays the turn just taken in place when a new turn arrives (no jump,
 * no scroll), then shows the new turn. Beside or under it: points and cost, lane warnings, Take turn, the replay's
 * controls, and the last turn's summary, compact with "more". The frames are the engine's, from the side's view only
 * (solo.ts turnFrames); nothing else about the board is passed in.
 */
export function LiveTop(p: {
  matchId: string; width: number; height: number; status: string; tally: string | null;
  current: { board: Board; canPlace: number[][]; lastSeen: { x: number; y: number }[]; marks: { x: number; y: number }[] };
  draft: Draft | null; canTake: boolean; turn: number; points: number;
  latest: { turn: number; frames: Frame[]; whole: boolean } | null;
  summary: string[] | null;
}) {
  const [mode, setMode] = useState<'current' | 'replay'>(p.latest?.whole ? 'replay' : 'current');
  const [i, setI] = useState(p.latest?.whole && p.latest ? p.latest.frames.length - 1 : 0);
  const [playing, setPlaying] = useState(false);
  // Started by itself after a new turn arrived: when it finishes, go back to this turn. Any step or pause by the person
  // cancels that (they're looking at the replay).
  const [auto, setAuto] = useState(false);
  const [more, setMore] = useState(false), [moreWarn, setMoreWarn] = useState(false);
  // A new turn arrived (this page took it, or the AI did while it was open): play it in place.
  const seen = useRef(p.latest?.turn ?? -1);
  useEffect(() => {
    const t = p.latest?.turn ?? -1;
    if (t > seen.current) { seen.current = t; setMode('replay'); setI(0); setPlaying(true); setAuto(true); setMore(false); }
  }, [p.latest?.turn]);
  const n = p.latest?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || mode !== 'replay') return;
    const id = window.setInterval(() => setI((k) => Math.min(k + 1, n - 1)), 450);
    return () => window.clearInterval(id);
  }, [playing, mode, n]);
  // At the last frame it stops; if it started by itself, the board shows the new turn (with the next draft when there is
  // one) a moment later.
  useEffect(() => {
    if (mode !== 'replay' || i < n - 1) return;
    if (playing) { setPlaying(false); return; }
    if (!auto || p.latest?.whole) return;
    const t = window.setTimeout(() => { setMode('current'); setAuto(false); }, 1200);
    return () => window.clearTimeout(t);
  }, [mode, i, n, playing, auto, p.latest?.whole]);

  const replaying = mode === 'replay' && p.latest && n;
  const f = replaying ? p.latest!.frames[Math.min(i, n - 1)] : null;
  const summary = p.summary ?? [];
  const warns = p.draft?.warnings ?? [];
  return (
    <section className="mb-top" aria-label="This turn">
      <div className="mb-top-board" style={{ ['--ar' as string]: p.width / p.height }}>
        <p className="mb-top-status">{p.status}{p.tally ? ` · ${p.tally}` : ''}</p>
        {f ? (
          <ViewBoard board={f.board} width={p.width} height={p.height} seen={p.latest!.whole ? null : (f.seen as [number, number][])} label={p.latest!.whole ? 'The whole board at this step' : 'Your side’s view at this step'} />
        ) : (
          <ViewBoard board={p.current.board} width={p.width} height={p.height} canPlace={p.current.canPlace} lastSeen={p.current.lastSeen} marks={p.current.marks} ghosts={p.draft?.placements ?? []} />
        )}
        <div className="mb-replay-controls mb-top-controls">
          {p.latest ? (
            <>
              <button type="button" aria-label="Step back" onClick={() => { setAuto(false); setMode('replay'); setPlaying(false); setI((k) => Math.max(0, k - 1)); }}>◀</button>
              <button type="button" onClick={() => {
                setAuto(false);
                if (mode !== 'replay') { setMode('replay'); setI(0); setPlaying(true); return; }
                if (i + 1 >= n) setI(0);
                setPlaying((x) => !x);
              }}>{mode === 'replay' && playing ? 'Pause' : `Replay turn ${p.latest.turn}`}</button>
              <button type="button" aria-label="Step forward" onClick={() => { setAuto(false); setMode('replay'); setPlaying(false); setI((k) => Math.min(n - 1, k + 1)); }}>▶</button>
              {mode === 'replay' && !p.latest.whole ? <button type="button" onClick={() => { setAuto(false); setPlaying(false); setMode('current'); }}>This turn</button> : null}
              {f ? <span className="mb-note">{`Step ${f.step}${i === 0 ? ' (placements appear)' : ''}${p.latest.whole ? ' · whole board' : ' · shaded: out of sight'}`}</span> : null}
            </>
          ) : <span className="mb-note">No turn played yet.</span>}
          {/* Room for the 2D/3D toggle (the 3D replay, to come). */}
          <span className="mb-viewtoggle" aria-hidden="true" />
        </div>
      </div>
      <div className="mb-top-side">
        {p.draft ? (
          <div className="mb-top-draft">
            <p><strong>{p.draft.who}</strong> drafted this turn: <strong>{`${p.draft.cost} of ${p.draft.points} points`}</strong>, faint on the board.</p>
            {warns.length ? (
              <ul className="mb-warnings">
                {(moreWarn ? warns : warns.slice(0, 1)).map((w, k) => <li key={k}>{w}</li>)}
                {warns.length > 1 ? <li className="mb-more"><button type="button" onClick={() => setMoreWarn((x) => !x)}>{moreWarn ? 'less' : `${warns.length - 1} more`}</button></li> : null}
              </ul>
            ) : null}
            {p.canTake ? <TakeTurn id={p.matchId} turn={p.turn} /> : null}
          </div>
        ) : p.canTake ? <p className="mb-note">No draft yet: {p.points} points to place. Ask your AI to draft this turn.</p> : null}
        {summary.length && p.latest ? (
          <div className="mb-top-summary">
            <p className="mb-note">Turn {p.latest.turn}, what your side saw:</p>
            <ul className="mb-moves">
              {(more ? summary : summary.slice(0, 2)).map((l, k) => <li key={k}>{l}</li>)}
            </ul>
            {summary.length > 2 ? <button type="button" className="mb-more" onClick={() => setMore((x) => !x)}>{more ? 'less' : `more (${summary.length - 2})`}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
