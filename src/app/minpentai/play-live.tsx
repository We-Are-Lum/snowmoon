'use client';

/**
 * One-on-one (Design's "Minpentai Play" D1–D8; owner, 2026-10-09: "Both. With queue showing people
 * by username and pick who you want to play. Farcaster login only for playing other players").
 *
 * - The lobby: say you are ready; see the other ready players by Farcaster username and pick one;
 *   they have 20 seconds to accept. Or send one person a link (one use, 24 hours). Block anyone,
 *   for good. No rating, no ranking, no chat.
 * - The match runs on the server (src/lib/minpentai/play-server/); this page only sends your
 *   placements on your turn to act and only receives what your towers light. It asks every
 *   1.5 seconds whether anything changed (/api/minpentai/match/:id?v=…, 204 when not).
 * - You are always Cyan, on the left, as in Design: when the server has you as Amber, the board is
 *   turned half way round (it is point-symmetric) and the colours swapped, for drawing only.
 *
 * Words are Design's where Design's screens have them (D1–D8); the rest is draft.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, webNameProof } from '~/lib/client-auth';
import { SignInButton } from '~/components/sign-in';
import { AR, COST, D4, D8, H, K, MAXS, RULES, W, empty, fmt, inb, lit, world, type Piece, type Side, type World } from '~/lib/minpentai/play-game/game';
import { board } from '~/lib/minpentai/play-game/board';
import type { BoardView, LobbyView, MatchView, Person } from '~/lib/minpentai/play-game/live-types';
import { PlayBoard } from './play-board';

const TAG_INVENTED = 'RULES INVENTED FOR THIS EDITION';
const post = (url: string, b?: unknown) => authFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
async function json<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || 'Something went wrong');
  return j as T;
}

/* ---------------- you are always Cyan ---------------- */
const flipK = (k: number) => K(W - 1 - (k % W), H - 1 - ((k / W) | 0));
const swap = (o: Side): Side => (o === 'C' ? 'A' : 'C');
/** A board view as a World, drawn with you as Cyan on the left. */
export function toWorld(b: BoardView, flip: boolean): World {
  const w = world(true);
  const k = (n: number) => (flip ? flipK(n) : n), o = (s: Side) => (flip ? swap(s) : s);
  w.step = b.step;
  b.rock.forEach((n) => (w.rock[k(n)] = 1));
  b.tw.forEach(([n, s]) => (w.tw[k(n)] = o(s)));
  b.sq.forEach(([n, s, hp]) => (w.sq[k(n)] = { o: o(s), hp }));
  b.gl.forEach(([x, y, dx, dy, s], i) => w.gl.push(flip ? { id: i + 1, o: o(s), x: W - 1 - x, y: H - 1 - y, dx: -dx, dy: -dy } : { id: i + 1, o: s, x, y, dx, dy }));
  w.flash = b.flash.map(k);
  return w;
}
type Mine = { t: Piece; x: number; y: number; dx: number; dy: number };
const flipP = (p: Mine): Mine => ({ ...p, x: W - 1 - p.x, y: H - 1 - p.y, dx: -p.dx, dy: -p.dy });

