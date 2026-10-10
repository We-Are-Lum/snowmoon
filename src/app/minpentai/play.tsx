'use client';

/**
 * Minpentai Play: Claude Design's "Minpentai Play" screens (docs/design/minpentai-play.dc.html) as
 * its working mockup builds them (docs/design/minpentai-play-prototype.dc.html, markup lines
 * 15–560): the hub (Learn, Play, Free play), the practice match, the computer ladder, the rung
 * start, the match, resign and leave, the result, "watch it again", free play and its board
 * options, and full screen. RULES INVENTED FOR THIS EDITION, as Design's rules page sets them.
 *
 * The logic is src/lib/minpentai/play-game/controller.ts (Design's Component, tested against
 * Design's own script); this file is Design's markup and the site around it:
 * - signed in or not is the site's sign-in; the ladder's progress is the server's
 *   (/api/minpentai/ladder, readable only by you);
 * - one-on-one is play-live.tsx (the server runs the match);
 * - full screen: on a phone and in the Farcaster frame the frame covers the site's chrome and the
 *   board turns upright (Design's A2); on desktop it asks the browser for real full screen (A4);
 * - the board is keyboard reachable (play-board.tsx).
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { authFetch, inMiniApp, useAuth } from '~/lib/client-auth';
import { PlayController, browserEnv, type Dev } from '~/lib/minpentai/play-game/controller';
import type { LadderProgress } from '~/lib/minpentai/play-game/live-types';
import { PlayBoard } from './play-board';
import { PlayPerson } from './play-live';
import { SignInButton } from '~/components/sign-in';

const TAG_INVENTED = 'RULES INVENTED FOR THIS EDITION';

export function Play({ start, onLearn }: { start: 'home' | 'free' | 'ladder' | 'person'; onLearn: () => void }) {
  const auth = useAuth();
  const signed = auth.kind === 'signed-in';
  const [, force] = useReducer((x: number) => x + 1, 0);
  const signInRef = useRef<HTMLDivElement>(null);
  const ctl = useMemo(() => new PlayController(browserEnv(), {
    changed: force,
    onLadderResult: (r) => {
      void authFetch('/api/minpentai/ladder/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) })
        .then((res) => (res.ok ? res.json() : null))
        .then((p: LadderProgress | null) => { if (p) ctl.setState({ prog: p }); })
        .catch(() => {});
    },
    signIn: () => signInRef.current?.querySelector('button')?.click(),
    openLearn: () => onLearn(),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The device: the Farcaster frame inside the mini app, desktop at 768 px and wider, else a phone.
  const [inApp, setInApp] = useState(false);
  useEffect(() => { void inMiniApp().then(setInApp); }, []);
  useEffect(() => {
    const pick = () => ctl.setState({ dev: (inApp ? 'frame' : window.innerWidth >= 768 ? 'desk' : 'phone') as Dev });
    pick();
    window.addEventListener('resize', pick);
    return () => window.removeEventListener('resize', pick);
  }, [ctl, inApp]);
  // Where to start, and a free play link (#fp=…).
  useEffect(() => {
    if (start === 'free') ctl.openFree();
    else if (start === 'ladder') ctl.setState({ scr: 'ladder' });
    else if (start === 'person') ctl.setState({ scr: 'person' });
    ctl.mount(window.location.hash);
    const onK = (e: KeyboardEvent) => { if (e.key === 'Escape') ctl.escape(); };
    window.addEventListener('keydown', onK);
    return () => { window.removeEventListener('keydown', onK); ctl.dispose(); };
  }, [ctl, start]);
  // Signed in: the ladder's progress from the server.
  useEffect(() => {
    ctl.setState({ signed });
    if (!signed) { ctl.setState({ prog: { opened: 1, rec: {} } }); return; }
    void authFetch('/api/minpentai/ladder').then((r) => (r.ok ? r.json() : null)).then((p: LadderProgress | null) => { if (p) ctl.setState({ prog: p }); }).catch(() => {});
  }, [ctl, signed]);

  const v = ctl.view();
  const S = ctl.state;
  // Desktop full screen: the browser's own, where the host allows it; otherwise the frame fills the window.
  const frame = useRef<HTMLElement>(null);
  // The frame fills the screen below whatever sits above it (the top bar, and on a first visit the
  // "What is this?" link), so its footer is always in view.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => el.style.setProperty('--mp-top', `${Math.max(0, el.getBoundingClientRect().top + window.scrollY)}px`);
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(document.body);
    return () => ro?.disconnect();
  }, []);
  useEffect(() => {
    if (!v.desk) return;
    if (v.fs && frame.current && !document.fullscreenElement) frame.current.requestFullscreen?.().catch(() => {});
    if (!v.fs && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, [v.fs, v.desk]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement && ctl.state.fs && ctl.state.dev === 'desk') ctl.setState({ fs: false }); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [ctl]);

  // Design's desktop puts the board beside a 380 px panel; where the site's middle column (between the rail and
  // the assistant) is too narrow for that, the panel goes under the board, as on a phone.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => setNarrow(el.clientWidth < 900)) : null;
    ro?.observe(el);
    setNarrow(el.clientWidth < 900);
    return () => ro?.disconnect();
  }, []);
  const stack = v.desk && narrow && !v.fs;
  const L = stack ? { ...v.L, dir: 'column', bflex: 'none', bpad: '16px', pflex: '1', pw: '100%', pbl: '0' } : v.L;
  const rowLayout = L.dir === 'row';
  const boardLabel = `Minpentai board, ${v.strip.toLowerCase()}`;
  const cls = ['mp-play', v.desk ? 'is-desk' : 'is-phone', v.fs ? 'is-fs' : '', v.port ? 'is-port' : ''].filter(Boolean).join(' ');
  return (
    <section ref={frame} className={cls} aria-label="Minpentai Play">
      <div className="mp-play-sign" ref={signInRef} hidden><SignInButton label="Sign in" /></div>

      {v.sHome && (
        <div className="mp-col" style={{ maxWidth: L.colMax, borderLeft: L.colBd, borderRight: L.colBd }}>
          <div className="mp-tabs" role="tablist" aria-label="Minpentai">
            {v.tabs.map((t) => (
              <button key={t.label} role="tab" aria-selected={t.on} className={t.on ? 'on' : ''} onClick={t.click}>{t.label}</button>
            ))}
          </div>
          {v.tPlay && (
            <div className="mp-body mp-hub">
              <button className="mp-card" onClick={v.openPractice}>
                <span className="mp-card-head"><span className="mp-card-title">Practice match</span><span className="mp-label">ANYONE</span></span>
                <span className="mp-card-text">Against a simple rival. Nothing is saved.</span>
              </button>
              <button className="mp-card" onClick={v.openLadder}>
                <span className="mp-card-head"><span className="mp-card-title">The computer ladder</span><span className="mp-label">{v.ladTag}</span></span>
                <span className="mp-card-text">Five computer players, each harder. Beat one to open the next.</span>
              </button>
              <button className="mp-card" onClick={v.openPerson}>
                <span className="mp-card-head"><span className="mp-card-title">Play a person</span><span className="mp-label">{v.signed ? '' : 'SIGN IN'}</span></span>
                <span className="mp-card-text">One-on-one with another signed-in player.</span>
              </button>
              <div className="mp-grow" />
              <p className="mp-label mp-note">{TAG_INVENTED} · <Link href="/minpentai/rules">THE RULES PAGE →</Link></p>
            </div>
          )}
          {v.tLearn && (
            <div className="mp-body">
              <p className="mp-lead">Seven short lessons and the broadcast.</p>
              <button className="mp-btn" onClick={v.openLearn}>OPEN THE LESSONS →</button>
              <p className="mp-label mp-note">The lessons still play by the first version of the rules; the rules page notes what changes.</p>
            </div>
          )}
        </div>
      )}

      {v.sLadder && (
        <div className="mp-col" style={{ maxWidth: L.colMax, borderLeft: L.colBd, borderRight: L.colBd }}>
          <div className="mp-bar"><button className="mp-back" aria-label="Back to Play" onClick={v.goHome}>←</button><h2 className="mp-bar-title">The computer ladder</h2></div>
          {v.signed ? (
            <>
              <div className="mp-body">
                <p className="mp-text">Win once to open the next rung. Replay any rung you&apos;ve opened. Only you see this page.</p>
                <ol className="mp-rungs">
                  {v.rungs.map((r) => (
                    <li key={r.n}>
                      <button className={`mp-rung${r.open ? '' : ' closed'}${r.sel ? ' sel' : ''}`} onClick={r.click} aria-pressed={r.sel}>
                        <span className={`mp-rung-icon${r.sel && !r.won ? ' on' : ''}`}>{r.icon}</span>
                        <span className="mp-rung-main"><span className="mp-rung-name">{r.name}</span><span className="mp-rung-desc">{r.desc}</span></span>
                        <span className="mp-rung-rec"><span>{r.r1}</span><span>{r.r2}</span></span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mp-label mp-note">Every rung plays by the same rules and sees only what its towers light. Harder means better plans, never more information.</p>
              </div>
              <div className="mp-foot"><button className="mp-btn primary" onClick={v.playRung}>{v.playRungLabel}</button></div>
            </>
          ) : (
            <div className="mp-body">
              <div className="mp-signin">
                <p className="mp-signin-title">Sign in to climb</p>
                <p className="mp-text">The ladder remembers which rungs you&apos;ve beaten, under your Farcaster account. Only you can see it.</p>
                <SignInButton className="mp-btn primary" label="SIGN IN WITH FARCASTER" />
              </div>
              <ol className="mp-rungs-off" aria-label="The five rungs">
                {[5, 4, 3, 2, 1].map((n) => <li key={n}>{v.rungs.find((r) => r.n === n)!.name}</li>)}
              </ol>
              <div className="mp-grow" />
              <button className="mp-btn" onClick={v.openPractice}>PLAY A PRACTICE MATCH INSTEAD</button>
            </div>
          )}
        </div>
      )}

      {v.sPerson && <PlayPerson onBack={v.goHome} invite={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('invite') : null} />}

      {v.sBoard && (
        <div className="mp-boardscr">
          {v.hdrLight && !v.port && (
            <div className="mp-bar">
              {v.hasBack && <button className="mp-back" aria-label="Back" onClick={v.hBack}>←</button>}
              <h2 className="mp-bar-title" style={{ paddingLeft: v.hasBack ? 0 : 12 }}>{v.hTitle}</h2>
              {v.hasRight && <button className="mp-right" onClick={v.hRightClick} aria-label={v.hRight === '···' ? 'Match menu' : 'Board options'} aria-haspopup="dialog">{v.hRight}</button>}
            </div>
          )}
          {v.hdrDark && (
            <div className="mp-fsbar">
              <button onClick={v.exitFS}>✕ EXIT FULL SCREEN · ESC</button>
              <span className="mp-fsbar-mid">{v.hTitleCaps} · {v.strip}</span>
              <button onClick={v.togglePanel}>{v.panelLabel}</button>
              {v.hasRight && <button onClick={v.hRightClick} aria-label="Match menu">{v.hRight}</button>}
            </div>
          )}
          {v.port ? (
            <div className="mp-port">
              <div className="mp-port-bar">
                <button className="mp-back" aria-label="Exit full screen" onClick={v.exitFS}>✕</button>
                <span className="mp-port-strip">{v.strip}</span>
                <button className="mp-back" aria-label={v.pFree ? 'Board options' : 'Match menu'} onClick={v.hRightClick}>{v.fsRight}</button>
              </div>
              <div className="mp-port-board"><PlayBoard bd={v.bd} label={boardLabel} fitHeight /></div>
              <div className="mp-port-ctl">
                {v.pAct && (
                  <>
                    {v.pieces.map((p) => <button key={p.short} className={`mp-fsbtn${p.on ? ' on' : ''}`} aria-pressed={p.on} onClick={p.click}>{p.short}</button>)}
                    <span className="mp-port-pts">{v.ptsShort}</span>
                    <button className="mp-fsbtn end" onClick={v.endTurn}>END TURN</button>
                  </>
                )}
                {v.pRun && (
                  <>
                    <span className="mp-port-pts">{v.runHead}</span>
                    <button className="mp-fsbtn" onClick={v.ffClick}>{v.ffShort}</button>
                  </>
                )}
                {v.pFree && v.fpBtnsFS!.map((b, i) => <button key={i} className="mp-fsbtn flex" onClick={b.click}>{b.label}</button>)}
              </div>
            </div>
          ) : (
            <div className="mp-split" style={{ flexDirection: L.dir as 'row' | 'column' }}>
              <div className="mp-boardarea" style={{ flex: L.bflex, padding: L.bpad }}>
                <PlayBoard bd={v.bd} label={boardLabel} fitHeight={rowLayout}>
                  {v.hdrLight && <div className="mp-strip" aria-hidden="true">{v.strip}</div>}
                  {v.fsBtn && <button className="mp-fsgo" title="Full screen" aria-label="Full screen" onClick={v.enterFS}>⤢</button>}
                </PlayBoard>
              </div>
              {v.panelOn && (
                <div className="mp-panel" style={{ flex: L.pflex, width: L.pw, borderLeft: L.pbl }}>
                  {v.pStart && (
                    <>
                      <div className="mp-body">
                        <p className="mp-label">HOW IT PLAYS</p>
                        <p className="mp-text big">{v.stDesc}</p>
                        <div className="mp-rule"><span className="mp-label">NEW RULE THIS MATCH, DRAWN AT RANDOM</span><span className="mp-rule-text">{v.ruleText}</span></div>
                        <p className="mp-text">{v.stNote}</p>
                        <div className="mp-grow" />
                        <div className="mp-tags"><span className="mp-tag dashed">{TAG_INVENTED}</span><span className="mp-tag">A NEW RULE EACH MATCH · c4-b84</span></div>
                      </div>
                      <div className="mp-foot"><button className="mp-btn primary" onClick={v.begin}>START MATCH</button></div>
                    </>
                  )}
                  {v.pAct && (
                    <>
                      <div className="mp-palette">
                        <div className="mp-pieces" role="group" aria-label="What to place">
                          {v.pieces.map((p) => <button key={p.label} className={`mp-btn small${p.on ? ' primary' : ''}`} aria-pressed={p.on} onClick={p.click}>{p.label}</button>)}
                        </div>
                        <div className={`mp-arrows${v.arrows.length > 4 ? ' eight' : ''}`} role="group" aria-label="Glider direction">
                          {v.arrows.map((a) => <button key={a.t} className={`mp-arrow${a.on ? ' on' : ''}`} aria-pressed={a.on} onClick={a.click}>{a.t}</button>)}
                        </div>
                      </div>
                      <div className="mp-body tight">
                        <p className="mp-text big" aria-live="polite">{v.msg}</p>
                        <p className="mp-label">{v.ruleLine}</p>
                        <div className="mp-tags"><span className="mp-tag dashed">{TAG_INVENTED}</span><span className="mp-tag dashed">DRAFT WORDING</span></div>
                      </div>
                      <div className="mp-foot row"><span className="mp-label mp-pts">{v.ptsTxt}</span><button className="mp-btn primary flex" onClick={v.endTurn}>{v.endLabel}</button></div>
                    </>
                  )}
                  {v.pRun && (
                    <>
                      <div className="mp-body">
                        <p className="mp-label ink">THE RUN · {v.runHead}</p>
                        <p className="mp-text big">{v.runMsg}</p>
                        <p className="mp-label">{v.ruleLine}</p>
                      </div>
                      <div className="mp-foot"><button className="mp-btn" onClick={v.ffClick}>{v.ffLabel}</button></div>
                    </>
                  )}
                  {v.pResult && (
                    <div className="mp-body">
                      <p className="mp-result" aria-live="polite">{v.resB}</p>
                      <p className="mp-text big">{v.resWhy}</p>
                      {v.resCard && (
                        <div className="mp-opened"><span className="mp-rung-icon on">{v.resCardN}</span><span className="mp-rung-main"><span className="mp-rung-name">{v.resCardT}</span><span className="mp-rung-desc">{v.resCardD}</span></span></div>
                      )}
                      {v.resNote && <p className="mp-text">{v.resNote}</p>}
                      <div className="mp-grow" />
                      <div className="mp-btns">{v.resBtns!.map((b) => <button key={b.label} className={`mp-btn${b.primary ? ' primary' : ''}`} onClick={b.click}>{b.label}</button>)}</div>
                    </div>
                  )}
                  {v.pReplay && (
                    <>
                      <div className="mp-four">{v.rpBtns!.map((b) => <button key={b.label} className="mp-btn small quiet" onClick={b.click}>{b.label}</button>)}</div>
                      <p className="mp-body mp-text">The whole board, steps 0 to {v.rpEnd}, as anyone watching would see it. During the match neither player could.</p>
                      <div className="mp-foot"><button className="mp-btn primary" onClick={v.rpDone}>DONE</button></div>
                    </>
                  )}
                  {v.pFree && (
                    <>
                      <div className="mp-four">{v.fpBtns!.map((b) => <button key={b.label} className="mp-btn small quiet" onClick={b.click}>{b.label}</button>)}</div>
                      <div className="mp-palette">
                        <p className="mp-label">PLACE FOR</p>
                        <div className="mp-three" role="group" aria-label="Place for">
                          {v.fpSides!.map((b) => <button key={b.label} className={`mp-btn small${b.on ? ' primary' : ''}`} aria-pressed={b.on} onClick={b.click}><span className="mp-swatch" style={{ background: b.sw }} />{b.label}</button>)}
                        </div>
                        <div className="mp-four" role="group" aria-label="Piece">
                          {v.fpPieces!.map((b) => <button key={b.label} className={`mp-btn small${b.on ? ' primary' : ''}`} aria-pressed={b.on} onClick={b.click}>{b.label}</button>)}
                        </div>
                        <div className={`mp-arrows${v.arrows.length > 4 ? ' eight' : ''}`} role="group" aria-label="Glider direction">
                          {v.arrows.map((a) => <button key={a.t} className={`mp-arrow${a.on ? ' on' : ''}`} aria-pressed={a.on} onClick={a.click}>{a.t}</button>)}
                        </div>
                      </div>
                      <p className="mp-body mp-text">No points, no turns to act, nothing scored. Placing is allowed at step 0 only; tap a piece with the same tool to remove it.</p>
                      <div className="mp-tags pad"><span className="mp-tag dashed">{TAG_INVENTED}</span><Link className="mp-tag" href="/minpentai/rule">THE BOOK&apos;S CELL RULE: UNDER THE HOOD</Link></div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {v.sheetOn && (
        <>
          <div className="mp-scrim" onClick={v.closeSheet} />
          <div className="mp-sheet" role="dialog" aria-modal="true" aria-label={v.shMenu ? 'Match menu' : v.shResign ? 'Resign' : v.shLeave ? 'Leave' : 'Board options'}>
            {v.shMenu && (
              <>
                <div className="mp-menu">
                  <button onClick={v.askResign}>Resign</button>
                  <Link href="/minpentai/rules" target="_blank">The rules page ↗</Link>
                  <button onClick={v.askLeave}>{v.leaveLabel}</button>
                </div>
                <button className="mp-btn" onClick={v.closeSheet}>CLOSE</button>
              </>
            )}
            {v.shResign && (
              <>
                <p className="mp-sheet-title">Resign this match?</p>
                <p className="mp-text">{v.resignText}</p>
                <button className="mp-btn warn" onClick={v.resign}>RESIGN</button>
                <button className="mp-btn" onClick={v.closeSheet}>KEEP PLAYING</button>
              </>
            )}
            {v.shLeave && (
              <>
                <p className="mp-sheet-title">{v.leaveTitle}</p>
                <p className="mp-text">{v.leaveText}</p>
                <button className="mp-btn warn" onClick={v.leave}>LEAVE</button>
                <button className="mp-btn" onClick={v.closeSheet}>STAY</button>
              </>
            )}
            {v.shOpts && (
              <>
                <div className="mp-opt"><p className="mp-label">START FROM</p>
                  <div className="mp-two">{v.fpStarts!.map((b) => <button key={b.label} className={`mp-btn small left${b.ok ? '' : ' off'}`} onClick={b.click}>{b.label}</button>)}</div>
                </div>
                <div className="mp-opt"><p className="mp-label">NEW RULES · ANY NUMBER</p>
                  <div className="mp-toggles">{v.fpRules!.map((b) => (
                    <button key={b.label} className="mp-toggle" aria-pressed={b.on} onClick={b.click}><span>{b.label}</span><span className={`mp-onoff${b.on ? ' on' : ''}`}>{b.v}</span></button>
                  ))}</div>
                </div>
                <div className="mp-opt"><p className="mp-label">SEE AS</p>
                  <div className="mp-seg" role="group" aria-label="See as">{v.fpSee!.map((b) => <button key={b.label} className={b.on ? 'on' : ''} aria-pressed={b.on} onClick={b.click}>{b.label}</button>)}</div>
                </div>
                <button className="mp-btn" onClick={v.copyLink}>COPY A LINK TO THIS BOARD</button>
                <p className="mp-label center">The link holds the board. Nothing is stored on our side.</p>
              </>
            )}
          </div>
        </>
      )}

      {v.toastOn && <div className="mp-toast" role="status">{v.toast}</div>}
      {S.scr === 'home' && <span hidden>{auth.kind}</span>}
    </section>
  );
}
