// Shared live data for the home directions. Sample people/numbers are flagged s:true.
export const MOMENTS = [
  { ch: 1, ref: 'c1-b4', t: 'Suddenly, a small drone flew over his head. Gladias instinctively checked his watch. Almost immediately, a green checkmark lit up.' },
  { ch: 1, ref: 'c1-b6', t: '"Five points for me!", the boy shouted excitedly.' },
  { ch: 1, ref: 'c1-b12', t: '"Pause, I want to enjoy the view", Gladias said to Emerald, out of habit whispering the sentence so softly that only his throat muscles moved and no sound at all left his lips.' },
  { ch: 1, ref: 'c1-b18', t: 'Vote on: Badra St #1103. Emerald AI summary: Five-storey apartment building. Blue-grey colored.' },
  { ch: 1, ref: 'c1-b20', t: 'As a citizen of Veridia, he had been randomly selected by cryptographic sortition to vote on how much he liked the building.' },
  { ch: 1, ref: 'c1-b9', t: "And playing into Gladias's ear this whole time, there was an audio program from Emerald, the local AI running from Gladias's hand device, explaining the nuances of airborne virus transmission." },
];
export const FEED = [
  { kind: 'IMAGE', who: '@ilse', what: 'Kalimar foot path, v4', where: 'c1 ¶ 2–3', img: true },
  { kind: 'STYLE', who: '@tovah', what: 'Stone and moss, built on @ilse v3', where: 'style', img: true },
  { kind: 'CHARACTER SHEET', who: '@kaz', what: 'Gladias, three views', where: 'c1', img: true },
  { kind: 'PLANNING THREAD', who: '@mira', what: 'Who should voice Emerald?', where: 'published' },
  { kind: 'IMAGE', who: '@ro', what: 'Badra St #1103, blue-grey', where: 'c1 ¶ 18–21', img: true },
  { kind: 'IMAGE', who: '@nadia', what: 'The sky bridge at dusk', where: 'c1 ¶ 11–16', img: true },
  { kind: 'PIECE', who: '@ilse + 3', what: 'Chapter 1, first illustrated pass', where: 'shipped' },
  { kind: 'STYLE', who: '@wren', what: 'Drone feathers, line only', where: 'style', img: true },
];
export const OPTIONS = [
  { id: 'read', n: 'Read', d: 'The book, with readers’ images beside it' },
  { id: 'listen', n: 'Listen', d: 'The narrated chapters' },
  { id: 'play', n: 'Play Minpentai', d: 'The game from the book: learn, play, free play' },
  { id: 'make', n: 'Make an image', d: 'For a passage, a style or a character' },
  { id: 'ask', n: 'Ask about the book', d: 'Private questions, answered from the text' },
  { id: 'adapt', n: 'Browse adaptations', d: 'What people have made, and how' },
];
const W = 15, H = 10, ROCKS = [[6,0],[9,3],[7,4],[7,5],[5,6],[8,9]];
const K = (x, y) => y * W + x;
export function newBoard(seed) {
  let a = seed >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const b = { r, step: 0, rock: {}, tw: {}, gl: [], flash: {} };
  ROCKS.forEach(([x, y]) => b.rock[K(x, y)] = 1);
  [[1,2],[1,7]].forEach(([x, y]) => b.tw[K(x, y)] = 'C'); [[13,2],[13,7]].forEach(([x, y]) => b.tw[K(x, y)] = 'A');
  return b;
}
export function stepBoard(b) {
  b.flash = {};
  if (b.step % 12 === 0) for (const o of ['C', 'A']) {
    const n = 1 + Math.floor(b.r() * 2);
    for (let i = 0; i < n; i++) { const x = o === 'C' ? 3 + Math.floor(b.r() * 2) : 10 + Math.floor(b.r() * 2), y = Math.floor(b.r() * H);
      if (b.rock[K(x, y)]) continue; const dy = b.r() < .5 ? 0 : (b.r() < .5 ? -1 : 1); b.gl.push({ o, x, y, dx: o === 'C' ? 1 : -1, dy }); }
  }
  const next = b.gl.map(g => { let dx = g.dx, dy = g.dy; if (g.x + dx < 0 || g.x + dx >= W) dx = -dx; if (g.y + dy < 0 || g.y + dy >= H) dy = -dy; return { ...g, dx, dy, tx: g.x + dx, ty: g.y + dy }; });
  const dead = new Set();
  for (let i = 0; i < next.length; i++) for (let j = i + 1; j < next.length; j++) { const p = next[i], q = next[j]; if (p.o !== q.o && p.tx === q.tx && p.ty === q.ty) { dead.add(i); dead.add(j); b.flash[K(p.tx, p.ty)] = 1; } }
  b.gl = next.filter((g, i) => {
    if (dead.has(i)) return false; const k = K(g.tx, g.ty);
    if (b.rock[k]) { g.dx = -g.dx; g.dy = -g.dy; return true; }
    if (b.tw[k]) { if (b.tw[k] !== g.o) { delete b.tw[k]; b.flash[k] = 1; return false; } g.dx = -g.dx; g.dy = -g.dy; return true; }
    g.x = g.tx; g.y = g.ty; return true;
  });
  b.step++;
  const c = Object.values(b.tw).filter(t => t === 'C').length, am = Object.values(b.tw).filter(t => t === 'A').length;
  b.over = !c || !am || b.step >= 96; return b;
}
export function boardCells(b, cs) {
  const at = {}; b.gl.forEach(g => at[K(g.x, g.y)] = g.o); const out = [];
  for (let k = 0; k < W * H; k++) {
    let bg = '#0E0F13';
    if (b.rock[k]) bg = '#3A3B42'; else if (b.flash[k]) bg = '#F4F2ED'; else if (b.tw[k]) bg = b.tw[k] === 'C' ? '#46D7E8' : '#FFB43A';
    else if (at[k]) bg = at[k] === 'C' ? 'rgba(70,215,232,.85)' : 'rgba(255,180,58,.85)';
    out.push({ bg, r: at[k] && !b.tw[k] && !b.rock[k] ? '50%' : '0' });
  }
  return out;
}
export const BW = W;
