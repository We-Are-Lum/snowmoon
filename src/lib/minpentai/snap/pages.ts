/**
 * The snap's pages and what each button does (spike, 2026-10-21). Snap 2.0 JSON
 * (https://docs.farcaster.xyz/snap/llms.txt): one card at a time, at most 64 elements, a 15 × 10
 * cell_grid for the board. Every submit target carries the whole match, signed (state.ts).
 *
 * Pages: the tutorial (a paginator, before the first match), "What's different" (a version link),
 * the turn to act (the board), the run (the 12 steps as a GIF, run.ts), resign, and the result.
 */
import { randomInt } from 'node:crypto';
import { D4, D8, K, RULES, W, XY, inb, lit, type RuleId } from '../play-game/game';
import { play, refusal, type Played } from './match';
import { runToken, serialize, sign, type P, type SnapState, type Tool } from './state';
import { differences, versionOf } from './versions';

type El = { type: string; props?: Record<string, unknown>; children?: string[]; on?: Record<string, unknown> };
export interface SnapPage {
  version: '2.0';
  theme: { accent: string };
  effects?: string[];
  ui: { root: string; elements: Record<string, El> };
}

export const SNAP_PATH = '/snap/minpentai';
export const MINI_APP = 'https://snowmoon.party/minpentai';
const DISCLAIMER = 'Independent adaptation · Not affiliated with the author · No token';
const RULE_SHORT: Record<RuleId, string> = { diag: 'diagonal gliders', cost3: 'gliders cost 3', sight2: 'sight 2', every8: 'turns every 8 steps' };

/** Where the snap is served, and query parameters every link must keep (a preview's bypass). */
export interface Here { base: string; keep: [string, string][] }

const page = (elements: Record<string, El>, root = 'page', effects?: string[]): SnapPage => ({
  version: '2.0', theme: { accent: 'teal' }, ...(effects ? { effects } : {}), ui: { root, elements },
});
const text = (content: string, more: Record<string, unknown> = {}): El => ({ type: 'text', props: { content, ...more } });
const button = (label: string, press: Record<string, unknown>, primary = false): El => ({
  type: 'button', props: { label, ...(primary ? { variant: 'primary' } : {}) }, on: { press },
});

function url(h: Here, path: string, q: Record<string, string>): string {
  const u = new URL(h.base + path);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  for (const [k, v] of h.keep) u.searchParams.set(k, v);
  return u.toString();
}
const submit = (h: Here, a: string, st: SnapState | null, extra: Record<string, string> = {}) => {
  const q: Record<string, string> = { a, ...extra };
  if (st) { const s = serialize(st); q.s = s; q.h = sign(s); }
  return { action: 'submit', params: { target: url(h, SNAP_PATH, q) } };
};
export const versionLink = (h: Here, ver: string) => url({ ...h, keep: [] }, SNAP_PATH, ver ? { v: ver } : {});

// ---------------------------------------------------------------------------------------------
// The tutorial and "What's different"

const TUTORIAL: [string, string[]][] = [
  ['Minpentai, in a cast', [
    "A game from Vitalik Buterin's novel Snowmoon, with rules invented for this edition. You are Cyan; the computer is Amber.",
  ]],
  ['Three pieces', [
    'Glider, 4 points: flies one square a step in a straight line and never stops. It breaks an enemy tower it reaches.',
    'Square, 1: the first hit cracks it and turns the glider back; the second breaks both.',
    'Tower, 4: your score and your sight.',
  ]],
  ['Turns', [
    'You get 8 points a turn and place within 3 squares of your towers. Both sides place at once, unseen; then the board runs 12 steps on its own.',
    'Lose every tower and you lose; at step 96, most towers wins. Each match also draws one of four invented extras, such as diagonal gliders.',
  ]],
  ['Playing here', [
    'Pick a piece (→ glider, ■ square, ◎ tower), then tap a lit square. Arrows appear around a new glider: tap one to aim it, or tap the glider to turn it. Tap a square or tower again to take it back.',
    'Practice only: nothing is recorded.',
  ]],
];

