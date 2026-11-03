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
import { PLAY_RULESET, maxStepsOf } from '../versions/solo-v1';
import { play, refusal, type Played } from './match';
import { LABELS } from '../../labels';
import { CHALLENGE_PATH, LEVELS, RULE_SHORT, challengeLine, challengeText, decResult, encChallenge, encResult, outcome, type Challenge } from './challenge';
import { encMatch } from './moves';
import type { Saved } from './resume';
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
const DISCLAIMER = 'Independent adaptation · Not affiliated with the author';
export { LEVELS };
/** The extra rule picker's options: glyphs, since the renderer keeps five options in a row only up to
 * 8 characters in all. `?` is the drawn rule. Its label spells them out; the turn screen then names
 * the rule in full. */
export const RULE_PICKS: [string, RuleId | ''][] = [['?', ''], ['↗', 'diag'], ['→3', 'cost3'], ['◎2', 'sight2'], ['↻8', 'every8']];
const RULE_KEY = '↗ gliders also fly diagonally · →3 gliders cost 3, not 4 · ◎2 you see 2 squares around your towers, not 3 · ↻8 a turn every 8 steps, not 12';

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
/** A challenge's link (challenge.ts), signed. Never carries a preview's bypass: it is meant to be shared. */
export const challengeLink = (h: Here, c: Challenge) => { const b = encChallenge(c); return `${h.base}${CHALLENGE_PATH}${b}.${sign(b)}`; };
/** A challenge read from a verified link, with the link's own segment for the Start button. */
export interface Incoming { c: Challenge; seg: string }

// ---------------------------------------------------------------------------------------------
// The tutorial and "What's different"

const TUTORIAL: [string, string[]][] = [
  ['Minpentai, in a cast', [
    "A game from Vitalik Buterin's novel Snowmoon, with rules invented for this edition. You are Cyan; the computer is Amber.",
  ]],
  ['Three pieces', [
    'Glider, 4 points: flies one square a step, up, down, left or right, and never stops. Diagonally too only in a match that draws the diagonal rule. It breaks an enemy tower it reaches.',
    'Square, 1: the first hit cracks it and turns the glider back; the second breaks both.',
    'Tower, 4: your score and your sight.',
  ]],
  ['Turns', [
    'You get 8 points a turn and place within 3 squares of your towers. Both sides place at once, unseen; then the board runs 12 steps on its own.',
    `Lose every tower and you lose; at step ${maxStepsOf(PLAY_RULESET)}, most towers wins. Each match also draws one of four invented extras, such as diagonal gliders.`,
  ]],
  ['Playing here', [
    'Pick a piece (→ glider, ■ square, ◎ tower), then tap a lit square. Pink arrows appear around a new glider: tap one to aim it, or tap the glider to turn it (that also aims off the edge). Tap a square or tower again to take it back.',
    'Practice only: nothing is recorded.',
  ]],
];

/** The labels Play uses (src/lib/labels.ts); a snap can't open the ⓘ dialog, so they are badges. */
const BADGES: [string, string][] = [['b-inv', LABELS.minpentai.invented.word], ['b-draft', LABELS.minpentai.draft.word], ['b-prac', 'Practice']];

/**
 * The first page. `resume`: 'yes' when the viewer is known (a signed GET) and has a match kept,
 * 'no' when known without one, 'maybe' when the GET is anonymous (the button then asks the server,
 * whose POST is always signed).
 */
