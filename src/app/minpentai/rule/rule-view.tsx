'use client';

/**
 * /minpentai/rule: the rule recovered from the book's figure (c4-b5, "rotate one eighty if three", c4-b7),
 * on src/lib/minpentai/engine.ts, opening on the figure's first frame (c4b5Preset). Shows the figure's
 * 24 × 16 squares, the top-left of the 48 × 32 board; the board beyond the figure's right edge is the
 * invented reconstruction (presets.ts) that lets those squares replay all 120 of the figure's frames.
 * Like the figure, it loops after 120 turns. Nothing plays until asked.
 *
 * Kept from the sandbox (src/app/minpentai/sandbox.tsx, out of the menus since 2026-10-09): the engine,
 * the preset and the colours. The words are in learn-text.ts (rulePage, board, rule), checked by P8c/P8d.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { step, stepBack, type Board } from '~/lib/minpentai/engine';
import { c4b5Preset } from '~/lib/minpentai/presets';
import { FIGURE_H, FIGURE_W } from '~/lib/minpentai/figure';
import { LEARN_TEXT as T } from '~/lib/minpentai/learn-text';

/** The figure's frames: 120, one every 0.1 s (its animation runs 12 s and repeats). */
const FRAMES = 120;
const FPS = 10;
/* The sandbox's colours (docs/design/direction-boards, section 1c). */
const FIELD = '#060608';
const CELL_BG = '#0E0F13';
const GRID = '#16171C';
const LIVE = '#46D7E8';

export function RuleView({ github }: { github: string }) {
  const [board, setBoard] = useState<Board>(c4b5Preset);
  const [playing, setPlaying] = useState(false);
  const [src, setSrc] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setBoard((b) => (b.turn + 1 >= FRAMES ? c4b5Preset() : step(b))), 1000 / FPS);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const S = 26; // a square, as on Learn's board
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < FIGURE_H; y++) {
      for (let x = 0; x < FIGURE_W; x++) {
        const X = x * S, Y = y * S;
        ctx.fillStyle = CELL_BG;
        ctx.fillRect(X, Y, S, S);
        ctx.fillStyle = GRID;
        ctx.fillRect(X, Y, S, 1);
        ctx.fillRect(X, Y, 1, S);
        if (board.cells[y * board.w + x]) {
          ctx.fillStyle = LIVE;
          ctx.fillRect(X + 4, Y + 4, S - 8, S - 8);
        }
      }
    }
  }, [board]);

  const live = (() => { let n = 0; for (let y = 0; y < FIGURE_H; y++) for (let x = 0; x < FIGURE_W; x++) n += board.cells[y * board.w + x]; return n; })();
  const strip = T.board.stripCells(board.turn, live);
  const R = T.rulePage;
  const tagClass = (k: string) => (k === 'book' ? 'ml-tag ml-tag-solid' : k === 'draft' ? 'ml-tag ml-tag-draft' : 'ml-tag ml-tag-dashed');

  return (
    <article className="mr" aria-labelledby="mr-title">
      <Link href="/minpentai" className="mr-back">{R.back}</Link>
      <div className="ml-tags">
        {R.tags.map((k) => <span key={k} className={tagClass(k)}>{T.tags[k]}</span>)}
      </div>
      <h1 id="mr-title" className="mr-title">{R.title}</h1>
      <p className="mr-text">{R.text}</p>

      <div className="mr-board">
        <canvas ref={canvas} width={FIGURE_W * 26} height={FIGURE_H * 26} role="img" aria-label={R.stageLabel + strip} />
        <p className="ml-strip" aria-hidden="true">{strip}</p>
      </div>
      <div className="mr-tools" role="group" aria-label={T.board.controls}>
        <button type="button" aria-label={T.board.stepBackLabel} disabled={board.turn <= 0} onClick={() => { setPlaying(false); setBoard((b) => (b.turn > 0 ? stepBack(b) : b)); }}>{T.board.stepBack}</button>
        <button type="button" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? T.board.pause : T.board.play}</button>
        <button type="button" aria-label={T.board.stepLabel} onClick={() => { setPlaying(false); setBoard((b) => (b.turn + 1 >= FRAMES ? c4b5Preset() : step(b))); }}>{T.board.step}</button>
        <button type="button" onClick={() => { setPlaying(false); setBoard(c4b5Preset()); }}>{T.board.reset}</button>
      </div>

      <div className="ml-rulecard mr-rulecard">
        {T.rule.rows.map(([h, t, a, b]) => (
          <div key={h} className="ml-rule-row">
            <div className="ml-rule-blocks" aria-hidden="true">
              <div className="ml-mini">{a.map((q, k) => <span key={k} className={q ? 'on' : ''} />)}</div>
              <span className="ml-rule-arrow">→</span>
              <div className="ml-mini">{b.map((q, k) => <span key={k} className={q ? 'on' : ''} />)}</div>
            </div>
            <div className="ml-rule-words"><span className="ml-rule-h">{h}</span><span className="ml-rule-t">{t}</span></div>
          </div>
        ))}
        <p className="ml-rule-closing">{T.rule.closing}</p>
      </div>
      <p className="mr-caption">{R.caption}</p>

      <a className="mr-link" href={github}>{R.recipe}</a>
      <button type="button" className="mr-link" aria-expanded={src} onClick={() => setSrc((s) => !s)}>{T.sources(src, R.sources.length)}</button>
      {src && (
        <ul className="ml-sources">
          {R.sources.map(([t, id]) => <li key={t}><span>{t}</span><span className="ml-source-id">{id}</span></li>)}
        </ul>
      )}
    </article>
  );
}