export function intro(h: Here, ver: string): SnapPage {
  const v = versionOf(ver);
  const els: Record<string, El> = {};
  const pages: string[] = [];
  if (v) {
    els.vd = { type: 'stack', props: {}, children: ['vd-t', 'vd-by', 'vd-l', 'vd-x'] };
    els['vd-t'] = text(`${v.name}: what's different`, { weight: 'bold' });
    els['vd-by'] = text(`A version of Minpentai Play by ${v.by}. Swipe on for how to play.`, { size: 'sm' });
    els['vd-l'] = text(differences(v).join(' ') || 'Nothing: the base game.');
    els['vd-x'] = text(DISCLAIMER, { size: 'sm' });
    pages.push('vd');
  }
  TUTORIAL.forEach(([title, lines], i) => {
    const id = `t${i}`, kids = [`${id}-h`];
    els[`${id}-h`] = text(title, { weight: 'bold' });
    if (i === 0) {
      kids.push(`${id}-b`);
      els[`${id}-b`] = { type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: ['b-inv', 'b-draft', 'b-prac'] };
      els['b-inv'] = { type: 'badge', props: { label: 'Invented', variant: 'outline' } };
      els['b-draft'] = { type: 'badge', props: { label: 'Draft', variant: 'outline' } };
      els['b-prac'] = { type: 'badge', props: { label: 'Practice', variant: 'outline' } };
    }
    lines.forEach((l, j) => { kids.push(`${id}-${j}`); els[`${id}-${j}`] = text(l, j > 0 || i === 1 ? { size: 'sm' } : {}); });
    if (i === 0 && !v) { kids.push(`${id}-x`); els[`${id}-x`] = text(DISCLAIMER, { size: 'sm' }); }
    els[id] = { type: 'stack', props: {}, children: kids };
    pages.push(id);
  });
  els.pager = { type: 'paginator', props: { controlsPosition: 'top' }, children: pages };
  els.start = button('Start a match', submit(h, 'start', null, ver ? { v: ver } : {}), true);
  els.page = { type: 'stack', props: {}, children: ['pager', 'start'] };
  return page(els);
}

// ---------------------------------------------------------------------------------------------
// The board

const CY = '#46D7E8', CY_DIM = '#2A7F8A', AM = '#FFB43A', AM_DIM = '#8A6220';
const FOG = '#08090C', LIT = '#17323A', ROCK = '#4B4C55', PEND = '#B8F2F8', ARROW = '#24525B';
const ARROWS: Record<string, string> = { '1,0': '→', '-1,0': '←', '0,-1': '↑', '0,1': '↓', '1,-1': '↗', '1,1': '↘', '-1,1': '↙', '-1,-1': '↖' };
const arrow = (dx: number, dy: number) => ARROWS[`${dx},${dy}`];
/** Clockwise from →, for turning a glider by tapping it. */
const CW4: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const CW8: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

interface Cell { row: number; col: number; color: string; content?: string; textColor?: string }

function boardCells(p: Played, st: SnapState): Cell[] {
  const see = lit(p.w, 'C', p.R);
  const cells: Cell[] = [];
  const at = new Map<number, Cell>();
  for (let k = 0; k < 150; k++) {
    const [x, y] = XY(k);
    const c: Cell = { row: y, col: x, color: see.has(k) ? LIT : FOG };
    cells.push(c);
    at.set(k, c);
  }
  const set = (k: number, color: string, content?: string, textColor?: string) => {
    const c = at.get(k)!;
    c.color = color;
    if (content) c.content = content; else delete c.content;
    if (textColor) c.textColor = textColor;
  };
  for (const k in p.w.rock) set(+k, ROCK);
  for (const k in p.lsC) if (!see.has(+k)) set(+k, '#2A2112', '◎', AM_DIM);
  for (const k in p.w.tw) if (p.w.tw[k] === 'C' || see.has(+k)) set(+k, p.w.tw[k] === 'C' ? CY : AM, '◎', '#0B0B0E');
  for (const k in p.w.sq) {
    const s = p.w.sq[k];
    if (s.o === 'C' || see.has(+k)) set(+k, s.o === 'C' ? CY_DIM : AM_DIM, s.hp > 1 ? '■' : '□', s.o === 'C' ? CY : AM);
  }
  for (const g of p.w.gl) {
    const k = K(g.x, g.y);
    if (g.o === 'C' || see.has(k)) set(k, g.o === 'C' ? CY_DIM : AM_DIM, arrow(g.dx, g.dy), g.o === 'C' ? CY : AM);
  }
  st.pend.forEach((q) => set(K(q.x, q.y), PEND, q.t === 'g' ? arrow(q.dx, q.dy) : q.t === 's' ? '■' : '◎', '#06262B'));
  if (st.aim >= 0) {
    const g = st.pend[st.aim];
    for (const [dx, dy] of p.rule === 'diag' ? D8 : D4) {
      if (dx === g.dx && dy === g.dy) continue;
      if (inb(g.x + dx, g.y + dy)) set(K(g.x + dx, g.y + dy), ARROW, arrow(dx, dy), '#E6FBFF');
    }
  }
  return cells;
}