/* ---------------- the lobby ---------------- */
export function PlayPerson({ onBack, invite: inviteToken }: { onBack: () => void; invite?: string | null }) {
  const auth = useAuth();
  const signed = auth.kind === 'signed-in';
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [inv, setInv] = useState<{ token: string; from?: Person; open?: boolean } | null>(inviteToken ? { token: inviteToken } : null);
  const [myLink, setMyLink] = useState<string | null>(null);
  const [blockAsk, setBlockAsk] = useState<Person | null>(null);
  const got = useRef(0);
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2800); };
  const proof = () => ({ nameProof: webNameProof() });

  const lobbyQuiet = useRef(0);
  const refresh = useCallback(async () => {
    if (Date.now() < lobbyQuiet.current) return;
    try {
      const res = await authFetch('/api/minpentai/lobby');
      if (res.status === 429) { const j = (await res.json().catch(() => ({}))) as { retryAfterMs?: number }; lobbyQuiet.current = Date.now() + (j.retryAfterMs ?? 3000); return; }
      const l = await json<LobbyView>(res);
      got.current = Date.now();
      setLobby(l);
      setErr(null);
      if (l.match) setMatchId(l.match.id);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!signed || matchId) return;
    void refresh();
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    return () => window.clearInterval(id);
  }, [signed, matchId, refresh]);
  // Stay on the list while ready: say so again every 2 minutes (the server keeps you 3).
  useEffect(() => {
    if (!lobby?.me.ready || matchId) return;
    const id = window.setInterval(() => { void post('/api/minpentai/lobby/ready', { nameProof: webNameProof() }).catch(() => {}); }, 120000);
    return () => window.clearInterval(id);
  }, [lobby?.me.ready, matchId]);
  // An invite link: who sent it.
  useEffect(() => {
    if (!signed || !inv || inv.from) return;
    void authFetch(`/api/minpentai/invite/${inv.token}`).then((r) => json<{ from: Person; open: boolean }>(r)).then((x) => setInv({ ...inv, ...x })).catch((e) => setErr((e as Error).message));
  }, [signed, inv]);
  // Clocks between polls.
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 250); return () => window.clearInterval(id); }, []);
  const left = (ms: number) => Math.max(0, ms - (Date.now() - got.current));

  const act = async (f: () => Promise<Response>, ok?: (j: unknown) => void) => {
    try {
      const j = await json<unknown>(await f());
      ok?.(j);
      if (j && typeof j === 'object' && 'me' in (j as object)) { got.current = Date.now(); setLobby(j as LobbyView); } else void refresh();
    } catch (e) { say((e as Error).message); }
  };

  if (matchId) return <LiveMatch key={matchId} id={matchId} onDone={() => { setMatchId(null); void refresh(); }} onMatch={setMatchId} />;

  const incoming = lobby?.incoming[0];
  return (
    <div className="mp-col">
      <div className="mp-bar"><button className="mp-back" aria-label="Back to Play" onClick={onBack}>←</button><h2 className="mp-bar-title">Play a person</h2></div>
      {!signed ? (
        <div className="mp-body">
          <div className="mp-signin">
            <p className="mp-signin-title">Sign in to play a person</p>
            <p className="mp-text">Your opponent sees your Farcaster name. No one else sees the match.</p>
            <SignInButton className="mp-btn primary" label="SIGN IN WITH FARCASTER" />
          </div>
        </div>
      ) : inv && inv.from ? (
        <>
          <div className="mp-body">
            <p className="mp-label">AN INVITE</p>
            <p className="mp-lead">@{inv.from.username} invited you to a match.</p>
            <p className="mp-text">{inv.open ? 'You both see the same new rule at the same moment. Your Farcaster name is shown to them, and only to them.' : 'This invite has been used or has run out.'}</p>
          </div>
          <div className="mp-foot">
            {inv.open && <button className="mp-btn primary" onClick={() => act(() => post(`/api/minpentai/invite/${inv.token}/accept`, proof()), (j) => setMatchId((j as { matchId: string }).matchId))}>ACCEPT</button>}
            <button className="mp-btn" onClick={() => setInv(null)}>{inv.open ? 'NOT NOW' : 'OK'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="mp-body">
            <p className="mp-lead">Say you&apos;re ready, then pick someone who is ready too. You both see the same new rule at the same moment.</p>
            <dl className="mp-facts">
              <dt>BOARD</dt><dd>15 × 10, 2 towers each, 96 steps</dd>
              <dt>TIME</dt><dd>90 s to set up, 45 s each turn to act</dd>
              <dt>LENGTH</dt><dd>About 8 minutes</dd>
              <dt>SHOWN</dt><dd>Your Farcaster name, to signed-in players who are ready, and to your opponent</dd>
            </dl>
            <p className="mp-label">NO RATING, NO RANKING. RESULTS ARE KEPT FOR THE TWO PLAYERS ONLY.</p>
            {err && <p className="mp-text" role="alert">{err}</p>}
            {lobby?.me.ready && (
              <div className="mp-ready">
                <p className="mp-label ink">READY NOW{lobby.ready.length ? ` · ${lobby.ready.length}` : ''}</p>
                {lobby.ready.length === 0 ? (
                  <p className="mp-text">No one else is ready yet. You can leave this screen; you stay on the list for 3 minutes.</p>
                ) : (
                  <ul className="mp-people">
                    {lobby.ready.map((p) => (
                      <li key={p.fid}>
                        <span className="mp-person">@{p.username}</span>
                        <button className="mp-btn small" disabled={!!lobby.outgoing} onClick={() => act(() => post('/api/minpentai/challenge', { toFid: p.fid }))}>PLAY</button>
                        <button className="mp-quietbtn" aria-label={`Block @${p.username}`} onClick={() => setBlockAsk(p)}>BLOCK</button>
                      </li>
                    ))}
                  </ul>
                )}
                {lobby.outgoing && (
                  <div className="mp-outgoing">
                    <p className="mp-text">Asked @{lobby.outgoing.to.username}. Waiting for an answer · <span className="mp-label">{fmt(left(lobby.outgoing.msLeft))}</span></p>
                    <button className="mp-btn small" onClick={() => act(() => post(`/api/minpentai/challenge/${lobby.outgoing!.id}/decline`))}>TAKE IT BACK</button>
                  </div>
                )}
              </div>
            )}
            <div className="mp-grow" />
            <button className="mp-btn" onClick={() => act(() => post('/api/minpentai/invite', proof()), (j) => {
              const url = `${window.location.origin}/minpentai?invite=${(j as { token: string }).token}`;
              setMyLink(url);
              try { void navigator.clipboard.writeText(url); say('Link copied. The first person who opens it and accepts plays you.'); } catch { /* shown below */ }
            })}>OR SEND ONE PERSON A LINK</button>
            {myLink && <p className="mp-label">Your link, one use, 24 hours: <span className="mp-link-text">{myLink}</span>. Anyone who sees it can take it.</p>}
          </div>
          <div className="mp-foot">
            {lobby?.me.ready
              ? <button className="mp-btn" onClick={() => act(() => authFetch('/api/minpentai/lobby/ready', { method: 'DELETE' }))}>I&apos;M NOT READY</button>
              : <button className="mp-btn primary" onClick={() => act(() => post('/api/minpentai/lobby/ready', proof()))}>I&apos;M READY</button>}
            <p className="mp-label center">Signed in as {lobby?.me.username ? `@${lobby.me.username}` : auth.kind === 'signed-in' && auth.username ? `@${auth.username}` : 'you'}</p>
          </div>
        </>
      )}

      {incoming && (
        <>
          <div className="mp-scrim" />
          <div className="mp-sheet" role="alertdialog" aria-modal="true" aria-label="A match is offered">
            <p className="mp-label">@{incoming.from.username.toUpperCase()} WANTS TO PLAY · {fmt(left(incoming.msLeft))}</p>
            <p className="mp-sheet-title">Accept the match?</p>
            <p className="mp-text">Not answering in time turns it down.</p>
            <button className="mp-btn primary" onClick={() => act(() => post(`/api/minpentai/challenge/${incoming.id}/accept`), (j) => setMatchId((j as { matchId: string }).matchId))}>ACCEPT</button>
            <button className="mp-btn" onClick={() => act(() => post(`/api/minpentai/challenge/${incoming.id}/decline`))}>NOT NOW</button>
            <button className="mp-quietbtn" onClick={() => setBlockAsk(incoming.from)}>BLOCK @{incoming.from.username.toUpperCase()}</button>
          </div>
        </>
      )}
      {blockAsk && (
        <>
          <div className="mp-scrim" onClick={() => setBlockAsk(null)} />
          <div className="mp-sheet" role="dialog" aria-modal="true" aria-label="Block">
            <p className="mp-sheet-title">Block @{blockAsk.username}?</p>
            <p className="mp-text">You won&apos;t see each other in the list again, and neither of you can ask the other to play. They aren&apos;t told.</p>
            <button className="mp-btn warn" onClick={() => { const p = blockAsk; setBlockAsk(null); void act(() => post('/api/minpentai/block', { fid: p.fid }), () => say(`@${p.username} is blocked.`)); }}>BLOCK</button>
            <button className="mp-btn" onClick={() => setBlockAsk(null)}>CANCEL</button>
          </div>
        </>
      )}
      {toast && <div className="mp-toast" role="status">{toast}</div>}
    </div>
  );
}