export function intro(h: Here, ver: string, resume: 'yes' | 'no' | 'maybe' = 'maybe', challenge?: Incoming): SnapPage {
  if (challenge) ver = challenge.c.ver;
  const v = versionOf(ver);
  const els: Record<string, El> = {};
  const pages: string[] = [];
  const badges = (id: string) => {
    els[id] = { type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: BADGES.map(([b]) => b) };
    for (const [b, label] of BADGES) els[b] = { type: 'badge', props: { label, variant: 'outline' } };
    return id;
  };
  if (v) {
    els.vd = { type: 'stack', props: {}, children: ['vd-t', badges('vd-b'), 'vd-by', 'vd-l', 'vd-x'] };
    els['vd-t'] = text(`${v.name}: what's different`, { weight: 'bold' });
    els['vd-by'] = text(`A version of Minpentai Play by ${v.by}, rules invented for this edition. Swipe on for how to play.`, { size: 'sm' });
    els['vd-l'] = text(differences(v).join(' ') || 'Nothing: the base game.', { size: 'sm' });
    els['vd-x'] = text(DISCLAIMER, { size: 'sm' });
    pages.push('vd');
  }
  TUTORIAL.forEach(([title, lines], i) => {
    const id = `t${i}`, kids = [`${id}-h`];
    els[`${id}-h`] = text(title, { weight: 'bold' });
    if (i === 0) kids.push(badges(`${id}-b`));
    lines.forEach((l, j) => { kids.push(`${id}-${j}`); els[`${id}-${j}`] = text(l, j > 0 || i === 1 ? { size: 'sm' } : {}); });
    if (i === 0 && !v) { kids.push(`${id}-x`); els[`${id}-x`] = text(DISCLAIMER, { size: 'sm' }); }
    els[id] = { type: 'stack', props: {}, children: kids };
    pages.push(id);
  });
  els.pager = { type: 'paginator', props: { controlsPosition: 'top' }, children: pages };
  const q: Record<string, string> = ver ? { v: ver } : {};
  if (challenge) {
    // Someone's result, and the same start for this player: no level or rule to pick, no Resume.
    const c = challenge.c;
    els.ch = text(`A challenge: ${outcome(c.res)}, in ${c.res.taps} taps. ${challengeLine(c)}`, { size: 'sm' });
    els.start = button('Accept the challenge', submit(h, 'start', null, { ...q, c: challenge.seg }), true);
    els.page = { type: 'stack', props: {}, children: ['ch', 'pager', 'start'] };
    return page(els);
  }
  // The computer player, picked here and sent with Start (Resume keeps the kept match's own).
  els.level = { type: 'slider', props: { name: 'lvl', min: 0, max: 5, step: 1, defaultValue: 0, showValue: true, label: 'Computer level: 0 Practice … 5 Planner' } };
  // The extra rule (owner, 2026-10-22): drawn, or one of Play's four. A version that fixes one has no picker.
  const picker = !v?.rule;
  // A snap can't explain an option when it is tapped, so a key under the picker says what each does
  // (owner's phone test, 2026-10-22: "it wasn't clear what that bottom area was").
  if (picker) {
    els.rule = { type: 'toggle_group', props: { name: 'rule', label: 'Extra rule for your match (? = drawn at random)', options: RULE_PICKS.map(([g]) => g), defaultValue: '?' } };
    els['rule-key'] = text(RULE_KEY, { size: 'sm' });
  }
  if (resume === 'yes') {
    els.resume = button('Resume', submit(h, 'resume', null, q), true);
    els.start = button('New match', submit(h, 'start', null, q));
  } else {
    els.start = button('Start a match', submit(h, 'start', null, q), true);
    if (resume === 'maybe') els.resume = button('Resume', submit(h, 'resume', null, q));
  }
  const acts = resume === 'yes' ? ['resume', 'start'] : resume === 'maybe' ? ['start', 'resume'] : ['start'];
  if (acts.length > 1) els.acts = { type: 'stack', props: { direction: 'horizontal' }, children: acts };
  els.page = { type: 'stack', props: {}, children: ['pager', 'level', ...(picker ? ['rule', 'rule-key'] : []), acts.length > 1 ? 'acts' : 'start'] };
  return page(els);
}

// ---------------------------------------------------------------------------------------------
// The board

const CY = '#46D7E8', CY_DIM = '#2A7F8A', AM = '#FFB43A', AM_DIM = '#8A6220';
const FOG = '#08090C', LIT = '#17323A', PEND = '#B8F2F8';
/** Contrast (phone test, 2026-10-21): rocks 4.8:1 on fog and 3.3:1 on lit squares; a last-seen tower's
 * ring 6.9:1 on its dimmed square; aim arrows magenta (a hue no piece uses), 7.9:1 on fog, 5.3:1 on lit
 * squares, black arrows on them 7.7:1. The test checks these ratios. */
