'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ViewBoard, type Ghost } from './view-board';
import { TakeTurn } from './take-turn';
import type { boardOut, turnFrames } from '~/lib/minpentai/agent-play/solo';

// The 3D replay's code (and three.js) loads only when a replay opens: this component mounts only then.
const Board3D = dynamic(() => import('./board-3d').then((m) => m.Board3D), { ssr: false });
const VIEW_KEY = 'snowmoon.replay.view';
/**
 * Whether 3D is offered (owner, 2026-11-03): only with WebGL, and never when the person has asked for reduced motion.
 * Wide screens show 2D and 3D side by side; phones show one, 3D by default where it holds the frame rate, and remember
 * the person's choice.
 */
function use3D() {
  const [can, setCan] = useState(false), [wide, setWide] = useState(false), [view, setView] = useState<'2d' | '3d'>('3d'), [chosen, setChosen] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let gl = false;
    try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { gl = false; }
    setCan(gl && !reduce);
    const mq = window.matchMedia('(min-width: 1100px)'), onWide = () => setWide(mq.matches);
    onWide(); mq.addEventListener('change', onWide);
    try { const v = localStorage.getItem(VIEW_KEY); if (v === '2d' || v === '3d') { setView(v); setChosen(true); } } catch { /* storage blocked */ }
    return () => mq.removeEventListener('change', onWide);
  }, []);
  const choose = (v: '2d' | '3d') => { setView(v); setChosen(true); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ } };
  return { can, wide, view, chosen, choose, setView };
}

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
  const prevFrame = replaying && i > 0 ? p.latest!.frames[Math.min(i, n - 1) - 1] : null;
  const d3 = use3D(), [d3note, setD3note] = useState<string | null>(null);
  // 3D only for a replay; on a wide screen beside the 2D board, on a phone in its place.
  const show3d = !!f && d3.can && d3.view === '3d', side3d = show3d && d3.wide;
  const summary = p.summary ?? [];
  const warns = p.draft?.warnings ?? [];
  return (
    <section className="mb-top" aria-label="This turn">
      <div className="mb-top-board" style={{ ['--ar' as string]: p.width / p.height }}>
        <p className="mb-top-status">{p.status}{p.tally ? ` · ${p.tally}` : ''}</p>
        {f ? (
          <div className={side3d ? 'mb-boards mb-boards-2' : 'mb-boards'}>
            {!show3d || side3d ? <ViewBoard board={f.board} width={p.width} height={p.height} seen={p.latest!.whole ? null : (f.seen as [number, number][])} label={p.latest!.whole ? 'The whole board at this step' : 'Your side’s view at this step'} /> : null}
            {show3d ? (
              <Board3D
                board={f.board} prev={prevFrame?.board ?? null} seen={p.latest!.whole ? null : (f.seen as [number, number][])} width={p.width} height={p.height} stepMs={450}
                onFps={(fps) => { if (!d3.wide && !d3.chosen && fps < 50) { d3.setView('2d'); setD3note('Switched to 2D to keep it smooth. Tap 3D to try again.'); } }}
                onFail={() => { d3.setView('2d'); setD3note('3D didn’t start here, so this is 2D.'); }}
              />
            ) : null}
          </div>
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
          <span className="mb-viewtoggle">
            {d3.can ? (
              <span role="group" aria-label="Replay view">
                <button type="button" aria-pressed={d3.view === '2d'} onClick={() => { d3.choose('2d'); setD3note(null); }}>2D</button>
                <button type="button" aria-pressed={d3.view === '3d'} onClick={() => { d3.choose('3d'); setD3note(null); }}>3D</button>
              </span>
            ) : null}
          </span>
        </div>
        {d3note ? <p className="mb-note" role="status">{d3note}</p> : null}
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
