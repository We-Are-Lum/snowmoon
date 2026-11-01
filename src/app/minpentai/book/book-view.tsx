'use client';

import { useEffect, useMemo, useState } from 'react';
import { BOOK_PIECES, EDITION_NAME } from '~/lib/minpentai/versions/book-edition';
import { SCENARIOS, runScenario, type Scenario } from '~/lib/minpentai/versions/book-scenarios';
import type { Engine, World } from '~/lib/minpentai/versions/engine';
import { MinpentaiTags } from '../mp-tags';
import { useAuth } from '~/lib/client-auth';

const CYAN = '#46D7E8', AMBER = '#FFB43A', ROCK = '#4B4C55', GRID = '#16171C', CELL = '#0E0F13';
const colour = (o: 'C' | 'A') => (o === 'C' ? CYAN : AMBER);
const Z = 28;

/** One frame of a scenario, drawn with Play's colours: towers ringed, squares filled, gliders as arrows. */
export function Board({ e, w }: { e: Engine; w: World }) {
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < e.H; y++) for (let x = 0; x < e.W; x++) {
    const k = e.K(x, y), X = x * Z, Y = y * Z, c = X + Z / 2, d = Y + Z / 2, at = e.wallAt(w, k);
    cells.push(<rect key={`b${k}`} x={X + 1} y={Y + 1} width={Z - 2} height={Z - 2} fill={CELL} />);
    if (w.rock[k]) {
      cells.push(<rect key={`r${k}`} x={X + 3} y={Y + 3} width={Z - 6} height={Z - 6} rx={5} fill={ROCK} />);
      const ore = w.ore?.[k] ?? 0;
      for (let i = 0; i < ore; i++) cells.push(<circle key={`o${k}${i}`} cx={X + 8 + i * 6} cy={Y + Z - 8} r={2} fill="#B4B3BA" />);
    }
    if (w.tw[k]) {
      const forming = w.fs?.[k];
      cells.push(<circle key={`t${k}`} cx={c} cy={d} r={9} fill="none" stroke={colour(w.tw[k])} strokeWidth={3} strokeDasharray={forming ? '4 3' : undefined} />);
    }
    if (w.sq[k]) cells.push(<rect key={`s${k}`} x={X + 5} y={Y + 5} width={Z - 10} height={Z - 10} fill={colour(w.sq[k].o)} opacity={w.sq[k].hp > 1 ? 1 : 0.5} />);
    const mi = w.mir?.[k];
    if (mi) cells.push(<line key={`m${k}`} x1={mi.d > 0 ? X + 4 : X + Z - 4} y1={Y + Z - 4} x2={mi.d > 0 ? X + Z - 4 : X + 4} y2={Y + 4} stroke={colour(mi.o)} strokeWidth={4} opacity={0.35 + 0.65 * (mi.hp / 3)} strokeLinecap="round" />);
    const f = w.fa?.[k];
    if (f) cells.push(
      <g key={`f${k}`}>
        <rect x={X + 5} y={Y + 5} width={Z - 10} height={Z - 10} fill="none" stroke={colour(f.o)} strokeWidth={2} opacity={f.hp > 1 ? 1 : 0.5} />
        <line x1={c} y1={d} x2={c + f.dx * 10} y2={d + f.dy * 10} stroke={colour(f.o)} strokeWidth={2} />
      </g>,
    );
    if (w.sd?.[k]) cells.push(<circle key={`e${k}`} cx={c} cy={d} r={4} fill={colour(w.sd[k])} />);
    if (at) cells.push(<rect key={`w${k}`} x={X + 2} y={Y + 2} width={Z - 4} height={Z - 4} fill={colour(at.m.o)} opacity={0.75} rx={2} />);
  }
  for (const g of w.gl) {
    const c = g.x * Z + Z / 2, d = g.y * Z + Z / 2, len = Math.hypot(g.dx, g.dy), ux = g.dx / len, uy = g.dy / len;
    cells.push(
      <g key={`g${g.id}`}>
        {g.seed ? <circle cx={c} cy={d} r={6} fill="none" stroke={colour(g.o)} strokeWidth={2} /> : null}
        <polygon points={`${c + ux * 8},${d + uy * 8} ${c - ux * 6 - uy * 6},${d - uy * 6 + ux * 6} ${c - ux * 6 + uy * 6},${d - uy * 6 - ux * 6}`} fill={colour(g.o)} />
      </g>,
    );
  }
  for (const k of w.flash) { const [x, y] = e.XY(k); cells.push(<rect key={`x${k}`} x={x * Z + 2} y={y * Z + 2} width={Z - 4} height={Z - 4} fill="none" stroke="#F4F2ED" strokeWidth={2} />); }
  return (
    <svg className="mb-board" viewBox={`0 0 ${e.W * Z} ${e.H * Z}`} role="img" aria-label={`Step ${w.step}`}>
      <rect width={e.W * Z} height={e.H * Z} fill={GRID} />
      {cells}
    </svg>
  );
}