/* ---------------- the match ---------------- */
function LiveMatch({ id, onDone, onMatch }: { id: string; onDone: () => void; onMatch: (id: string) => void }) {
  const [m, setM] = useState<MatchView | null>(null);
  const [got, setGot] = useState(0);
  const [begun, setBegun] = useState(false);
  const [frameAt, setFrameAt] = useState<number | null>(null);
  const [piece, setPiece] = useState<Piece>('g');
  const [dir, setDir] = useState<[number, number]>([1, 0]);
  const [sheet, setSheet] = useState<null | 'menu' | 'resign' | 'leave'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ i: number; playing: boolean } | null>(null);
  const [fs, setFs] = useState(false);
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2800); };
  const vRef = useRef<number | null>(null);
  const stepRef = useRef<number | null>(null);
  const take = useCallback((x: MatchView) => {
    // A new run (the board moved on): play its frames before the next turn to act shows.
    if (x.frames.length > 1 && stepRef.current !== null && x.board.step !== stepRef.current) setFrameAt(0);
    stepRef.current = x.board.step;
    vRef.current = x.version;
    setM(x);
    setGot(Date.now());
  }, []);
  // The server answers a match view at most once a second (and caps requests per person and per day):
  // when it says wait, wait that long before asking again.
  const quietUntil = useRef(0);
  const poll = useCallback(async () => {
    if (Date.now() < quietUntil.current) return;
    const r = await authFetch(`/api/minpentai/match/${id}${vRef.current !== null ? `?v=${vRef.current}` : ''}`).catch(() => null);
    if (!r || r.status === 204) return;
    if (r.status === 429) { const j = (await r.json().catch(() => ({}))) as { retryAfterMs?: number }; quietUntil.current = Date.now() + (j.retryAfterMs ?? 2000); return; }
    if (r.ok) take(await r.json());
  }, [id, take]);
  useEffect(() => {
    void poll();
    const t = window.setInterval(() => { if (!document.hidden) void poll(); }, 1500);
    return () => window.clearInterval(t);
  }, [poll]);
  // The run's frames, 170 ms a step (Design's).
  useEffect(() => {
    if (frameAt === null || !m) return;
    if (frameAt >= m.frames.length - 1) { setFrameAt(null); return; }
    const t = window.setTimeout(() => setFrameAt((f) => (f === null ? f : f + 1)), 170);
    return () => window.clearTimeout(t);
  }, [frameAt, m]);
  useEffect(() => {
    if (!replay?.playing || !m?.result) return;
    if (replay.i >= m.result.replay.length - 1) { setReplay({ ...replay, playing: false }); return; }
    const t = window.setTimeout(() => setReplay((r) => (r ? { ...r, i: r.i + 1 } : r)), 110);
    return () => window.clearTimeout(t);
  }, [replay, m]);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 250); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    const onK = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (sheet) setSheet(null); else setFs(false); } };
    window.addEventListener('keydown', onK);
    return () => window.removeEventListener('keydown', onK);
  }, [sheet]);
  // The run's playback is over and the clock is on the next turn to act: the server only changes the
  // phase by the clock (no new version), so ask for the whole view again.
  useEffect(() => {
    if (!m || m.phase !== 'run' || frameAt !== null || m.msLeft === null) return;
    const wait = Math.max(0, m.msLeft - (Date.now() - got) - 45000) + 150;
    const t = window.setTimeout(() => { vRef.current = null; void poll(); }, wait);
    return () => window.clearTimeout(t);
  }, [m, frameAt, got, poll]);
  // A rematch both pressed: go to it.
  useEffect(() => { const r = m?.result?.rematch.matchId; if (r && r !== id) onMatch(r); }, [m, id, onMatch]);

  const flip = m?.you === 'A';
  const mineDrawn = useMemo(() => (m ? m.mine.map((p) => (flip ? flipP(p) : p)) : []), [m, flip]);
  const send = async (url: string, b?: unknown) => {
    try {
      const r = await post(url, b);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { say((j as { error?: string }).error || 'Something went wrong'); void poll(); return; }
      take(j as MatchView);
    } catch { say('Not sent. Check your connection.'); }
  };
  if (!m) return <div className="mp-col"><div className="mp-bar"><h2 className="mp-bar-title" style={{ paddingLeft: 12 }}>Play a person</h2></div><div className="mp-body"><p className="mp-text">Opening the match…</p></div></div>;

  const opp = m.opponent.username;
  const msLeft = m.msLeft === null ? null : Math.max(0, m.msLeft - (Date.now() - got));
  const playing = frameAt !== null && m.frames.length > 1;
  const over = m.phase === 'over' && !playing;
  const phase: 'act' | 'run' | 'over' = over ? 'over' : playing || m.phase === 'run' || m.phase === 'paused' ? 'run' : 'act';
  const R = m.R, cost = m.cost, dirs = m.rule === 'diag' ? D8 : D4;
  const r = m.result;
  const shownView = playing ? m.frames[frameAt!] : replay && r ? r.replay[replay.i] : over && r && r.replay.length ? r.replay[r.replay.length - 1] : m.board;
  const now = toWorld(shownView, flip);
  const snap = m.snap.map((k) => (flip ? flipK(k) : k));
  const ls: Record<number, number> = {};
  Object.entries(m.lastSeen).forEach(([k, s]) => (ls[flip ? flipK(+k) : +k] = s));
  const act = phase === 'act' && !m.paused;
  const setup = m.board.step === 0 && phase === 'act';
  const showMatched = setup && !begun;
  const pts = 8 - mineDrawn.reduce((s, p) => s + (p.t === 'g' ? cost : COST[p.t]), 0);
  const nextAt = (Math.floor(m.board.step / m.every) + 1) * m.every;
  const vis = lit(now, 'C', R);
  const pend = act ? mineDrawn.map((p) => ({ ...p, o: 'C' as Side })) : [];
  const dots = new Set<number>();
  pend.forEach((p) => { if (p.t !== 'g') return; let x = p.x + p.dx, y = p.y + p.dy, n = 0; while (inb(x, y) && n < 14 && vis.has(K(x, y)) && empty(now, K(x, y)) && !pend.some((q) => q.x === x && q.y === y)) { dots.add(K(x, y)); x += p.dx; y += p.dy; n++; } });
  const port = fs && typeof window !== 'undefined' && window.innerWidth < 768;
  const placeTurn = (list: Mine[], ended: boolean) => send(`/api/minpentai/match/${id}/turn`, { placements: list.map((p) => (flip ? flipP(p) : p)), ended });
  const onCell = (x: number, y: number) => {
    if (over || showMatched || m.paused) return;
    if (phase === 'run') { say(nextAt >= MAXS ? 'Your last turn to act is over. The match ends at step 96.' : `Your turn to act is over. The next one is at step ${nextAt}.`); return; }
    if (!act) return;
    const k = K(x, y);
    const i = mineDrawn.findIndex((p) => K(p.x, p.y) === k);
    if (i >= 0) { void placeTurn(mineDrawn.filter((_, j) => j !== i), false); return; }
    if (m.ended) { say('Tap CHANGE MY TURN to place more.'); return; }
    if (!lit(now, 'C', R, snap).has(k)) { say(`Place in the lit area: within ${R} squares of a tower you had when this turn began.`); return; }
    if (!empty(now, k)) { say('That square is taken.'); return; }
    const c = piece === 'g' ? cost : COST[piece];
    if (pts < c) { say('Not enough points left this turn.'); return; }
    const p: Mine = piece === 'g' ? { t: 'g', x, y, dx: dir[0], dy: dir[1] } : { t: piece, x, y, dx: 0, dy: 0 };
    void placeTurn([...mineDrawn, p], false);
  };
  const chooseDir = (d: [number, number]) => {
    setDir(d);
    const last = [...mineDrawn].reverse().find((p) => p.t === 'g');
    if (act && last && !m.ended) void placeTurn(mineDrawn.map((p) => (p === last ? { ...p, dx: d[0], dy: d[1] } : p)), false);
  };
  const lightAll = new Set([...lit(now, 'C', R)].filter((k) => empty(now, k)));
  const zone = showMatched ? lightAll : act && !m.ended ? new Set([...lit(now, 'C', R, snap)].filter((k) => empty(now, k))) : null;
  const whole = over || !!replay;
  const bd = board({ w: now, cs: port ? 36 : 26, portrait: port, fog: whole ? null : 'C', R, zone, pend, dots, ls: whole ? undefined : ls, flash: playing || !!replay, dirs, onCell });
  const seen = Object.entries(now.tw).filter(([k, o]) => o === 'A' && vis.has(+k)).length;
  const minesN = Object.values(now.tw).filter((o) => o === 'C').length;
  const strip = m.paused ? `STEP ${now.step} · PAUSED` : whole ? `STEP ${now.step} · WHOLE BOARD SHOWN` : showMatched ? 'SETUP · CYAN 2 · AMBER 0 SEEN' : `STEP ${now.step} · CYAN ${minesN} · AMBER ${seen} SEEN`;
  const ruleLine = `NEW RULE THIS MATCH: ${RULES[m.rule].toUpperCase().replace(/\.$/, '')}${act && msLeft !== null ? ` · ${fmt(msLeft)} LEFT` : ''}`;
  const pieces: [Piece, string, string, number][] = [['g', 'GLIDER', 'GLIDER', cost], ['s', 'SQUARE', 'SQ', 1], ['t', 'TOWER', 'TWR', 4]];
  const winMe = r && r.win !== 'D' && (flip ? swap(r.win) : r.win) === 'C';
  const arrowOrder: [number, number][] = dirs === D8 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [0, -1], [0, 1], [1, 0]];
  const rematchLeft = r ? Math.max(0, r.rematch.msLeft - (Date.now() - got)) : 0;

  const panel = (
    <>
      {showMatched && (
        <>
          <div className="mp-body">
            <div className="mp-two">
              <div className="mp-who"><span className="mp-label ink"><span className="mp-swatch" style={{ background: '#46D7E8' }} /> CYAN · YOU</span></div>
              <div className="mp-who"><span className="mp-label ink"><span className="mp-swatch" style={{ background: '#FFB43A' }} /> AMBER</span><span className="mp-who-name">@{opp}</span></div>
            </div>
            <div className="mp-rule"><span className="mp-label">NEW RULE THIS MATCH, DRAWN AT RANDOM</span><span className="mp-rule-text">{RULES[m.rule]}</span></div>
            <p className="mp-text">Setup: 90 seconds to place in the lit area. Then the battle runs.</p>
            <div className="mp-grow" />
            <div className="mp-tags"><span className="mp-tag">COUNTDOWN FROM THE BOOK · c4-b97–b98</span><span className="mp-tag dashed">RULES INVENTED</span></div>
          </div>
          <div className="mp-foot"><button className="mp-btn primary" onClick={() => setBegun(true)}>START SETUP · {fmt(msLeft ?? 0)}</button></div>
        </>
      )}
      {!showMatched && act && (
        <div className="mp-clockbar" aria-hidden="true"><div style={{ width: `${msLeft === null ? 0 : Math.min(100, (msLeft / (m.board.step === 0 ? 90000 : 45000)) * 100)}%` }} /></div>
      )}
      {!showMatched && act && !m.ended && (
        <>
          <div className="mp-palette">
            <div className="mp-pieces" role="group" aria-label="What to place">{pieces.map(([p2, n1, , c]) => <button key={p2} className={`mp-btn small${piece === p2 ? ' primary' : ''}`} aria-pressed={piece === p2} onClick={() => setPiece(p2)}>{n1} · {c}</button>)}</div>
            <div className={`mp-arrows${arrowOrder.length > 4 ? ' eight' : ''}`} role="group" aria-label="Glider direction">{arrowOrder.map((d) => { const on = dir[0] === d[0] && dir[1] === d[1]; return <button key={d.join()} className={`mp-arrow${on ? ' on' : ''}`} aria-pressed={on} onClick={() => chooseDir(d)}>{AR[d.join(',')]}</button>; })}</div>
          </div>
          <div className="mp-body tight">
            <p className="mp-text big" aria-live="polite">{m.board.step === 0 ? 'Setup. Spend 8 points in the lit area near your towers. Nothing moves until you end your turn or the clock runs out; then both sides’ pieces appear at once.' : mineDrawn.length ? `Placed: ${mineDrawn.map((p) => (p.t === 'g' ? 'glider' : p.t === 's' ? 'square' : 'tower')).join(', ')}. The dotted line is your glider's path until it leaves your sight. Tap a piece to take it back.` : `${seen ? 'Your turn. ' : `Your turn. You can't see @${opp}'s towers now; the outlines are where you last saw them. `}Spend 8 points in the lit area, then end your turn. Tap a piece you placed to take it back.`}</p>
            <p className="mp-label">{ruleLine}</p>
            <div className="mp-tags"><span className="mp-tag dashed">{TAG_INVENTED}</span><span className="mp-tag dashed">DRAFT WORDING</span></div>
          </div>
          <div className="mp-foot row"><span className="mp-label mp-pts">{pts} OF 8 PTS LEFT</span><button className="mp-btn primary flex" onClick={() => placeTurn(mineDrawn, true)}>END TURN</button></div>
        </>
      )}
      {!showMatched && act && m.ended && (
        <>
          <div className="mp-body">
            <p className="mp-label ink">TURN ENDED · WAITING FOR @{opp.toUpperCase()} · {fmt(msLeft ?? 0)}</p>
            <p className="mp-text big">{mineDrawn.length ? 'Your pieces are placed. They appear for both of you when the run starts. Tap one to take it back while the clock runs.' : `You placed nothing this turn. The run starts when @${opp} ends theirs or the clock runs out.`}</p>
            <p className="mp-label">{ruleLine}</p>
          </div>
          <div className="mp-foot"><button className="mp-btn" onClick={() => placeTurn(mineDrawn, false)}>CHANGE MY TURN</button></div>
        </>
      )}
      {phase === 'run' && (
        <>
          <div className="mp-body">
            <p className="mp-label ink">THE RUN · {nextAt >= MAXS ? 'NO MORE TURNS · ENDS AT STEP 96' : `NEXT TURN AT STEP ${nextAt}`}</p>
            <p className="mp-text big">{m.paused ? "The match is paused for both of you. If they're not back in 60 seconds, it counts as resigning and you win." : 'Steps move on their own. You see only what your towers light; a white flash is a hit.'}</p>
            <p className="mp-label">{ruleLine}</p>
          </div>
          <div className="mp-foot"><button className="mp-btn quiet" disabled>{m.paused ? 'PAUSED' : 'RUNNING'}</button></div>
        </>
      )}
      {over && r && !replay && (
        <div className="mp-body">
          <p className="mp-result" aria-live="polite">{r.win === 'D' ? 'Draw' : winMe ? 'You win' : `@${opp} wins`}</p>
          <p className="mp-text big">{r.why}</p>
          {(r.kind === 'end' || r.kind === 'resign') && (
            <div className="mp-rematch"><span className="mp-text">{rematchLeft <= 0 ? 'The rematch offer ran out.' : r.rematch.mine && r.rematch.theirs ? 'Both said yes. A new rule is being drawn…' : r.rematch.mine ? `Rematch asked. Waiting for @${opp}.` : r.rematch.theirs ? `Rematch? @${opp} asked for one. A new rule is drawn.` : 'Rematch? A new rule is drawn; both of you must press within 20 seconds.'}</span> {rematchLeft > 0 && <span className="mp-label">{fmt(rematchLeft)}</span>}</div>
          )}
          {r.kind === 'gone' && <p className="mp-text">Connections drop. Nothing about this is shown to anyone else.</p>}
          <div className="mp-grow" />
          <div className="mp-btns">
            {(r.kind === 'end' || r.kind === 'resign') && <button className="mp-btn primary" disabled={r.rematch.mine || rematchLeft <= 0} onClick={() => send(`/api/minpentai/match/${id}/rematch`)}>{r.rematch.mine ? 'REMATCH ASKED' : 'REMATCH'}</button>}
            {r.replay.length > 1 && <button className="mp-btn" onClick={() => setReplay({ i: 0, playing: true })}>WATCH IT AGAIN</button>}
            <button className="mp-btn" onClick={onDone}>{r.kind === 'gone' || r.kind === 'left' ? "I'M READY AGAIN" : 'DONE'}</button>
          </div>
        </div>
      )}
      {replay && r && (
        <>
          <div className="mp-four">
            {([['◁ STEP', () => setReplay({ i: Math.max(0, replay.i - 1), playing: false })], [replay.playing ? 'PAUSE' : 'PLAY', () => setReplay({ i: replay.i >= r.replay.length - 1 ? 0 : replay.i, playing: !replay.playing })], ['STEP ▷', () => setReplay({ i: Math.min(r.replay.length - 1, replay.i + 1), playing: false })], ['TO STEP 0', () => setReplay({ i: 0, playing: false })]] as [string, () => void][]).map(([l, f]) => <button key={l} className="mp-btn small quiet" onClick={f}>{l}</button>)}
          </div>
          <p className="mp-body mp-text">The whole board, steps 0 to {r.step}, as anyone watching would see it. During the match neither player could.</p>
          <div className="mp-foot"><button className="mp-btn primary" onClick={() => setReplay(null)}>DONE</button></div>
        </>
      )}
    </>
  );

  const label = `Minpentai board, ${strip.toLowerCase()}`;
  return (
    <div className="mp-boardscr">
      {!port && (
        <div className="mp-bar">
          <h2 className="mp-bar-title" style={{ paddingLeft: 12 }}>{replay ? 'Watch it again' : <>You v @{opp}</>}</h2>
          {!over && !replay && <button className="mp-right" aria-label="Match menu" aria-haspopup="dialog" onClick={() => setSheet('menu')}>···</button>}
        </div>
      )}
      {port ? (
        <div className="mp-port">
          <div className="mp-port-bar"><button className="mp-back" aria-label="Exit full screen" onClick={() => setFs(false)}>✕</button><span className="mp-port-strip">{strip}</span><button className="mp-back" aria-label="Match menu" onClick={() => setSheet('menu')}>···</button></div>
          <div className="mp-port-board"><PlayBoard bd={bd} label={label} fitHeight /></div>
          <div className="mp-port-ctl">
            {act && !m.ended && <>{pieces.map(([p2, , sh]) => <button key={p2} className={`mp-fsbtn${piece === p2 ? ' on' : ''}`} aria-pressed={piece === p2} onClick={() => setPiece(p2)}>{sh}</button>)}<span className="mp-port-pts">{pts} PTS</span><button className="mp-fsbtn end" onClick={() => placeTurn(mineDrawn, true)}>END TURN</button></>}
            {act && m.ended && <><span className="mp-port-pts">WAITING FOR @{opp.toUpperCase()} · {fmt(msLeft ?? 0)}</span><button className="mp-fsbtn" onClick={() => placeTurn(mineDrawn, false)}>CHANGE</button></>}
            {phase === 'run' && <span className="mp-port-pts">{nextAt >= MAXS ? 'NO MORE TURNS · ENDS AT STEP 96' : `NEXT TURN AT STEP ${nextAt}`}</span>}
          </div>
        </div>
      ) : (
        <div className="mp-split" style={{ flexDirection: 'column' }}>
          <div className="mp-boardarea" style={{ flex: 'none', padding: 0 }}>
            <PlayBoard bd={bd} label={label}>
              <div className="mp-strip" aria-hidden="true">{strip}</div>
              {phase !== 'over' && !replay && <button className="mp-fsgo" title="Full screen" aria-label="Full screen" onClick={() => setFs(true)}>⤢</button>}
              {showMatched && <div className="mp-banner" aria-hidden="true"><span className="mp-banner-dz">MU GU GEI TAU FA</span><span className="mp-banner-en">The battle begins in fifty ticks.</span></div>}
              {m.paused && <div className="mp-banner dark" role="status">{m.paused.who === 'opponent' ? <>@{opp.toUpperCase()} LOST CONNECTION<br />BACK WITHIN {fmt(m.paused.msLeft)}</> : <>YOUR CONNECTION DROPPED<br />BACK WITHIN {fmt(m.paused.msLeft)}</>}</div>}
            </PlayBoard>
          </div>
          <div className="mp-panel" style={{ flex: 1, width: '100%' }}>{panel}</div>
        </div>
      )}
      {sheet && (
        <>
          <div className="mp-scrim" onClick={() => setSheet(null)} />
          <div className="mp-sheet" role="dialog" aria-modal="true" aria-label="Match menu">
            {sheet === 'menu' && (
              <>
                <div className="mp-menu">
                  <button onClick={() => setSheet('resign')}>Resign</button>
                  <Link href="/minpentai/rules" target="_blank">The rules page ↗</Link>
                  <button onClick={() => setSheet('leave')}>Leave</button>
                </div>
                <button className="mp-btn" onClick={() => setSheet(null)}>CLOSE</button>
              </>
            )}
            {sheet === 'resign' && (
              <>
                <p className="mp-sheet-title">Resign this match?</p>
                <p className="mp-text">It counts as a loss. Only you and @{opp} see the result.</p>
                <button className="mp-btn warn" onClick={() => { setSheet(null); void send(`/api/minpentai/match/${id}/resign`); }}>RESIGN</button>
                <button className="mp-btn" onClick={() => setSheet(null)}>KEEP PLAYING</button>
              </>
            )}
            {sheet === 'leave' && (
              <>
                <p className="mp-sheet-title">{setup ? 'Leave during setup?' : 'Leave this match?'}</p>
                <p className="mp-text">{setup ? 'The match is cancelled with no result for either of you.' : 'Leaving counts as resigning.'}</p>
                <button className="mp-btn warn" onClick={() => { const cancel = setup; setSheet(null); void send(`/api/minpentai/match/${id}/leave`).then(() => { if (cancel) onDone(); }); }}>LEAVE</button>
                <button className="mp-btn" onClick={() => setSheet(null)}>STAY</button>
              </>
            )}
          </div>
        </>
      )}
      {toast && <div className="mp-toast" role="status">{toast}</div>}
    </div>
  );
}