const spent = (p: Played, l: P[]) => l.reduce((n, q) => n + (q.t === 'g' ? p.cost : q.t === 's' ? 1 : 4), 0);
const turnNo = (st: SnapState) => st.turns.length + 1;
/** Glyphs, as on the board: the renderer stacks three options vertically past 15 characters in all. */
const pieceLabels = (p: Played) => [`→ ${p.cost}`, '■ 1', '◎ 4'];

export function actPage(h: Here, st: SnapState, p: Played, msg: string | null): SnapPage {
  const left = 8 - spent(p, st.pend);
  const status = msg ?? (st.turns.length === 0
    ? `Extra rule: ${RULES[p.rule]} Pieces: → glider ${p.cost}, ■ square 1, ◎ tower 4.`
    : `Turn ${turnNo(st)} · step ${p.w.step} · ${left} of 8 points left · ${RULE_SHORT[p.rule]}`);
  const labels = pieceLabels(p);
  return page({
    page: { type: 'stack', props: {}, children: ['status', 'piece', 'board', 'acts'] },
    status: text(status, { size: 'sm', maxLines: 2 }),
    piece: { type: 'toggle_group', props: { name: 'piece', options: labels, defaultValue: labels['gst'.indexOf(st.tool)] } },
    board: {
      type: 'cell_grid',
      props: { name: 'cell', cols: W, rows: 10, cells: boardCells(p, st), cellAspectRatio: 'square', gap: 'sm' },
      on: { press: submit(h, 'tap', st) },
    },
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['end', 'undo'] },
    end: button('End turn', submit(h, 'end', st), true),
    undo: button('Undo', submit(h, 'undo', st)),
  });
}

const s = (n: number) => (n === 1 ? '' : 's');

function runImage(h: Here, st: SnapState, i: number): string {
  const g = runToken(st, i + 1);
  return url(h, `${SNAP_PATH}/run`, { g, h: sign(g) });
}

export function runPage(h: Here, st: SnapState, p: Played): SnapPage {
  const i = st.turns.length - 1, run = p.runs[i], last = run.frames[run.frames.length - 1];
  const mine = last.tw.filter(([, o]) => o === 'C').length, seen = Object.keys(p.lsC).length;
  return page({
    page: { type: 'stack', props: {}, children: ['title', 'gif', 'sum', 'acts'] },
    title: text(`Steps ${run.frames[0].step}–${last.step}`, { weight: 'bold' }),
    gif: { type: 'image', props: { url: runImage(h, st, i), aspect: '16:9', alt: `The board as Cyan saw it, steps ${run.frames[0].step} to ${last.step}.` } },
    sum: text(`You have ${mine} tower${s(mine)}. Amber: ${seen} last seen. Your turn to act.`, { size: 'sm' }),
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['next', 'resign'] },
    next: button('Your turn', submit(h, 'next', st), true),
    resign: button('Resign', submit(h, 'resign', st)),
  });
}

export function resignPage(h: Here, st: SnapState): SnapPage {
  return page({
    page: { type: 'stack', props: {}, children: ['title', 'body', 'acts'] },
    title: text('Resign this match?', { weight: 'bold' }),
    body: text('It counts as a loss. This is practice, so nothing is recorded.', { size: 'sm' }),
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['yes', 'back'] },
    yes: button('Resign', submit(h, 'resign-yes', st)),
    back: button('Back', submit(h, 'next', st), true),
  });
}

