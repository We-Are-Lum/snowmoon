/**
 * 2D drawing for Learn Minpentai, ported from Design's mockup (docs/design/minpentai-intro-v3.dc.html):
 *   drawBoard  -> Component.drawBoard (script lines 807–848): the lesson board, 780 × 520 backing
 *   drawView   -> Component.drawView (657–669): what one player sees, under each player cam
 *   drawFlat   -> drawView without the sight clip: the whole field from above, used only when
 *                 WebGL is missing (Design's note asks for "the flat match view" there)
 * Added by this build: the keyboard cursor (a dashed outline on the square the arrow keys reach).
 */
import { COL, SYM, TOWERS, W, WORLD, towerUp, type Sim } from '~/lib/minpentai/learn-game/broadcast';
import { PH, PW, near } from '~/lib/minpentai/learn-game/pieces';
import { BH, BW } from '~/lib/minpentai/learn-game/cells';
import { isCells, type LState } from '~/lib/minpentai/learn-game/controller';

export function drawBoard(c: HTMLCanvasElement | null, L: LState, cellsOn: boolean, now: number, cursor: [number, number] | null): boolean {
  if (!c) return false;
  const g = c.getContext('2d');
  if (!g) return false;
  g.fillStyle = '#060608';
  g.fillRect(0, 0, c.width, c.height);
  if (isCells(L)) {
    const d = L.def, z = d.zoom, cols = BW / z, rows = BH / z, cq = c.width / cols, [vx, vy] = d.view, b = L.s;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = ((vy + j) % BH) * BW + ((vx + i) % BW), X = i * cq, Y = j * cq;
        g.fillStyle = '#0E0F13'; g.fillRect(X + 1, Y + 1, cq - 2, cq - 2);
        if (b.cells[k]) { g.fillStyle = '#46D7E8'; g.fillRect(X + 3, Y + 3, cq - 6, cq - 6); }
      }
    }
    return true;
  }
  const d = L.def, s = L.s, cp = c.width / PW;
  const fr = L.fogR || d.fog, seen = (x: number, y: number) => !fr || near(s, x, y, fr);
  const zone = d.place === 'palette' && (d.practice ? L.phase === 'act' : s.turn === 0);
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      g.fillStyle = '#0E0F13'; g.fillRect(x * cp + 1, y * cp + 1, cp - 2, cp - 2);
      if (zone && near(s, x, y, d.zone!)) { g.fillStyle = 'rgba(70,215,232,.12)'; g.fillRect(x * cp + 1, y * cp + 1, cp - 2, cp - 2); }
    }
  }
  if (d.hints && s.turn === 0) {
    g.setLineDash([7, 5]); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2.5;
    for (const [x, y] of d.hints) if (!s.pieces.some((q) => q.x === x && q.y === y)) g.strokeRect(x * cp + 6, y * cp + 6, cp - 12, cp - 12);
    g.setLineDash([]);
  }
  const sub = cp / 4.6, cell = (cx: number, cy: number, col: string) => { g.fillStyle = col; g.fillRect(cx - sub * .45, cy - sub * .45, sub * .9, sub * .9); };
  const x0 = (v: number) => v * cp + 8;
  for (const q of s.pieces) {
    if (q.k !== 'rock' && q.p !== 0 && !seen(q.x, q.y) && !(d.practice && q.k === 'tower' && s.turn === 0)) continue;
    if (q.k === 'rock') { g.fillStyle = '#4B4C55'; g.fillRect(q.x * cp + 4, q.y * cp + 4, cp - 8, cp - 8); continue; }
    const cx = (q.x + .5) * cp, cy = (q.y + .5) * cp, col = COL[q.p!];
    if (q.k === 'glider') {
      q.trail.forEach(([tx, ty], k) => { g.globalAlpha = .32 - k * .09; g.fillStyle = col; const w = cp * .22; g.fillRect((tx + .5) * cp - w / 2, (ty + .5) * cp - w / 2, w, w); });
      g.globalAlpha = 1;
      const nn = Math.hypot(q.dx, q.dy) || 1, fx = q.dx / nn, fy = q.dy / nn, sx = -fy, sy = fx;
      if (cellsOn) { [[1, 0], [2, 0], [0, 1], [3, 1]].forEach(([a, r]) => { const A = (a - 1.5) * sub, B = (.5 - r) * sub; cell(cx + sx * A + fx * B, cy + sy * A + fy * B, col); }); }
      else {
        g.fillStyle = col; g.beginPath();
        g.moveTo(cx + fx * cp * .36, cy + fy * cp * .36);
        g.lineTo(cx - fx * cp * .26 + sx * cp * .28, cy - fy * cp * .26 + sy * cp * .28);
        g.lineTo(cx - fx * cp * .12, cy - fy * cp * .12);
        g.lineTo(cx - fx * cp * .26 - sx * cp * .28, cy - fy * cp * .26 - sy * cp * .28);
        g.closePath(); g.fill();
      }
    } else if (q.k === 'tower') {
      if (cellsOn) { [[0, 0], [1, 1], [2, 1], [1, 2]].forEach(([a, b]) => cell(cx + (a - 1) * sub, cy + (b - 1) * sub, col)); }
      else {
        g.fillStyle = col; g.beginPath(); g.arc(cx, cy, cp * .36, 0, 6.283); g.fill();
        g.fillStyle = '#0E0F13'; g.beginPath(); g.arc(cx, cy, cp * .17, 0, 6.283); g.fill();
        g.fillStyle = col; g.fillRect(cx - cp * .06, cy - cp * .06, cp * .12, cp * .12);
      }
    } else if (q.k === 'square') {
      if (cellsOn) { [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].forEach(([a, b]) => cell(cx + a * sub, cy + b * sub, col)); }
      else {
        g.globalAlpha = .45; g.fillStyle = col; g.fillRect(x0(q.x), x0(q.y), cp - 16, cp - 16); g.globalAlpha = 1;
        g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(x0(q.x), x0(q.y), cp - 16, cp - 16);
        if (q.hp === 1) {
          g.strokeStyle = '#E7E4DD'; g.lineWidth = 2; g.beginPath();
          g.moveTo(x0(q.x) + 6, x0(q.y) + 4); g.lineTo(x0(q.x) + 16, x0(q.y) + 16); g.lineTo(x0(q.x) + 11, x0(q.y) + 22); g.lineTo(x0(q.x) + cp - 22, x0(q.y) + cp - 18);
          g.stroke();
        }
      }
    }
  }
  if (fr) {
    const keep = (x: number, y: number) => s.pieces.some((q) => q.x === x && q.y === y && (q.k === 'rock' || (d.practice && q.k === 'tower' && s.turn === 0)));
    g.fillStyle = 'rgba(4,4,6,.88)';
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (!seen(x, y) && !keep(x, y)) g.fillRect(x * cp, y * cp, cp, cp);
  }
  for (const h of L.flash) {
    const a = (now - h.t0) / 1600;
    g.globalAlpha = Math.max(0, 1 - a); g.strokeStyle = h.k === 'tower' ? COL[h.p!] : '#E7E4DD'; g.lineWidth = 4;
    g.beginPath(); g.arc((h.x + .5) * cp, (h.y + .5) * cp, cp * (.4 + a * 1.8), 0, 6.283); g.stroke();
  }
  g.globalAlpha = 1;
  if (cursor) {
    // The keyboard's square (this build): a dashed cyan outline, like the focus ring.
    g.setLineDash([8, 6]); g.strokeStyle = '#46D7E8'; g.lineWidth = 4;
    g.strokeRect(cursor[0] * cp + 2, cursor[1] * cp + 2, cp - 4, cp - 4);
    g.setLineDash([]);
  }
  return true;
}

