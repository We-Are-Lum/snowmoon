'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReplays } from './use-replays';
import { ViewBoard, type Ghost } from './view-board';
import { TakeTurn } from './take-turn';
import { PlaybackControls, usePlayback } from './playback';
import { use3D } from './use-3d';
import type { boardOut, turnFrames } from '~/lib/minpentai/agent-play/solo';

// three.js and the 3D scene load only where the 3D view shows: beside the board on a wide screen, or when the action
// plays in 3D on a phone.
const Board3D = dynamic(() => import('./board-3d').then((m) => m.Board3D), { ssr: false });

type Board = ReturnType<typeof boardOut>;
type Frame = ReturnType<typeof turnFrames>[number];
export interface Draft { placements: Ghost[]; cost: number; points: number; warnings: string[]; note?: string; who: string }

/**
 * The live page's top block: one screen with no scrolling (owner, 2026-11-03), and "2D is for thinking; 3D is for the
 * action". The 2D board is always the board you plan on: this turn, with the AI's draft on it. Wide screens keep the
 * 3D view beside it the whole time; when a turn plays, its action plays there. Phones have one board: with "Animate
 * action in 3D" on (the default), the action plays in 3D in the board's place, then the 2D board returns; off, it plays
 * in 2D. Watch again, in 2D or 3D. Every playback has Skip and 2x. Without WebGL, with reduced motion, or where 3D
 * can't hold the frame target, everything is 2D. The frames are the engine's, from the side's view only (solo.ts
 * turnFrames); the 2D and the 3D board are given the same frame, nothing else about the board.
 */