export const ROCK = '#7A7C86', SEEN_BG = '#2E2210', SEEN = '#E0A040', AIM = '#FF6AD5', AIM_TEXT = '#0B0B0E';
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
  for (const k in p.lsC) if (!see.has(+k)) set(+k, SEEN_BG, '◎', SEEN);
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
      if (inb(g.x + dx, g.y + dy)) set(K(g.x + dx, g.y + dy), AIM, arrow(dx, dy), AIM_TEXT);
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
  const diag = p.rule === 'diag';
  const status = msg ?? (st.aim >= 0
    ? `Aim: tap a pink arrow, or tap the glider to turn it. ${diag ? 'This match lets gliders fly diagonally too.' : 'Up, down, left or right only: this match has no diagonal rule.'}`
    : st.turns.length === 0
      ? `Against ${LEVELS[st.lvl]}. Extra rule: ${RULES[p.rule]}${diag ? '' : ' No diagonal gliders.'}`
      : `Turn ${turnNo(st)} · step ${p.w.step} · ${left} of 8 points left · ${RULE_SHORT[p.rule]}${diag ? '' : ' · no diagonals'}`);
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
    // Resign on the board from the second turn on, so a resumed match can be resigned straight away
    // (owner, 2026-10-30), not only after a run; setup has none.
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['end', 'undo', ...(st.turns.length ? ['resign'] : [])] },
    end: button('End turn', submit(h, 'end', st), true),
    undo: button('Undo', submit(h, 'undo', st)),
    ...(st.turns.length ? { resign: button('Resign', submit(h, 'resign', st)) } : {}),
  });
}

const s = (n: number) => (n === 1 ? '' : 's');

/** The run after turn i, as a GIF; `reveal` (the match is over): the last run, unfogged. */
function runImage(h: Here, st: SnapState, i: number, reveal = false): string {
  const g = runToken(st, i + 1);
  return url(h, `${SNAP_PATH}/run`, { g, h: sign(g), ...(reveal ? { r: '1' } : {}) });
}
/** Play, carrying on this match: seed and finished turns (moves.ts encMatch). */
const inApp = (h: Here, st: SnapState) => url(h, '/minpentai', { match: encMatch(st.seed, st.turns), ...(st.lvl ? { level: String(st.lvl) } : {}), ...(st.rule ? { rule: st.rule } : {}), ...(st.rs !== 1 ? { rs: String(st.rs) } : {}) });

export function runPage(h: Here, st: SnapState, p: Played): SnapPage {
  const i = st.turns.length - 1, run = p.runs[i], last = run.frames[run.frames.length - 1];
  const mine = last.tw.filter(([, o]) => o === 'C').length, seen = Object.keys(p.lsC).length;
  // From the second turn, the match can go on in the app (the base game only: Play has no versions).
  const handOff = st.turns.length >= 2 && !st.ver;
  return page({
    page: { type: 'stack', props: {}, children: ['title', 'gif', 'sum', 'acts', ...(handOff ? ['app'] : [])] },
    title: text(`Steps ${run.frames[0].step}–${last.step}`, { weight: 'bold' }),
    gif: { type: 'image', props: { url: runImage(h, st, i), aspect: '16:9', alt: `The board as Cyan saw it, steps ${run.frames[0].step} to ${last.step}.` } },
    sum: text(`You have ${mine} tower${s(mine)}. Amber: ${seen} last seen. Your turn to act.`, { size: 'sm' }),
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['next', 'resign'] },
    next: button('Your turn', submit(h, 'next', st), true),
    resign: button('Resign', submit(h, 'resign', st)),
    ...(handOff ? { app: button('Keep playing in the app', { action: 'open_mini_app', params: { target: inApp(h, st) } }) } : {}),
  });
}

