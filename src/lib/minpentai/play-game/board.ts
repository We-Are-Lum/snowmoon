/**
 * Design's board(): what each square of the Play board shows (docs/design/
 * minpentai-play-prototype.dc.html, script lines 91–117), as data the page draws. Colours are
 * Design's board colours; the page draws each cell as a square of `cs` pixels.
 */
import { AR, COL, D4, H, K, ROT, W, inb, lit, type Placement, type Side, type World } from './game';

export interface Cell {
  /** Background, border, inset ring, text colour, text, font size (px), as Design draws them. */
  bg: string;
  bd: string;
  sh: string;
  fg: string;
  t: string;
  fs: string;
  /** The square (board x, y) it stands for, whatever the drawing's orientation. */
  x: number;
  y: number;
  /** An aiming arrow around a new glider (full screen on a phone): the direction it sets. */
  aim?: [number, number];
  /** For people who can't see the board: what is here. */
  label: string;
}
export interface BoardOpts {
  w: World;
  cs: number;
  portrait?: boolean;
  /** Draw only what this side sees; null or undefined shows everything. */
  fog?: Side | null;
  R?: number;
  zone?: Set<number> | null;
  pend?: Placement[];
  dots?: Set<number>;
  ls?: Record<number, number>;
  flash?: boolean;
  aim?: { x: number; y: number } | null;
  dirs?: [number, number][];
  onCell?: (x: number, y: number) => void;
  onAim?: (dx: number, dy: number) => void;
}
const NAME: Record<Side, string> = { C: 'Cyan', A: 'Amber' };
const DIRW: Record<string, string> = { '1,0': 'right', '-1,0': 'left', '0,-1': 'up', '0,1': 'down', '1,-1': 'up right', '1,1': 'down right', '-1,1': 'down left', '-1,-1': 'up left' };

export interface BoardView { cells: Cell[]; cols: number; cs: number; tap: (c: Cell) => void }

export function board(o: BoardOpts): BoardView {
  const { w, cs } = o, vis = o.fog ? lit(w, o.fog, o.R ?? 3) : null;
  const glAt: Record<number, World['gl'][number]> = {}, pAt: Record<number, Placement> = {}, am: Record<number, [number, number]> = {};
  w.gl.forEach((g) => { const k = K(g.x, g.y); if (!glAt[k]) glAt[k] = g; });
  (o.pend || []).forEach((p) => (pAt[K(p.x, p.y)] = p));
  const fl = new Set(o.flash ? w.flash : []);
  if (o.aim) (o.dirs || D4).forEach(([dx, dy]) => { const x = o.aim!.x + dx, y = o.aim!.y + dy; if (inb(x, y)) am[K(x, y)] = [dx, dy]; });
  const rot = (t: string) => (o.portrait ? ROT[t] || t : t), fz = (f: number) => Math.round(cs * f) + 'px', ring = `inset 0 0 0 ${Math.round(cs * 0.2)}px #0E0F13`, pr = '0 0 0 1px #E7E4DD';
  const one = (x: number, y: number): Cell => {
    const k = K(x, y);
    const c: Cell = { bg: '#0E0F13', bd: '0', sh: 'none', fg: '#E7E4DD', t: '', fs: fz(0.58), x, y, label: 'empty' };
    if (am[k]) { const [dx, dy] = am[k]; c.bd = '1px dashed #E7E4DD'; c.t = rot(AR[dx + ',' + dy]); c.fs = fz(0.5); c.aim = [dx, dy]; c.label = `aim ${DIRW[dx + ',' + dy]}`; return c; }
    if (w.rock[k]) { c.bg = '#3A3B42'; c.label = 'rock'; return c; }
    if (vis && !vis.has(k)) { c.bg = '#050507'; c.label = 'dark'; if (o.ls && o.ls[k] !== undefined) { c.bd = '1px dashed #FFB43A'; c.t = '?'; c.fg = '#FFB43A'; c.fs = fz(0.4); c.label = `Amber tower last seen at step ${o.ls[k]}`; } return c; }
    if (fl.has(k)) { c.bg = '#F4F2ED'; c.label = 'hit'; return c; }
    const t = w.tw[k], q = w.sq[k], g = glAt[k], p = pAt[k];
    if (t) { c.bg = COL[t]; c.sh = ring; c.label = `${NAME[t]} tower`; }
    else if (q) { c.bd = `2px ${q.hp > 1 ? 'solid' : 'dashed'} ${COL[q.o]}`; c.bg = '#16181E'; c.label = `${NAME[q.o]} square${q.hp > 1 ? '' : ', cracked'}`; }
    else if (g) { c.fg = COL[g.o]; c.t = rot(AR[g.dx + ',' + g.dy]); c.label = `${NAME[g.o]} glider flying ${DIRW[g.dx + ',' + g.dy]}`; }
    else if (p) {
      const col = COL[p.o || 'C'];
      if (p.t === 't') { c.bg = col; c.sh = ring + ',' + pr; c.label = 'your new tower'; }
      else if (p.t === 's') { c.bd = '2px solid ' + col; c.bg = '#16181E'; c.sh = pr; c.label = 'your new square'; }
      else { c.fg = col; c.t = rot(AR[p.dx + ',' + p.dy]); c.sh = pr; c.bg = '#14272C'; c.label = `your new glider, flying ${DIRW[p.dx + ',' + p.dy]}`; }
    }
    else if (o.dots && o.dots.has(k)) { c.t = '·'; c.fg = COL.C; c.fs = fz(0.7); c.label = 'your glider’s path'; if (o.zone && o.zone.has(k)) c.bg = '#14272C'; }
    else if (o.zone && o.zone.has(k)) { c.bg = '#14272C'; c.label = 'lit, you can place here'; }
    return c;
  };
  const cells: Cell[] = [];
  if (o.portrait) { for (let r = 0; r < W; r++) for (let col = 0; col < H; col++) cells.push(one(W - 1 - r, col)); }
  else { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push(one(x, y)); }
  const tap = (c: Cell) => { if (c.aim) o.onAim?.(c.aim[0], c.aim[1]); else o.onCell?.(c.x, c.y); };
  return { cells, cols: o.portrait ? H : W, cs, tap };
}
