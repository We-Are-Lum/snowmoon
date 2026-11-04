'use client';

import { useState } from 'react';
import { Replay } from './replay';
import type { turnFrames } from '~/lib/minpentai/agent-play/solo';

type Frame = ReturnType<typeof turnFrames>[number];
export interface PastTurn { turn: number; step: number; line: string; kills: number; who: string; summary: string[] }

/**
 * Past turns, newest first, one line each (owner, 2026-11-03): the turn, what you placed, and towers destroyed. A tap
 * opens its replay (fetched then, from the same frames the page shows: the side's view, or the whole board once the
 * match is over) and its summary. The five newest show; "Show earlier turns" for the rest.
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
                <span className="mb-past-kills">{x.kills ? `${x.kills} destroyed` : ''}</span>
              </button>
              {open === x.turn ? (
                <div className="mb-past-body">
                  <p className="mb-note">Step {x.step}, chosen by {x.who}.</p>
                  {fr === 'loading' || !fr ? <p className="mb-note">Loading the replay…</p> : fr === 'error' ? <p className="mb-note">The replay didn’t load. Tap the turn again.</p> : <Replay key={x.turn} frames={fr} width={width} height={height} whole={whole} summary={x.summary} />}
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