export function resignPage(h: Here, st: SnapState): SnapPage {
  return page({
    page: { type: 'stack', props: {}, children: ['title', 'body', 'acts'] },
    title: text('Resign this match?', { weight: 'bold' }),
    body: text('It counts as a loss. This is practice, so nothing is recorded.', { size: 'sm' }),
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['yes', 'back'] },
    // "Yes, resign", not "Resign" again: the owner's phone test tapped the board's Resign four times before the confirm (2026-10-30).
    yes: button('Yes, resign', submit(h, 'resign-yes', st)),
    back: button('Back', submit(h, 'next', st), true),
  });
}

export function resultPage(h: Here, st: SnapState, p: Played): SnapPage {
  const o = p.over!, won = o.win === 'C';
  const title = o.win === 'D' ? 'Draw' : won ? `You beat ${LEVELS[st.lvl]}` : `${LEVELS[st.lvl]} (Amber) won`;
  const why = o.kind === 'resign' ? `You resigned at step ${o.step}.`
    : !o.counts.C && !o.counts.A ? `Both sides lost their last tower at step ${o.step}.`
    : !o.counts.C ? `Your last tower fell at step ${o.step}.`
    : !o.counts.A ? `Amber's last tower fell at step ${o.step}.`
    : `Time ran out at step ${o.step}: you ${o.counts.C}, Amber ${o.counts.A}.`;
  // Share is a challenge (owner, 2026-10-22): the result, editable in the composer, and a link that
  // starts the same match for whoever opens it. The rule is the one played (drawn or picked).
  const c: Challenge = { seed: st.seed, lvl: st.lvl, rule: p.rule, ver: st.ver, rs: st.rs, res: { win: o.win, resigned: o.kind === 'resign', step: o.step, c: o.counts.C, a: o.counts.A, taps: st.taps } };
  const theirs = st.ch ? decResult(st.ch, st.rs) : null;
  // The match is over: the last run (or, resigned at setup, the board) unfogged, as Play shows it.
  const reveal = p.runs.length ? runImage(h, st, p.runs.length - 1, true) : url(h, `${SNAP_PATH}/run`, (() => { const g = runToken(st, 0); return { g, h: sign(g), r: '1' }; })());
  return page({
    page: { type: 'stack', props: {}, children: ['title', 'gif', 'why', ...(theirs ? ['vs'] : []), 'acts'] },
    title: text(title, { weight: 'bold' }),
    gif: { type: 'image', props: { url: reveal, aspect: '16:9', alt: 'The whole board, unfogged, over the last steps of the match.' } },
    why: text(`${why} Whole board: you ${o.counts.C} tower${s(o.counts.C)}, Amber ${o.counts.A}. ${st.taps} taps; practice, nothing recorded.`, { size: 'sm' }),
    // Side by side, no ranking: the challenge's result and this one.
    ...(theirs ? { vs: text(`The challenge: ${outcome(theirs)}, in ${theirs.taps} taps. You: ${outcome(c.res)}, in ${st.taps} taps.`, { size: 'sm' }) } : {}),
    acts: { type: 'stack', props: { direction: 'horizontal' }, children: ['share', 'again'] },
    share: { type: 'button', props: { label: 'Share', icon: 'share' }, on: { press: { action: 'compose_cast', params: { text: challengeText(c), embeds: [challengeLink(h, c)] } } } },
    again: button('Play again', submit(h, 'again', st), true),
  }, 'page', won ? ['confetti'] : undefined);
}

// ---------------------------------------------------------------------------------------------
// Actions

export function newMatch(fid: number, ver: string, lvl = 0, rule: RuleId | '' = ''): SnapState {
  return { fid, seed: randomInt(0, 2 ** 32), lvl, ver: versionOf(ver) ? ver : '', rule, ch: '', turns: [], pend: [], aim: -1, tool: 'g', taps: 0, resigned: false, rs: PLAY_RULESET };
}
/** A challenge's match: its seed, level, rule and version, with its result kept to show at the end. */
export function challenged(fid: number, c: Challenge): SnapState {
  return { ...newMatch(fid, c.ver, c.lvl, c.rule), seed: c.seed, ch: encResult(c.res), rs: c.rs };
}
/** A kept match (resume.ts) as a state at its next turn to act. */
export function resumed(fid: number, saved: Saved): SnapState {
  return { fid, seed: saved.seed, lvl: saved.lvl, ver: versionOf(saved.ver) ? saved.ver : '', rule: saved.rule, ch: '', turns: saved.turns, pend: [], aim: -1, tool: 'g', taps: 0, resigned: false, rs: saved.rs };
}

