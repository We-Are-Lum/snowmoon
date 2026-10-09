'use client';

/**
 * Learn Minpentai: Claude Design's "Minpentai Intro v3" (docs/design/minpentai-intro-v3.dc.html),
 * ported. Eight watch screens over Design's scripted 3D broadcast, seven lessons on Design's pieces
 * board, the optional Under the hood, and the practice match against Design's bot. The game is
 * Design's, with RULES INVENTED FOR THIS EDITION; the book's own rule is in the sandbox.
 *
 * The logic is src/lib/minpentai/learn-game/controller.ts (Design's Component, tested against
 * Design's own script); this file is the frame (Design's markup, lines 33–166) and the loop.
 * Added for the owner's standing rules, each listed in docs/design/minpentai-learn-port.md: the
 * commentary, pause and CELLS sit outside the role="img" stage; keyboard placing on the board; the
 * pause on screen 2; bundled three.js. Full screen (owner, 2026-10-09): under 768 px and inside the
 * Farcaster mini app the frame fills the viewport (learn.css hides the site's top bar), with an exit
 * link back to the site; on tablet and desktop it is Design's phone, centred beside the rail.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { sdk } from '@farcaster/miniapp-sdk';
import type * as THREE_NS from 'three';
import { inMiniApp } from '~/lib/client-auth';
import { LearnController, browserEnv, isCells } from '~/lib/minpentai/learn-game/controller';
import { COL, NAME } from '~/lib/minpentai/learn-game/broadcast';
import { PH, PW } from '~/lib/minpentai/learn-game/pieces';
import { LS, indexOf } from '~/lib/minpentai/learn-game/lessons';
import { LEARN_TEXT as T } from '~/lib/minpentai/learn-text';
import { drawBoard, drawView } from './learn-draw';
import type { Scene } from './broadcast-scene';

/** Screens by number: 0–7 watch, 8–14 the lessons, 15 Under the hood, 16 the practice match. */
export const LEARN_SCREENS = T.watch.length + LS.length;
export const PRACTICE_SCREEN = T.watch.length + indexOf('practice');

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Learn({ start, onScreen, onFree }: { start: number; onScreen: (n: number) => void; onFree: () => void }) {
  const ctl = useMemo(() => {
    const c = new LearnController(browserEnv(), { reduced: prefersReduced() });
    if (start >= T.watch.length) c.startLesson(Math.min(LS.length - 1, start - T.watch.length));
    else if (start > 0) c.go(start);
    return c;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => ctl.subscribe(force), [ctl]);

  const S = ctl.state;
  const v = ctl.view();
  const L = ctl.L;
  const screen = S.mode === 'watch' ? S.i : T.watch.length + S.li;

  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLCanvasElement>(null);
  const flatRef = useRef<HTMLCanvasElement>(null);
  const camRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  // On a phone the frame fills the screen below whatever sits above it (the top bar, and on a first
  // visit the "What is this?" link), so the footer is always in view.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => el.style.setProperty('--ml-top', `${Math.max(0, el.getBoundingClientRect().top + window.scrollY)}px`);
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(document.body);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  // Inside the Farcaster mini app the frame is full screen at every width, inside the host's safe area.
  useEffect(() => {
    let live = true;
    const root = document.documentElement;
    void inMiniApp().then(async (yes) => {
      if (!live || !yes) return;
      root.classList.add('ml-in-app');
      // sdk.context is a remote thenable: await it (its .catch would be sent to the host as a call).
      let inset;
      try { inset = (await sdk.context)?.client?.safeAreaInsets; } catch { return; }
      if (!live || !inset) return;
      for (const side of ['top', 'right', 'bottom', 'left'] as const) root.style.setProperty(`--ml-safe-${side}`, `${inset[side]}px`);
    });
    return () => {
      live = false;
      root.classList.remove('ml-in-app');
      for (const side of ['top', 'right', 'bottom', 'left']) root.style.removeProperty(`--ml-safe-${side}`);
    };
  }, []);
  const sceneRef = useRef<Scene | null>(null);
  const [noGL, setNoGL] = useState(false);
  const [cursor, setCursor] = useState<[number, number]>([4, 5]);
  const [focused, setFocused] = useState(false);
  const draw = useRef({ cursor: null as [number, number] | null });
  draw.current.cursor = focused && v.boardPlaceable ? cursor : null;

  // The screen in the address bar, and the text back at its top, on every new screen.
  useEffect(() => {
    onScreen(screen);
    bodyRef.current?.scrollTo?.(0, 0);
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reduced motion, read on mount as in Design, and followed if it changes.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => ctl.setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [ctl]);

  // three.js (bundled), once the broadcast is first needed.
  const wantsGL = S.mode === 'watch';
  useEffect(() => {
    if (!wantsGL || sceneRef.current || noGL) return;
    let dead = false;
    if (!webglOk()) { setNoGL(true); return; }
    void Promise.all([import('three'), import('./broadcast-scene')]).then(([THREE, m]) => {
      if (dead || !stageRef.current || sceneRef.current) return;
      try { sceneRef.current = m.buildScene(THREE as typeof THREE_NS, stageRef.current); } catch { setNoGL(true); }
    }).catch(() => setNoGL(true));
    return () => { dead = true; };
  }, [wantsGL, noGL]);
  useEffect(() => () => { sceneRef.current?.dispose(); sceneRef.current = null; }, []);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => sceneRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The loop (Design's loop, tick and 100 ms watchdog).
  useEffect(() => {
    let raf = 0, dead = false;
    const frame = () => {
      const now = performance.now();
      ctl.tick(now);
      if (ctl.state.mode === 'watch') {
        sceneRef.current?.render(ctl.S, ctl.cam);
        if (flatRef.current) drawView(flatRef.current, ctl.S, null);
        if (ctl.state.i === 1) camRefs.current.forEach((c, p) => drawView(c, ctl.S, p));
      } else if (ctl.L && ctl.L.dirty) {
        if (drawBoard(boardRef.current, ctl.L, ctl.state.cellsOn, now, draw.current.cursor)) ctl.L.dirty = false;
      }
    };
    const loop = () => { if (dead) return; raf = requestAnimationFrame(loop); frame(); };
    raf = requestAnimationFrame(loop);
    const dog = window.setInterval(() => { if (performance.now() - ctl.last > 180) frame(); }, 100);
    return () => { dead = true; cancelAnimationFrame(raf); window.clearInterval(dog); };
  }, [ctl]);
  useEffect(() => { if (ctl.L) ctl.L.dirty = true; }, [cursor, focused, ctl, screen]);

  // Taps and keys on the lesson board.
  const onBoardDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setFocused(false);
    if (!ctl.L || isCells(ctl.L) || !ctl.L.def.place || ctl.L.demo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * PW), y = Math.floor(((e.clientY - r.top) / r.height) * PH);
    setCursor([x, y]);
    ctl.tap(x, y);
  };
  const onBoardKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const mv: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mv[e.key]) {
      e.preventDefault();
      setFocused(true);
      setCursor(([x, y]) => [Math.max(0, Math.min(PW - 1, x + mv[e.key][0])), Math.max(0, Math.min(PH - 1, y + mv[e.key][1]))]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setFocused(true);
      ctl.tap(cursor[0], cursor[1]);
    }
  };
  const cursorWords = () => {
    if (!L || isCells(L)) return '';
    const s = L.s, q = s.pieces.find((p) => p.x === cursor[0] && p.y === cursor[1]);
    const what = q ? (q.k === 'rock' ? T.board.what.rock : `${q.p === 0 ? T.board.what.cyan : T.board.what.amber} ${T.board.what[q.k]}`) : T.board.what.empty;
    return T.board.at(cursor[0], cursor[1], what);
  };

  const hud = S.hud;
  const learn = S.mode === 'learn';
  const tagClass = (k: string) => (k === 'book' ? 'ml-tag ml-tag-solid' : k === 'draft' ? 'ml-tag ml-tag-draft' : 'ml-tag ml-tag-dashed');
  const reactP = hud.react;
  return (
    <section className="ml-learn" aria-label={T.appTitle} ref={frameRef}>
      <header className="ml-learn-bar">
        {/* Full screen only (learn.css): the way back to the site, since its top bar is hidden. */}
        <Link href="/" className="ml-exit" aria-label={T.exitLabel}>{T.exit}</Link>
        <h1 className="ml-learn-title">{T.appTitle}</h1>
        <button type="button" className="ml-learn-skip" onClick={onFree}>{T.skip}</button>
      </header>

      <div className="ml-stage">
        <div className="ml-stage-gl" role="img" aria-label={learn ? undefined : (noGL ? T.hud.noGL + ' ' : '') + v.stageLabel} aria-hidden={learn || undefined}>
          <div ref={stageRef} className="ml-gl-host" />
          {noGL && !learn && <canvas ref={flatRef} className="ml-flat" width={390} height={260} aria-hidden="true" />}
        </div>
        {!learn && (
          <>
            <div className="ml-hud" aria-hidden="true">
              <div className="ml-hud-box ml-hud-score">
                <div className="ml-hud-live"><span className="ml-hud-dot" />{T.hud.live}{hud.turn}</div>
                <div className="ml-hud-grid">
                  {hud.counts.map((c, k) => <span key={k} style={{ color: c.c }}>{c.t}</span>)}
                </div>
              </div>
              <div className="ml-hud-box ml-hud-cam">{hud.cam}</div>
              {hud.minus && <div className="ml-hud-minus" style={{ color: hud.minusC }}>{hud.minus}</div>}
              {hud.countdown && (
                <div className="ml-countdown">
                  <span className="ml-countdown-dz">{T.hud.dz}</span>
                  <span className="ml-countdown-en">{T.hud.dzEnglish}</span>
                </div>
              )}
              {hud.banner && <div className="ml-banner" style={{ borderTopColor: hud.bannerC }}>{hud.banner}</div>}
              {v.hasReact && reactP >= 0 && (
                <div className="ml-react">
                  <span className="ml-react-label" style={{ color: COL[reactP] }}>{T.hud.atConsole(NAME[reactP])}</span>
                  <div className="ml-react-frame" style={{ borderColor: COL[reactP] }}>
                    <Face p={reactP} eyes={hud.reactWin ? { ...hud.eyes[reactP], eh: 8 } : hud.eyes[reactP]} />
                  </div>
                </div>
              )}
              {v.showCams && (
                <div className="ml-cams">
                  {[0, 1, 2, 3].map((p) => (
                    <div key={p} className="ml-cam">
                      <span className="ml-cam-label" style={{ color: COL[p] }}>{NAME[p].toUpperCase() + (hud.counts[p]?.t.endsWith(T.hud.out) ? T.hud.camOut : '')}</span>
                      <Face p={p} eyes={hud.eyes[p]} />
                      <canvas ref={(c) => { camRefs.current[p] = c; }} width={192} height={128} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className={v.commentShown ? 'ml-comment' : 'mp-visually-hidden'} aria-live="polite">{hud.comment}</p>
            <button type="button" className={v.showCams ? 'ml-pause ml-pause-cams' : 'ml-pause'} aria-label={S.paused ? T.hud.playLabel : T.hud.pauseLabel} onClick={() => ctl.togglePause()}>
              {S.paused ? T.hud.play : T.hud.pause}
            </button>
          </>
        )}
        {learn && L && (
          <div className="ml-lesson">
            <div className="ml-board">
              <canvas
                ref={boardRef}
                className={v.boardPlaceable ? 'ml-board-canvas is-placing' : 'ml-board-canvas'}
                width={780}
                height={520}
                role={v.boardPlaceable ? 'application' : 'img'}
                aria-roledescription={v.boardPlaceable ? 'board' : undefined}
                aria-label={v.stageLabel + (v.boardPlaceable ? ' ' + T.board.keys + ' ' + cursorWords() : '')}
                tabIndex={v.boardPlaceable ? 0 : undefined}
                onPointerDown={onBoardDown}
                onKeyDown={v.boardPlaceable ? onBoardKey : undefined}
                onFocus={(e) => setFocused(e.currentTarget.matches(':focus-visible'))}
                onBlur={() => setFocused(false)}
              />
              <p className="ml-strip" aria-hidden="true">{S.lt.strip}</p>
              {S.lt.hasMinus && <p className="ml-board-minus" style={{ color: S.lt.minusC }} aria-hidden="true">{S.lt.minus}</p>}
              {v.hasCellsBtn && (
                <button type="button" className="ml-cells" aria-pressed={S.cellsOn} onClick={() => ctl.toggleCells()}>{T.board.cells}</button>
              )}
            </div>
          </div>
        )}
      </div>

      {learn && v.hasTools && (
        <div className="ml-tools" role="group" aria-label={T.board.controls}>
          <button type="button" aria-label={T.board.stepBackLabel} onClick={() => ctl.ltool('back')}>{T.board.stepBack}</button>
          <button type="button" aria-pressed={v.lplaying} onClick={() => ctl.ltool('play')}>{v.playLabel}</button>
          <button type="button" aria-label={T.board.stepLabel} onClick={() => ctl.ltool('step')}>{T.board.step}</button>
          <button type="button" onClick={() => ctl.ltool('reset')}>{T.board.reset}</button>
        </div>
      )}
      {learn && v.hasPalette && (
        <div className="ml-palette" role="group" aria-label={T.board.pieces}>
          <div className="ml-palette-row">
            {v.palette.map((p) => (
              <button key={p.k} type="button" aria-pressed={p.on} onClick={() => ctl.pickTool(p.k)}>{p.t}</button>
            ))}
          </div>
          {v.hasDirs && (
            <div className="ml-dirs">
              {v.dirs.map((r) => (
                <button key={r.t} type="button" aria-label={r.label} aria-pressed={r.on} onClick={() => ctl.pickDir(r.dx, r.dy)}>{r.t}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ml-body" ref={bodyRef}>
        {/* Design's tag row sits above the text; here it scrolls with it, so the text keeps its room on short phones. */}
        <div className="ml-tags">
          {v.tags.map((k) => <span key={k} className={tagClass(k)}>{T.tags[k]}</span>)}
        </div>
        <h2 className="ml-title">{v.title}</h2>
        <p className="ml-text">{v.text}</p>
        {v.caption && <p className="ml-caption">{v.caption}</p>}
        <p className="ml-status" aria-live="polite">{v.status}</p>
        {v.hasReasons && (
          <ol className="ml-reasons">
            {T.reasons.map((r, k) => <li key={r}><span className="ml-reason-n">{k + 1}</span><span>{r}</span></li>)}
          </ol>
        )}
        {v.hasHood && <button type="button" className="ml-textlink" onClick={() => ctl.startLesson(indexOf('hood'))}>{T.hoodLink}</button>}
        {v.hasRule && (
          <>
            <button type="button" className="ml-textlink" aria-expanded={v.ruleOpen} onClick={() => ctl.toggleRule()}>{v.ruleLabel}</button>
            {v.ruleOpen && (
              <div className="ml-rulecard">
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
            )}
          </>
        )}
        {v.rulesNote && (
          <div className="ml-rulesnote">
            <p>{T.rulesNote.text}</p>
            <button type="button" className="ml-textlink" onClick={onFree}>{T.rulesNote.link}</button>
          </div>
        )}
        <button type="button" className="ml-textlink" aria-expanded={S.src} onClick={() => ctl.toggleSrc()}>{v.srcLabel}</button>
        {S.src && (
          <ul className="ml-sources">
            {v.sources.map(([t, id]) => <li key={t}><span>{t}</span><span className="ml-source-id">{id}</span></li>)}
          </ul>
        )}
      </div>

      <footer className="ml-foot">
        <div className="ml-progress">
          <div className="ml-marks" aria-hidden="true">{v.dots.map((d, k) => <span key={k} className={`is-${d}`} />)}</div>
          <span className="ml-stepof">{v.stepOf}</span>
        </div>
        <div className="ml-buttons">
          <button type="button" className="ml-back" onClick={() => ctl.back()} aria-hidden={v.backHidden || undefined} tabIndex={v.backHidden ? -1 : 0} style={{ visibility: v.backHidden ? 'hidden' : 'visible' }}>{T.back}</button>
          <button type="button" className="ml-main" onClick={() => ctl.next()}>{v.button}</button>
        </div>
      </footer>
      {S.toast && <div className="ml-toast" role="status">{S.toast}</div>}
    </section>
  );
}

/** A player at the console (Design's face card, 97 × 62): head, shoulders, cable, clear lenses. */
function Face({ p, eyes }: { p: number; eyes: { ex: number; ey: number; eh: number; op: number } }) {
  const col = COL[p], lens = col + '2E';
  const eye = (
    <div className="ml-eye" style={{ height: eyes.eh }}>
      <div className="ml-pupil" style={{ transform: `translate(${eyes.ex}px, ${eyes.ey}px)` }} />
    </div>
  );
  return (
    <div className="ml-face" style={{ opacity: eyes.op }}>
      <div className="ml-face-shoulders" />
      <div className="ml-face-head" />
      <div className="ml-face-cable" />
      <div className="ml-face-lens" style={{ borderColor: col, background: lens, boxShadow: `0 0 10px ${lens}` }} />
      <div className="ml-face-eyes">{eye}{eye}</div>
    </div>
  );
}