function ScenarioCard({ sc }: { sc: Scenario }) {
  const run = useMemo(() => runScenario(sc), [sc]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = run.frames.length - 1;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setI((j) => { if (j >= n) { setPlaying(false); return j; } return j + 1; }), 260);
    return () => window.clearInterval(id);
  }, [playing, n]);
  const turn = sc.turns?.find((t) => t.step === run.frames[i].step);
  return (
    <figure className="mb-scenario" id={sc.id}>
      <figcaption><strong>{sc.title}</strong> {sc.watch}</figcaption>
      <Board e={run.e} w={run.frames[i]} />
      <div className="mb-controls">
        <button type="button" onClick={() => { if (i >= n) setI(0); setPlaying(!playing); }}>{playing ? 'Pause' : i >= n ? 'Again' : 'Play'}</button>
        <button type="button" onClick={() => { setPlaying(false); setI(Math.max(0, i - 1)); }} disabled={i === 0}>Step back</button>
        <button type="button" onClick={() => { setPlaying(false); setI(Math.min(n, i + 1)); }} disabled={i >= n}>Step</button>
        <span>Step {run.frames[i].step} of {n}{turn ? ' · a turn to act' : ''}</span>
      </div>
      {run.refused.length ? <p className="mb-refused">Refused: {run.refused.join('; ')}</p> : null}
    </figure>
  );
}

export function BookView({ people }: { people: number[] }) {
  // Invite-only while the computer doesn't use all four pieces (owner, 2026-11-01).
  const auth = useAuth();
  if (!(auth.kind === 'signed-in' && people.includes(auth.fid))) {
    return (
      <article className="mb">
        <h1>Minpentai: {EDITION_NAME}</h1>
        <MinpentaiTags tags={['rules', 'draft']} />
        <p>The book edition is invite-only for now.{auth.kind === 'signed-in' ? '' : ' Sign in if you were invited.'}</p>
      </article>
    );
  }
  return (
    <article className="mb">
      <h1>Minpentai: {EDITION_NAME}</h1>
      <MinpentaiTags tags={['book', 'rules', 'draft']} />
      <p>
        A separate set of rules, for a match people choose; Play stays as it is. Four of the structures the book&rsquo;s players build
        become pieces: the mirror wall, the symbol glider, the moving wall and the glider factory, on a 24 &times; 14 board with
        rocks that hold ore. Each piece below gives the book&rsquo;s words first, then the rules this edition invented for it, then a
        small board to play.
      </p>
      <p className="mb-note">The book edition. Invite-only while it&rsquo;s being tried. <a href="/minpentai/book/tutorial">The four pieces in four cards →</a></p>
      {BOOK_PIECES.map((p) => (
        <section key={p.id} className="mb-piece">
          <h2>{p.name}</h2>
          <h3>The book</h3>
          {p.book.map((q) => <blockquote key={q.block}>&ldquo;{q.says}&rdquo; <cite>{q.block}</cite></blockquote>)}
          <h3>This edition&rsquo;s rules (invented)</h3>
          <ul>{p.edition.map((x) => <li key={x}>{x}</li>)}</ul>
          {SCENARIOS.filter((s) => s.piece === p.id).map((s) => <ScenarioCard key={s.id} sc={s} />)}
        </section>
      ))}
      <p className="mb-note">Rules invented for this edition · not affiliated with the author. Design: docs/proposals/minpentai-book-pieces.md.</p>
    </article>
  );
}