/** The slider's value: a whole number 0–5, else Practice. */
const levelOf = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5 ? v : 0);
/** The rule picker's value: one of its glyphs, else the drawn rule. */
const ruleOf = (v: unknown): RuleId | '' => RULE_PICKS.find(([g]) => g === v)?.[1] ?? '';
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

/** What the route should do with the kept match (resume.ts) after this POST. */
export type Keep = { save: Saved } | 'drop' | null;
const kept = (st: SnapState): Keep => ({ save: { seed: st.seed, lvl: st.lvl, ver: st.ver, rule: st.rule, turns: st.turns, rs: st.rs } });

/**
 * One POST. `st` is the verified match from the link (or null), `inputs` the snap's field values,
 * `q` what the first page's link said (the version, or a verified challenge) and, for "Resume", the
 * FID's kept match.
 * Returns the page to show (its targets carry the state) and what to keep.
 */
export function act(
  h: Here, a: string, st: SnapState | null, fid: number, inputs: Record<string, unknown>,
  q: { ver: string; saved?: Saved | null; challenge?: Challenge | null },
): { page: SnapPage; keep: Keep } {
  if (a === 'resume') {
    if (q.saved) {
      const r = resumed(fid, q.saved);
      r.taps = 1;
      try {
        const p = play(r);
        if (!p.over) return { page: actPage(h, r, p, `Resumed at turn ${r.turns.length + 1}, step ${p.w.step}.`), keep: null };
      } catch { /* a kept match that no longer replays: start afresh */ }
    }
    const n = newMatch(fid, q.ver, levelOf(inputs.lvl), ruleOf(inputs.rule));
    n.taps = 1;
    return { page: actPage(h, n, play(n), 'No match to resume, so here is a new one.'), keep: kept(n) };
  }
  if (!st || st.fid !== fid || a === 'start' || a === 'again') {
    const again = a === 'again' && st && st.fid === fid;
    const n = again ? newMatch(fid, st.ver, st.lvl, st.rule)
      : a === 'start' && q.challenge ? challenged(fid, q.challenge)
      : newMatch(fid, q.ver, levelOf(inputs.lvl), ruleOf(inputs.rule));
    n.taps = 1;
    return { page: actPage(h, n, play(n), null), keep: kept(n) };
  }
  st.taps++;
  const tool = toolOf(inputs.piece);
  if (tool && tool !== st.tool) { st.tool = tool; st.taps++; }
  let p = play(st);
  if (p.over) return { page: resultPage(h, st, p), keep: 'drop' };
  switch (a) {
    case 'tap': {
      const m = /^(\d+),(\d+)$/.exec(String(inputs.cell ?? ''));
      const msg = m ? tap(st, p, +m[2], +m[1]) : 'Tap a square on the board.';
      return { page: actPage(h, st, p, msg), keep: null };
    }
    case 'undo':
      st.pend.pop();
      st.aim = -1;
      return { page: actPage(h, st, p, null), keep: null };
    case 'end': {
      st.turns.push(st.pend);
      st.pend = [];
      st.aim = -1;
      p = play(st);
      return p.over ? { page: resultPage(h, st, p), keep: 'drop' } : { page: runPage(h, st, p), keep: kept(st) };
    }
    case 'resign':
      return { page: resignPage(h, st), keep: null };
    case 'resign-yes':
      st.resigned = true;
      st.pend = [];
      return { page: resultPage(h, st, play(st)), keep: 'drop' };
    case 'next':
    default:
      return { page: actPage(h, st, p, null), keep: null };
  }
}