export function resultPage(h: Here, st: SnapState, p: Played): SnapPage {
  const o = p.over!, won = o.win === 'C';
  const title = o.win === 'D' ? 'Draw' : won ? 'You won' : 'Amber won';
  const why = o.kind === 'resign' ? `You resigned at step ${o.step}.`
    : !o.counts.C && !o.counts.A ? `Both sides lost their last tower at step ${o.step}.`
    : !o.counts.C ? `Your last tower fell at step ${o.step}.`
    : !o.counts.A ? `Amber's last tower fell at step ${o.step}.`
    : `Time ran out at step ${o.step}: you ${o.counts.C}, Amber ${o.counts.A}.`;
  const v = versionOf(st.ver);
  const share = won ? `I beat the computer at Minpentai${v ? ` (${v.name})` : ''} in ${o.step} steps, right in the feed.` : `Minpentai${v ? ` (${v.name})` : ''}: a game from Snowmoon you can play in a cast.`;
  const kids = ['title', ...(p.runs.length ? ['gif'] : []), 'why', 'acts', 'make'];
  return page({
    page: { type: 'stack', props: {}, children: kids },
    title: text(title, { weight: 'bold' }),
    ...(p.runs.length ? { gif: { type: 'image', props: { url: runImage(h, st, p.runs.length - 1), aspect: '16:9', alt: `The last steps of the match, as Cyan saw them.` } } } : {}),
    why: text(`${why} ${st.taps} taps. Practice: nothing recorded.`, { size: 'sm' }),
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['share', 'again'] },
    share: { type: 'button', props: { label: 'Share', icon: 'share' }, on: { press: { action: 'compose_cast', params: { text: share, embeds: [versionLink(h, st.ver)] } } } },
    again: button('Play again', submit(h, 'again', st), true),
    make: button('Make your own version', { action: 'open_mini_app', params: { target: MINI_APP } }),
  }, 'page', won ? ['confetti'] : undefined);
}

// ---------------------------------------------------------------------------------------------
// Actions

export function newMatch(fid: number, ver: string): SnapState {
  return { fid, seed: randomInt(0, 2 ** 32), lvl: 0, ver: versionOf(ver) ? ver : '', turns: [], pend: [], aim: -1, tool: 'g', taps: 0, resigned: false };
}

const toolOf = (label: unknown): Tool | null => (typeof label === 'string' ? ({ '→': 'g', '■': 's', '◎': 't' } as Record<string, Tool>)[label[0]] ?? null : null);

/** A tap on the board at (x, y). Returns the message to show, or null. */
function tap(st: SnapState, p: Played, x: number, y: number): string | null {
  if (st.aim >= 0) {
    const g = st.pend[st.aim], dx = x - g.x, dy = y - g.y;
    st.aim = -1;
    if ((dx || dy) && (p.rule === 'diag' ? D8 : D4).some(([a, b]) => a === dx && b === dy)) { g.dx = dx; g.dy = dy; return null; }
  }
  const i = st.pend.findIndex((q) => q.x === x && q.y === y);
  if (i >= 0) {
    const q = st.pend[i];
    if (q.t === 'g') {
      const cw = p.rule === 'diag' ? CW8 : CW4, j = cw.findIndex(([a, b]) => a === q.dx && b === q.dy);
      [q.dx, q.dy] = cw[(j + 1) % cw.length];
      st.aim = i;
    } else st.pend.splice(i, 1);
    return null;
  }
  const next = [...st.pend, { t: st.tool, x, y, dx: st.tool === 'g' ? 1 : 0, dy: 0 }];
  const why = refusal(p, next);
  if (why) return why;
  st.pend = next;
  if (st.tool === 'g') st.aim = next.length - 1;
  return null;
}

/**
 * One POST. `st` is the verified match (or null for a new one), `inputs` the snap's field values.
 * Returns the page to show; the state it carries is in its targets.
 */
export function act(h: Here, a: string, st: SnapState | null, fid: number, inputs: Record<string, unknown>, ver: string): SnapPage {
  if (!st || st.fid !== fid || a === 'start' || a === 'again') {
    const n = newMatch(fid, a === 'again' && st ? st.ver : ver);
    n.taps = 1;
    return actPage(h, n, play(n), null);
  }
  st.taps++;
  const tool = toolOf(inputs.piece);
  if (tool && tool !== st.tool) { st.tool = tool; st.taps++; }
  let p = play(st);
  if (p.over) return resultPage(h, st, p);
  switch (a) {
    case 'tap': {
      const m = /^(\d+),(\d+)$/.exec(String(inputs.cell ?? ''));
      const msg = m ? tap(st, p, +m[2], +m[1]) : 'Tap a square on the board.';
      return actPage(h, st, p, msg);
    }
    case 'undo':
      st.pend.pop();
      st.aim = -1;
      return actPage(h, st, p, null);
    case 'end': {
      st.turns.push(st.pend);
      st.pend = [];
      st.aim = -1;
      p = play(st);
      return p.over ? resultPage(h, st, p) : runPage(h, st, p);
    }
    case 'resign':
      return resignPage(h, st);
    case 'resign-yes':
      st.resigned = true;
      st.pend = [];
      return resultPage(h, st, play(st));
    case 'next':
    default:
      return actPage(h, st, p, null);
  }
}