export function LiveTop(p: {
  matchId: string; width: number; height: number; status: string; tally: string | null;
  current: { board: Board; seen: [number, number][]; canPlace: number[][]; lastSeen: { x: number; y: number }[]; marks: { x: number; y: number }[] };
  draft: Draft | null; canTake: boolean; turn: number; points: number;
  latest: { turn: number; frames: Frame[]; whole: boolean } | null;
  summary: string[] | null;
  /** Up to 3 big moments of the last turn (kills, losses, enemy towers spotted, symbols formed), shown first. */
  big: string[];
  /** While the match goes on after kills: where the enemy's towers are, as far as this side knows. */
  still: string | null;
}) {
  const d3 = use3D(), [note, setNote] = useState<string | null>(null);
  const frames = p.latest?.frames ?? [], whole = !!p.latest?.whole;
  // The action playing now, and where: '3d' in the 3D view, '2d' in the 2D board's place.
  const [play, setPlay] = useState<'2d' | '3d' | null>(null);
  // Instant replays (owner, 2026-11-04): after a 3D playback that reached its end, this turn's moments in sight.
  const r = useReplays(frames, { whole, ended: whole, size: [p.width, p.height], setting: d3.replays, onFinish: () => setPlay(null) });
  const playRef = useRef(play);
  playRef.current = play;
  const done = useCallback((how: 'end' | 'skip') => {
    if (how === 'end' && playRef.current === '3d' && r.begin()) return;
    setPlay(null);
  }, [r.begin]);
  const pb = usePlayback(frames, done, false);
  const start = (view: '2d' | '3d') => { r.cancel(); setPlay(view); pb.restart(); };
  const [more, setMore] = useState(false), [moreWarn, setMoreWarn] = useState(false);
  // A new turn arrived (this page took it, or the AI did while it was open): play its action.
  const seenTurn = useRef(p.latest?.turn ?? -1);
  useEffect(() => {
    const t = p.latest?.turn ?? -1;
    if (t > seenTurn.current) { seenTurn.current = t; setMore(false); start(d3.on && (d3.wide || d3.animate) ? '3d' : '2d'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.latest?.turn]);
  // 3D couldn't keep up, or didn't start: the action carries on in 2D from the same step.
  const off3d = (why: string) => { d3.markSlow(); setNote(why); setPlay((v) => (v === '3d' ? '2d' : v)); };

  const f = play ? pb.f : null;
  const last = frames.at(-1);
  // When nothing plays: the 2D board is this turn's plan (or the whole board once it's over); the 3D view shows the board
  // as it stands, from the same view.
  const idle = whole && last ? { board: last.board, seen: null } : { board: p.current.board, seen: p.current.seen };
  const v3 = r.frame ? r.frame
    : play === '3d' && f ? { board: f.board, prev: pb.prev?.board ?? null, seen: whole ? null : (f.seen as [number, number][]), stepMs: pb.stepMs }
    : { board: idle.board, prev: null, seen: idle.seen, stepMs: 0 };
  const beside = d3.on && d3.wide;
  const show3d = beside || (play === '3d' && d3.on);
  const summary = p.summary ?? [];
  const warns = p.draft?.warnings ?? [];
  return (
    <section className="mb-top" aria-label="This turn">
      <div className="mb-top-board" style={{ ['--ar' as string]: p.width / p.height }}>
        <p className="mb-top-status">{p.status}{p.tally ? ` · ${p.tally}` : ''}</p>
        <div className={beside ? 'mb-boards mb-boards-2' : 'mb-boards'}>
          {beside || play !== '3d' ? (
            play === '2d' && f ? (
              <ViewBoard board={f.board} width={p.width} height={p.height} seen={whole ? null : (f.seen as [number, number][])} label={whole ? 'The whole board at this step' : 'Your side’s view at this step'} />
            ) : whole && last ? (
              <ViewBoard board={last.board} width={p.width} height={p.height} seen={null} label="The whole board at the end" />
            ) : (
              <ViewBoard board={p.current.board} width={p.width} height={p.height} canPlace={p.current.canPlace} lastSeen={p.current.lastSeen} marks={p.current.marks} ghosts={p.draft?.placements ?? []} />
            )
          ) : null}
          {show3d ? (
            <div className="mb-board3d-wrap">
              <Board3D {...v3} width={p.width} height={p.height} focus={r.focus} big={beside}
                onSlow={() => { r.cancel(); off3d('3D couldn’t keep up on this device, so the action plays in 2D.'); }}
                onFail={() => { r.cancel(); off3d('3D didn’t start here, so the action plays in 2D.'); }}
              />
              {r.on ? <button type="button" className="mb-instant" onClick={r.end} aria-label="Skip the instant replay"><span>Instant replay · tap to skip</span></button> : null}
            </div>
          ) : null}
        </div>
        <div className="mb-replay-controls mb-top-controls">
          {r.on ? (
            <>
              <span className="mb-note">{`Instant replay${r.count > 1 ? ` ${r.k + 1} of ${r.count}` : ''}`}</span>
              <button type="button" onClick={r.end}>Skip</button>
            </>
          ) : play && f ? <PlaybackControls p={pb} whole={whole} label={`Turn ${p.latest!.turn}${play === '3d' ? ', 3D' : ''}`} />
            : p.latest ? (
              <>
                <span className="mb-note">Watch turn {p.latest.turn} again</span>
                <button type="button" aria-label={`Watch turn ${p.latest.turn} again in 2D`} onClick={() => start('2d')}>2D</button>
                {d3.on ? <button type="button" aria-label={`Watch turn ${p.latest.turn} again in 3D`} onClick={() => start('3d')}>3D</button> : null}
              </>
            ) : <span className="mb-note">No turn played yet.</span>}
          {d3.can && !d3.wide ? (
            <label className="mb-animate"><input type="checkbox" checked={d3.animate} onChange={(e) => d3.setAnimate(e.target.checked)} /> Animate action in 3D</label>
          ) : null}
          {d3.on ? (
            <label className="mb-animate">Instant replays <select value={d3.replays} onChange={(e) => d3.setReplays(e.target.value as 'all' | 'big' | 'off')}><option value="all">all</option><option value="big">big moments</option><option value="off">off</option></select></label>
          ) : null}
        </div>
        {note ? <p className="mb-note" role="status">{note}</p> : null}
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
            {/* The turn's big moments first (owner, 2026-11-04), then the whole summary under "more". */}
            {p.big.length ? <ul className="mb-moves mb-big">{p.big.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}
            {more || !p.big.length ? (
              <ul className="mb-moves">
                {(more ? summary : summary.slice(0, 2)).map((l, k) => <li key={k}>{l}</li>)}
              </ul>
            ) : null}
            {p.still ? <p className="mb-note mb-still">{p.still}</p> : null}
            {summary.length > (p.big.length ? 0 : 2) ? <button type="button" className="mb-more" onClick={() => setMore((x) => !x)}>{more ? 'less' : p.big.length ? `the whole turn (${summary.length} lines)` : `more (${summary.length - 2})`}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
