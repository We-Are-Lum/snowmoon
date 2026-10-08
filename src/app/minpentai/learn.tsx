'use client';

/**
 * Learn Minpentai (docs/design/minpentai-study.md): the match first, then the pieces.
 * Eight watch screens over the recorded match in 3D, seven lessons on a real board, the
 * optional "under the hood" lesson, and a practice match against the computer.
 *
 * Layout after Design's phone frame: the app bar, the stage (the broadcast or the board), the
 * screen's controls, tags, title and text (this part scrolls), and a footer with the progress
 * and Back beside one main button.
 */
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { step, type Board } from '~/lib/minpentai/engine';
import { advance, isIntervention, place, placeProblem, snap, type Dir, type Match, type Placement, type StampKind } from '~/lib/minpentai/match';
import { playTurn, rng } from '~/lib/minpentai/ai';
import { LESSONS, NEW_RULES, WATCH, hoodBoard, practiceMatch, type Lesson, type NewRule } from '~/lib/minpentai/lessons';
import { LEARN_TEXT as T, type LearnScreen, type Source, type Tag } from '~/lib/minpentai/learn-text';
import { PiecesBoard } from './pieces-board';
import { CellsView } from './cells-view';

const BroadcastStage = dynamic(() => import('./broadcast').then((m) => m.BroadcastStage), {
  ssr: false,
  loading: () => <div className="bc bc-loading" aria-hidden="true" />,
});

/** Screens in order: 0–7 watch, 8–14 lessons, 15 under the hood, 16 practice. */
export const LEARN_SCREENS = WATCH.length + LESSONS.length + 2;
const HOOD = WATCH.length + LESSONS.length;
const PRACTICE = HOOD + 1;
/** Design: lessons at 3 of its steps a second, practice at 4; a step is 4 turns (a glider's two cells). */
const LESSON_TURNS_PER_SECOND = 12;
const PRACTICE_TURNS_PER_SECOND = 16;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Learn({ index, onScreen, onFree }: { index: number; onScreen: (i: number) => void; onFree: () => void }) {
  const go = (i: number) => onScreen(Math.max(0, Math.min(LEARN_SCREENS - 1, i)));
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo?.(0, 0); }, [index]);

  if (index < WATCH.length) return <WatchScreen key={index} i={index} go={go} onFree={onFree} bodyRef={bodyRef} />;
  if (index < HOOD) return <LessonScreen key={index} lesson={LESSONS[index - WATCH.length]} n={index - WATCH.length} go={(d) => go(index + d)} toPractice={() => go(PRACTICE)} toHood={() => go(HOOD)} onFree={onFree} bodyRef={bodyRef} />;
  if (index === HOOD) return <HoodScreen go={(d) => (d > 0 ? go(PRACTICE) : go(HOOD - 1))} onFree={onFree} bodyRef={bodyRef} />;
  return <PracticeScreen back={() => go(HOOD - 1)} onFree={onFree} bodyRef={bodyRef} />;
}

/* ---------------- the frame ---------------- */