/** What player p sees: the field clipped to circles of 7 cells round their standing towers. */
export function drawView(c: HTMLCanvasElement | null, S: Sim, p: number | null) {
  if (!c) return;
  const g = c.getContext('2d');
  if (!g) return;
  const t = S.t, k = c.width / W;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.save();
  if (p !== null) {
    g.beginPath();
    TOWERS.forEach((tw, i) => { if (tw[2] === p && towerUp(S, i, t)) { g.moveTo((tw[0] + .5 + 7) * k, (tw[1] + .5) * k); g.arc((tw[0] + .5) * k, (tw[1] + .5) * k, 7 * k, 0, 6.283); } });
    g.clip();
  }
  g.fillStyle = '#0E0F13'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#4B4C55'; WORLD.rock.forEach((v, j) => { if (v > 0) g.fillRect((j % W) * k, ((j / W) | 0) * k, k, k); });
  WORLD.walls.forEach((wl, i) => { if (wl.born <= t && S.wallAlive[i]) { g.fillStyle = COL[wl.p]; g.globalAlpha = .6; g.fillRect(wl.x * k, wl.z * k, k, k); g.globalAlpha = 1; } });
  for (const d of S.drones) { g.fillStyle = COL[d.p]; g.fillRect(d.x * k - k * .7, d.z * k - k * .7, k * 1.4, k * 1.4); }
  TOWERS.forEach((tw, i) => { if (towerUp(S, i, t)) { g.fillStyle = COL[tw[2]]; SYM.forEach(([a, b]) => g.fillRect((tw[0] + a - 1) * k, (tw[1] + b - 1) * k, k, k)); } });
  g.restore();
}
