// Generates the design overlay (gulf, islands, Arctic coast, southern land) on top of the frozen v5 region terrain.
// Run inside run_script after eval(trace.js). Writes ext-layers.json and overlay-for-build.json.
async function genExt() {
  const bi = await readImage('maps/v5/region/data/biome.png'); const BW = bi.width, BH = bi.height; const c = createCanvas(BW, BH).getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(bi, 0, 0); const B = c.getImageData(0, 0, BW, BH).data;
  const P = JSON.parse(await readFile('maps/simple/region-places.json')).places, g = id => P.find(p => p.id === id);
  const Y0 = -780, Y1 = 1560, S = 2, W = Math.ceil(2048 / S), H = Math.ceil((Y1 - Y0) / S);
  const fbm = (x, seed) => { let s = 0, a = 1, n = 0; for (let k = 0; k < 5; k++) { s += a * Math.sin(x * (0.004 * Math.pow(2.1, k)) + seed * (k + 1) * 1.7 + k * k); n += a; a *= .52; } return s / n; };
  const n2 = (x, y, seed) => { let s = 0, a = 1, n = 0; for (let k = 0; k < 4; k++) { const f = 0.006 * Math.pow(2, k); s += a * Math.sin(x * f + seed + k) * Math.cos(y * f * 1.13 - seed * 0.7 + k * 2); n += a; a *= .55; } return s / n; };
  const inPoly = (x, y, Q) => { let r = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
  const ch = (L, n) => { for (let k = 0; k < n; k++) { const o = []; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } L = o; } return L; };
  // gulf: the book polygon widened about its centre, joined to the open sea by a channel at its north end
  const G0 = g('redshire_gulf').pts, gc = G0.reduce((a, p) => [a[0] + p[0] / G0.length, a[1] + p[1] / G0.length], [0, 0]);
  const gulf = ch(G0.map(([x, y]) => [gc[0] + (x - gc[0]) * 1.45, gc[1] + (y - gc[1]) * 1.12]), 3);
  const channel = ch([[1752, 270], [1806, 270], [1812, 372], [1760, 372]], 2);
  const keepLand = ['arturia', 'redshire'].map(id => g(id).pts[0]);
  const blob = (cx, cy, r, seed) => (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), t = Math.atan2(dy, dx); return d < r * (1 + .2 * Math.sin(3 * t + seed) + .1 * Math.sin(5 * t + seed * 2)); };
  const rsIs = [blob(1803, 503, 17, 1), blob(1784, 534, 11, 2), blob(1823, 532, 9, 3)];
  const arcIs = [[300, -120, 34, 1], [430, -70, 16, 2], [560, -150, 22, 3], [880, -110, 40, 4], [1010, -60, 14, 5], [1180, -140, 26, 6], [1340, -90, 18, 7], [1560, -130, 44, 8], [1720, -70, 15, 9], [1860, -150, 24, 10], [150, -60, 14, 11]].map(a => blob(...a));
  const swIs = [[110, 1230, 34, 1], [205, 1330, 18, 2], [95, 1420, 46, 3], [250, 1490, 22, 4], [60, 1530, 16, 5], [300, 1410, 12, 6]].map(a => blob(...a));
  const arcCoast = x => -275 + fbm(x, 2.3) * 95;
  const westCoast = y => { const t = Math.min(1, Math.max(0, (y - 1061) / 90)); return 216 + (y - 1061) * .42 + t * fbm(y * 1.4, 5.1) * 45; };
  const southCoast = x => 1528 + fbm(x, 8.7) * 24;
  const cities = P.filter(p => p.shape === 'point' && p.id !== 'redshire_islands' && p.pts[0][1] >= 0 && p.pts[0][1] < 1061);
  const M = new Uint8Array(W * H), T = new Uint8Array(W * H), ARC = new Uint8Array(W * H), FOR = new Uint8Array(W * H), HIL = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) { const y = Y0 + (j + .5) * S; for (let i = 0; i < W; i++) { const x = (i + .5) * S, k = j * W + i; let l;
    if (y < 0) { l = y < arcCoast(x) || arcIs.some(f => f(x, y)); if (l) ARC[k] = 1; }
    else if (y < 1061) { const bx = Math.min(BW - 1, Math.floor(x)), by = Math.min(BH - 1, Math.floor(y)); T[k] = B[(by * BW + bx) * 4] > 1 ? 1 : 0; l = T[k] === 1;
      if (l && (inPoly(x, y, gulf) || inPoly(x, y, channel)) && !keepLand.some(([cx, cy]) => Math.hypot(x - cx, y - cy) < 14)) l = false;
      if (rsIs.some(f => f(x, y))) l = true; }
    else { l = (x > westCoast(y) && y < southCoast(x)) || swIs.some(f => f(x, y)); if (l) { if (n2(x, y, 1.3) > .28) FOR[k] = 1; if (n2(x, y, 4.1) > .42) HIL[k] = 1; } }
    M[k] = l ? 1 : 0; } }
  const fixed = []; for (const p of cities) { const [x, y] = p.pts[0]; const k = Math.floor((y - Y0) / S) * W + Math.floor(x / S); if (!M[k]) { fixed.push(p.id); for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) { if (i * i + j * j > 36) continue; const kk = k + j * W + i; if (kk >= 0 && kk < W * H) M[kk] = 1; } } }
  const tr = (src, test, opt) => trace(src, W, H, 1, test, opt).map(L => L.map(([x, y]) => [x * S, y * S + Y0]));
  const pd = Ls => Ls.map(L => 'M' + L.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z').join('');
  const r1 = L => L.map(p => p.map(v => +v.toFixed(1)));
  const land = tr(M, (s, i) => s[i] === 1, { minA: 2, eps: .7, smooth: 2 });
  const arc = tr(ARC, (s, i) => s[i] === 1 && M[i] === 1, { minA: 2, eps: .7, smooth: 2 });
  const fo = tr(FOR, (s, i) => s[i] === 1, { minA: 20, eps: 1, smooth: 2 }), hi = tr(HIL, (s, i) => s[i] === 1, { minA: 16, eps: 1, smooth: 2 });
  const inGrid = i => { const y = ((i / W) | 0) * S + Y0; return y >= 0 && y < 1061; };
  const added = tr(M, (s, i) => s[i] === 1 && !T[i] && inGrid(i), { minA: 1, eps: .5, smooth: 1 });
  const carved = tr(M, (s, i) => s[i] === 0 && T[i] === 1, { minA: 1, eps: .5, smooth: 1 });
  await saveFile('maps/simple/ext-layers.json', JSON.stringify({ land: pd(land), arctic: pd(arc), forest: pd(fo), hill: pd(hi) }));
  await saveFile('maps/simple/overlay-for-build.json', JSON.stringify({ about: "Snowmoon Party design overlay (placed by us) on the frozen v5 region terrain. Coordinates are region pixels (2048x1061 grid, 3.14365 km per px, y down; y<0 is north of the grid, y>1061 south). 'carved' = terrain land turned to sea (the Redshire gulf and its channel to the open sea); 'added' = sea turned to land inside the grid (Redshire's south islands, city disks); 'arctic_land' and 'south_land' lie outside the grid.",
    city_land_fixes: fixed, carved: carved.map(r1), added: added.map(r1),
    arctic_land: land.filter(L => L.every(p => p[1] < 0)).map(r1), south_land: land.filter(L => L.every(p => p[1] > 1061)).map(r1) }));
  return { fixed, n: [land.length, carved.length, added.length] };
}