function Frame(props: {
  stage: React.ReactNode;
  controls?: React.ReactNode;
  tags: Tag[];
  title: string;
  text: React.ReactNode;
  caption?: string;
  status?: string | null;
  extra?: React.ReactNode;
  toast?: string | null;
  sources: Source[];
  progress: { count: number; at: number; label: string };
  onBack: (() => void) | null;
  primary: { label: string; onClick: () => void; disabled?: boolean };
  onFree: () => void;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const tags = props.tags.filter((t) => t !== 'draft' || T.modelDrafted);
  return (
    <section className="mp-learn" aria-label={T.appTitle}>
      <header className="mp-learn-bar">
        <h1 className="mp-learn-title">{T.appTitle}</h1>
        <button type="button" className="mp-learn-skip" onClick={props.onFree}>{T.skip}</button>
      </header>
      <div className="mp-learn-stage">{props.stage}</div>
      {props.controls}
      <div className="mp-learn-body" ref={props.bodyRef}>
        <p className="mp-tags mp-learn-tags">
          {tags.map((t) => (
            <span key={t} className={`mp-tag mp-tag-${t}`}>{T.tags[t]}</span>
          ))}
        </p>
        <h2 className="mp-learn-h">{props.title}</h2>
        <p className="mp-learn-text">{props.text}</p>
        {props.caption && <p className="mp-learn-caption">{props.caption}</p>}
        {props.status && <p className="mp-learn-status" role="status">{props.status}</p>}
        {props.extra}
        <button type="button" className="mp-sources-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? T.hideSources(props.sources.length) : T.sources(props.sources.length)}
        </button>
        {open && (
          <ul className="mp-sources">
            {props.sources.map(([what, where]) => (
              <li key={what}>
                <span>{what}</span>
                <span className="mp-source-ref">{where}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {props.toast && <p className="mp-learn-toast" role="status">{props.toast}</p>}
      <footer className="mp-learn-foot">
        <div className="mp-learn-progress">
          <span className="mp-marks" aria-hidden="true">
            {Array.from({ length: props.progress.count }, (_, k) => (
              <span key={k} className={k < props.progress.at ? 'is-past' : k === props.progress.at ? 'is-current' : ''} />
            ))}
          </span>
          <span className="mp-learn-count">{props.progress.label}</span>
        </div>
        <div className="mp-learn-buttons">
          {props.onBack ? (
            <button type="button" className="mp-learn-back" onClick={props.onBack}>{T.back}</button>
          ) : (
            <span className="mp-learn-back mp-learn-back-none" aria-hidden="true" />
          )}
          <button type="button" className="mp-learn-primary" onClick={props.primary.onClick} disabled={props.primary.disabled}>{props.primary.label}</button>
        </div>
      </footer>
    </section>
  );
}

/* ---------------- watch ---------------- */

function WatchScreen({ i, go, onFree, bodyRef }: { i: number; go: (i: number) => void; onFree: () => void; bodyRef: React.RefObject<HTMLDivElement | null> }) {
  const w = WATCH[i];
  const t = T.watch[w.id];
  const [paused, setPaused] = useState(false);
  return (
    <Frame
      stage={<BroadcastStage segment={w.segment} paused={paused} onPause={() => setPaused((p) => !p)} label={T.broadcastLabel} />}
      tags={t.tags}
      title={t.title}
      text={t.text}
      caption={'caption' in t ? t.caption : undefined}
      sources={t.sources}
      progress={{ count: WATCH.length, at: i, label: T.watchOf(i + 1, WATCH.length) }}
      onBack={i > 0 ? () => go(i - 1) : null}
      primary={{ label: t.button, onClick: () => go(i + 1) }}
      onFree={onFree}
      bodyRef={bodyRef}
    />
  );
}

/* ---------------- a lesson board: play, step, back, reset ---------------- */

function useMatchPlayer(start: () => Match, stopWhen: (m: Match) => boolean, speed = LESSON_TURNS_PER_SECOND) {
  const [hist, setHist] = useState<Match[]>(() => [start()]);
  const [playing, setPlaying] = useState(false);
  const m = hist[hist.length - 1];
  const stop = useRef(stopWhen);
  stop.current = stopWhen;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setHist((h) => {
        const cur = h[h.length - 1];
        if (stop.current(cur) || cur.winner !== undefined) { setPlaying(false); return h; }
        const next = advance(cur);
        if (stop.current(next)) setPlaying(false);
        return [...h.slice(-400), next];
      });
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed]);
  return {
    m,
    hist,
    playing,
    setPlaying,
    forward: () => setHist((h) => [...h, advance(h[h.length - 1])]),
    back: () => setHist((h) => (h.length > 1 ? h.slice(0, -1) : h)),
    reset: () => { setPlaying(false); setHist([start()]); },
    /** Replaces the current turn (a piece put down). */
    set: (f: (m: Match) => Match) => setHist((h) => [...h.slice(0, -1), f(h[h.length - 1])]),
  };
}

function Transport({ p, onReset }: { p: ReturnType<typeof useMatchPlayer>; onReset: () => void }) {
  return (
    <div className="mp-transport4" role="group" aria-label={T.board.controlsLabel}>
      <button type="button" onClick={() => { p.setPlaying(false); p.back(); }} disabled={p.hist.length < 2} aria-label={T.board.stepBack}>{T.board.stepBackShort}</button>
      <button type="button" onClick={() => p.setPlaying(!p.playing)} aria-pressed={p.playing}>{p.playing ? T.board.pause : T.board.play}</button>
      <button type="button" onClick={() => { p.setPlaying(false); p.forward(); }} aria-label={T.board.stepLabel}>{T.board.step}</button>
      <button type="button" onClick={onReset}>{T.board.reset}</button>
    </div>
  );
}

const TOOLS: StampKind[] = ['glider', 'mirror', 'symbol'];
const COST: Record<StampKind, number> = { glider: 4, mirror: 1, symbol: 4 };
const DIRS: Dir[] = ['left', 'up', 'down', 'right'];
const ARROW: Record<Dir, string> = { left: '←', up: '↑', down: '↓', right: '→' };

function Palette({ tool, setTool, dir, setDir, left }: { tool: StampKind; setTool: (t: StampKind) => void; dir: Dir; setDir: (d: Dir) => void; left: number }) {
  return (
    <>
      <div className="mp-palette" role="group" aria-label={T.board.toolsLabel}>
        {TOOLS.map((k) => (
          <button key={k} type="button" aria-pressed={tool === k} onClick={() => setTool(k)} disabled={COST[k] > left}>
            {T.board.tools[k]} {T.board.cost(COST[k])}
          </button>
        ))}
      </div>
      {tool === 'glider' && (
        <div className="mp-dirs" role="group" aria-label={T.board.dirsLabel}>
          {DIRS.map((d) => (
            <button key={d} type="button" aria-pressed={dir === d} aria-label={T.board.dirs[d]} onClick={() => setDir(d)}>{ARROW[d]}</button>
          ))}
        </div>
      )}
    </>
  );
}

/** Tap handling shared by lessons and practice: puts down the chosen piece, or says why not. */
function usePlacing(p: ReturnType<typeof useMatchPlayer>, onlySquare: boolean) {
  const [tool, setTool] = useState<StampKind>(onlySquare ? 'mirror' : 'glider');
  const [dir, setDir] = useState<Dir>('right');
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const pick = (x: number, y: number) => {
    const kind = onlySquare ? 'mirror' : tool;
    const pl: Placement = kind === 'mirror' ? { kind, x, y } : snap(p.m.board, { kind, x, y, dir });
    const why = placeProblem(p.m, 0, pl);
    if (why) { setToast(T.board.problems[why]); return; }
    p.set((m) => place(m, 0, pl));
    setToast(null);
  };
  return { tool, setTool, dir, setDir, toast, pick };
}

/* ---------------- lessons ---------------- */

function LessonScreen(props: {
  lesson: Lesson;
  n: number;
  go: (d: number) => void;
  toPractice: () => void;
  toHood: () => void;
  onFree: () => void;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { lesson: l, n } = props;
  const t: LearnScreen = T.lessons[l.id];
  const byDemo = useRef(false);
  const [outcome, setOutcome] = useState<'met' | 'failed' | null>(null);
  // The board runs on after the goal (as in Design); it stops if the lesson fails.
  const p = useMatchPlayer(l.setup, (m) => !!l.fail?.(m) && !l.goal?.(m));
  useEffect(() => {
    if (outcome) return;
    if (l.goal?.(p.m)) setOutcome('met');
    else if (l.fail?.(p.m)) setOutcome('failed');
  }, [p.m, l, outcome]);
  const met = outcome === 'met';
  const canPlace = !!l.place && isIntervention(p.m) && !met;
  const reset = () => { p.reset(); setOutcome(null); byDemo.current = false; };
  const placing = usePlacing(p, l.place === 'square');

  // A read lesson's board quietly runs on its own.
  useEffect(() => {
    if (l.kind === 'read' && !reduced()) p.setPlaying(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  const later = (f: () => void, ms: number) => { timers.current.push(window.setTimeout(f, reduced() ? 0 : ms)); };
  // The big button: reset if needed, put the demo's pieces down (300 ms, then every 550 ms), then play.
  const runDemo = () => {
    byDemo.current = true;
    const moves = l.demo?.kind === 'place' ? l.demo.moves : [];
    if (moves.length || outcome === 'failed' || p.m.board.turn > 0) reset();
    byDemo.current = true;
    moves.forEach((mv, k) => later(() => p.set((m) => place(m, 0, mv)), 300 + 550 * k));
    later(() => p.setPlaying(true), moves.length ? 300 + 550 * moves.length : 0);
  };

  const primary =
    l.id === 'rule'
      ? { label: t.button, onClick: props.toPractice }
      : l.kind === 'read' || met
        ? { label: l.kind === 'do' ? T.next : t.button, onClick: () => props.go(1) }
        : { label: t.button, onClick: runDemo, disabled: p.playing };
  const status = met ? t.met ?? (byDemo.current ? T.likeThat : T.youDidIt) : outcome === 'failed' ? t.failed ?? null : null;

  return (
    <Frame
      stage={
        <PiecesBoard
          match={p.m}
          viewer={l.fog ? 0 : null}
          lit={l.place === 'palette' && canPlace}
          hints={canPlace ? l.hints : []}
          onPick={canPlace ? placing.pick : l.place ? () => placing.pick(-1, -1) : undefined}
          points={l.place === 'palette' ? p.m.left[0] : null}
          label={T.boardLabel(t.title)}
          trail={p.hist}
        />
      }
      toast={placing.toast}
      controls={
        l.kind === 'do' ? (
          <>
            <Transport p={p} onReset={reset} />
            {l.place === 'palette' && canPlace && <Palette tool={placing.tool} setTool={placing.setTool} dir={placing.dir} setDir={placing.setDir} left={p.m.left[0]} />}
          </>
        ) : undefined
      }
      tags={t.tags}
      title={t.title}
      text={t.text}
      caption={t.caption}
      status={status}
      extra={
        l.id === 'rule' ? (
          <>
            <ol className="mp-reasons2">
              {T.reasons.map((r, k) => (
                <li key={r}><span className="mp-reason-n">{k + 1}</span>{r}</li>
              ))}
            </ol>
            <button type="button" className="mp-hood-link" onClick={props.toHood}>{T.hoodLink}</button>
          </>
        ) : undefined
      }
      sources={t.sources}
      progress={{ count: LESSONS.length, at: n, label: T.learnOf(n + 1, LESSONS.length) }}
      onBack={() => props.go(-1)}
      primary={primary}
      onFree={props.onFree}
      bodyRef={props.bodyRef}
    />
  );
}

/* ---------------- under the hood ---------------- */

function HoodScreen({ go, onFree, bodyRef }: { go: (d: number) => void; onFree: () => void; bodyRef: React.RefObject<HTMLDivElement | null> }) {
  const t = T.hood;
  const [hist, setHist] = useState<Board[]>(() => [hoodBoard()]);
  const [playing, setPlaying] = useState(false);
  const b = hist[hist.length - 1];
  const met = b.turn >= 16;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHist((h) => [...h.slice(-200), step(h[h.length - 1])]), 1000 / 6);
    return () => window.clearInterval(id);
  }, [playing]);
  return (
    <Frame
      stage={<CellsView board={b} label={T.boardLabel(t.title)} />}
      controls={
        <div className="mp-transport4" role="group" aria-label={T.board.controlsLabel}>
          <button type="button" onClick={() => { setPlaying(false); setHist((h) => (h.length > 1 ? h.slice(0, -1) : h)); }} disabled={hist.length < 2} aria-label={T.board.stepBack}>{T.board.stepBackShort}</button>
          <button type="button" onClick={() => setPlaying((v) => !v)} aria-pressed={playing}>{playing ? T.board.pause : T.board.play}</button>
          <button type="button" onClick={() => { setPlaying(false); setHist((h) => [...h, step(h[h.length - 1])]); }} aria-label={T.board.stepLabel}>{T.board.step}</button>
          <button type="button" onClick={() => { setPlaying(false); setHist([hoodBoard()]); }}>{T.board.reset}</button>
        </div>
      }
      tags={t.tags}
      title={t.title}
      text={t.text}
      caption={t.caption}
      status={met ? T.youDidIt : null}
      extra={
        <figure className="mp-rulecard">
          <figcaption>{T.ruleCardLabel}</figcaption>
          <dl>
            {T.ruleCard.map(([a, b2]) => (
              <div key={a}><dt>{a}</dt><dd>{b2}</dd></div>
            ))}
          </dl>
        </figure>
      }
      sources={t.sources}
      progress={{ count: LESSONS.length, at: LESSONS.length, label: T.learnOptional }}
      onBack={() => go(-1)}
      primary={met ? { label: T.lessons.rule.button, onClick: () => go(1) } : { label: t.button, onClick: () => setPlaying(true), disabled: playing }}
      onFree={onFree}
      bodyRef={bodyRef}
    />
  );
}

/* ---------------- practice ---------------- */

export function PracticeScreen({ back, onFree, bodyRef }: { back: (() => void) | null; onFree: () => void; bodyRef: React.RefObject<HTMLDivElement | null> }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const rule: NewRule = useMemo(() => NEW_RULES[seed % NEW_RULES.length], [seed]);
  return <Practice key={seed} rule={rule} seed={seed} again={() => setSeed((s) => s + 1 + Math.floor(Math.random() * 1e6))} back={back} onFree={onFree} bodyRef={bodyRef} />;
}

function Practice({ rule, seed, again, back, onFree, bodyRef }: { rule: NewRule; seed: number; again: () => void; back: (() => void) | null; onFree: () => void; bodyRef: React.RefObject<HTMLDivElement | null> }) {
  const t = T.practice;
  const random = useMemo(() => rng(seed), [seed]);
  const p = useMatchPlayer(() => practiceMatch(rule), (m) => isIntervention(m) || m.winner !== undefined, PRACTICE_TURNS_PER_SECOND);
  const yourTurn = isIntervention(p.m) && !p.playing;
  const placing = usePlacing(p, false);
  const over = p.m.winner !== undefined;
  const endTurn = () => {
    // Amber takes its turn on the same turn to act, then the match runs to the next one.
    p.set((m) => playTurn(m, 1, 'easy', random));
    p.set((m) => advance(m));
    p.setPlaying(true);
  };
  const toNext = p.m.rules.interval - (p.m.board.turn % p.m.rules.interval);
  const status = over
    ? p.m.winner === 0 ? t.won : p.m.winner === null ? t.draw : t.lost
    : yourTurn ? t.yourTurn(p.m.board.turn) : t.running(toNext);
  return (
    <Frame
      stage={
        <PiecesBoard
          match={p.m}
          viewer={over ? null : 0}
          lit={yourTurn}
          onPick={yourTurn ? placing.pick : () => placing.pick(-1, -1)}
          points={p.m.left[0]}
          label={T.boardLabel(t.title)}
          trail={p.hist}
          stripTurn={`${p.m.board.turn}/${p.m.rules.maxTurns}`}
        />
      }
      toast={placing.toast}
      controls={yourTurn && !over ? <Palette tool={placing.tool} setTool={placing.setTool} dir={placing.dir} setDir={placing.setDir} left={p.m.left[0]} /> : undefined}
      tags={t.tags}
      title={t.title}
      text={t.text}
      caption={t.rule(t.rules[rule.id])}
      status={status}
      sources={t.sources}
      progress={{ count: LESSONS.length, at: LESSONS.length, label: T.practiceLabel }}
      onBack={back}
      primary={over ? { label: t.again, onClick: again } : { label: t.endTurn, onClick: endTurn, disabled: !yourTurn }}
      onFree={onFree}
      bodyRef={bodyRef}
    />
  );
}
