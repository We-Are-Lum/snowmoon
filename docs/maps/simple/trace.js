// Vector tracing helpers for the simple map: mask -> smoothed contour loops (no terrain is moved).
function field(src, W, H, f, test) {
  const iw = Math.ceil(W / f), ih = Math.ceil(H / f), P = 3, w = iw + 2 * P, h = ih + 2 * P, F = new Float32Array(w * h);
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    let s = 0, n = 0;
    for (let y = j * f; y < Math.min(H, j * f + f); y++) for (let x = i * f; x < Math.min(W, i * f + f); x++) { s += test(src, y * W + x) ? 1 : 0; n++; }
    F[(j + P) * w + i + P] = n ? s / n : 0;
  }
  // edges: land that touches the frame continues past it (no false coast at the frame); only the outermost ring is empty
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { if (i >= P && i < w - P && j >= P && j < h - P) continue; const ci = Math.min(w - P - 1, Math.max(P, i)), cj = Math.min(h - P - 1, Math.max(P, j)); F[j * w + i] = F[cj * w + ci]; }
  const G = new Float32Array(w * h);
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += F[(j + dy) * w + i + dx] * (dx || dy ? (dx && dy ? 1 : 2) : 4);
    G[j * w + i] = s / 16;
  }
  return { F: G, w, h, f, P };
}
function contours(fd, t) {
  const { F, w, h } = fd, v = (i, j) => F[j * w + i], P = new Map(), adj = new Map();
  const pt = k => { if (P.has(k)) return; const [d, i, j] = k.split(',').map((q, n) => n ? +q : q);
    if (d === 'h') { const a = v(i, j), b = v(i + 1, j); P.set(k, [i + (t - a) / (b - a), j]); } else { const a = v(i, j), b = v(i, j + 1); P.set(k, [i, j + (t - a) / (b - a)]); } };
  const add = (a, b) => { pt(a); pt(b); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = v(i, j) > t, b = v(i + 1, j) > t, c = v(i + 1, j + 1) > t, d = v(i, j + 1) > t, idx = a * 8 + b * 4 + c * 2 + d;
    if (!idx || idx === 15) continue;
    const T = `h,${i},${j}`, R = `v,${i + 1},${j}`, B = `h,${i},${j + 1}`, L = `v,${i},${j}`, ctr = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 > t;
    const S = { 1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: ctr ? [[L, T], [B, R]] : [[L, B], [T, R]], 6: [[T, B]], 7: [[L, T]], 8: [[L, T]], 9: [[T, B]], 10: ctr ? [[L, B], [T, R]] : [[L, T], [B, R]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]] }[idx];
    S.forEach(([p, q]) => add(p, q));
  }
  const seen = new Set(), loops = [];
  for (const k of adj.keys()) {
    if (seen.has(k)) continue; const loop = []; let cur = k, prev = null;
    while (cur && !seen.has(cur)) { seen.add(cur); loop.push(P.get(cur)); const nb = adj.get(cur).filter(q => q !== prev && !seen.has(q)); prev = cur; cur = nb[0]; }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}
function area(L) { let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); }
function dp(pts, eps) {
  if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
function chaikin(L, n) { for (let k = 0; k < n; k++) { const o = []; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } L = o; } return L; }
function trace(src, W, H, f, test, opt) {
  const fd = field(src, W, H, f, test), loops = contours(fd, opt.t || 0.5), P = fd.P;
  return loops.filter(L => area(L) >= (opt.minA || 4)).map(L => { let m = 0, mi = 0; L.forEach((p, i) => { const d = Math.hypot(p[0] - L[0][0], p[1] - L[0][1]); if (d > m) { m = d; mi = i; } });
    const e = opt.eps || 0.7, s = dp(L.slice(0, mi + 1), e).concat(dp(L.slice(mi).concat([L[0]]), e).slice(1, -1)); return chaikin(s, opt.smooth ?? 2).map(([x, y]) => [(x - P + .5) * f, (y - P + .5) * f]); });
}
function pathD(loops, dec) { const r = v => +v.toFixed(dec ?? 1); return loops.map(L => 'M' + L.map(p => r(p[0]) + ',' + r(p[1])).join('L') + 'Z').join(''); }
