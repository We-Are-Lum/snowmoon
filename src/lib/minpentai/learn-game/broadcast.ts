/**
 * The watch screens' broadcast: Design's scripted four-player match (an imagined broadcast of the
 * Learn game, whose rules are invented for this edition). Towers, strikes, eliminations and the
 * resignation are timed by hand over simple drone physics, exactly as in Design's mockup.
 *
 * Ported line for line from docs/design/minpentai-intro-v3.dc.html (the x-dc script):
 *   W, H, DT, COL, NAME, TOWERS, STRIKES, OUT_AT, REACT, EVENTS, SEG, SHOTS -> lines 251–304
 *   SYM, GLIDER, SHIP, rng, clamp, smooth, lerp, wx, wz                     -> 403–410
 *   makeWorld, WORLD                                                        -> 412–426
 *   newSim, towerUp, addDebris, stepSim                                     -> 428–480
 *   slowAt, strikePos                                                       -> 481–485
 *   shotAt                                                                  -> Component.shot, 580–602
 *   hudAt                                                                   -> Component.hudTick, 670–681
 * Numbers, seeds (rng 7, 11, 42) and the order of every random draw are Design's; the test
 * (scripts/test-minpentai-learn.ts) steps Design's sim beside this one and compares.
 */
import { LEARN_TEXT } from '../learn-text';

export const W = 48;
export const H = 32;
export const DT = 1 / 30;
export const COL = ['#46D7E8', '#FFB43A', '#FF5C8A', '#A98BFF'];
export const NAME = ['Cyan', 'Amber', 'Pink', 'Violet'];
/** [x, z, player, born (s)]. 0–11 the home towers; 12 Cyan's and 13 Amber's forward towers. */
export const TOWERS: [number, number, number, number][] = [[40, 26, 0, .6], [44, 22, 0, 1.4], [37, 29, 0, 2.2], [6, 26, 1, .9], [10, 29, 1, 1.7], [4, 22, 1, 2.5], [6, 6, 2, 1.1], [10, 3, 2, 1.9], [4, 10, 2, 2.7], [42, 6, 3, .7], [38, 3, 3, 1.5], [44, 10, 3, 2.3], [30, 20, 0, 30.5], [14, 18, 1, 31.2]];
export interface Strike { p: number; f: number; to: number; imp: number; launch: number; d: number }
export const STRIKES: Strike[] = ([[1, 5, 8, 38], [0, 12, 7, 41], [3, 10, 5, 42.5], [0, 2, 6, 44.5], [3, 11, 12, 49], [0, 1, 11, 51], [1, 13, 10, 53], [0, 0, 9, 55.5], [0, 1, 13, 57]] as const).map(([p, f, to, imp]) => {
  const a = TOWERS[f], b = TOWERS[to], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { p, f, to, imp, launch: imp - d / 6, d };
});
/** When each player is out: Cyan never, Amber resigns at 58.2, Pink 44.5, Violet 55.5. */
export const OUT_AT = [99, 58.2, 44.5, 55.5];
export const REACT: [number, number][] = [[26.5, 0], [38, 2], [41, 2], [42.5, 1], [44.5, 2], [49, 0], [51, 3], [53, 3], [55.5, 3], [57, 1], [58.2, 0]];
/** [t, commentary, banner?, banner colour (player)?]; the words are in learn-text.ts. */
export type BEvent = [t: number, line: string, banner?: string, colour?: number];
const EV = LEARN_TEXT.events;
export const EVENTS: BEvent[] = [
  [0, EV.setup],
  [5, EV.begins, EV.bBegins, 0],
  [9, EV.see],
  [16, EV.fly],
  [26.5, EV.intervention, EV.bIntervention, 0],
  [31, EV.forward],
  [38, EV.pink1],
  [41, EV.pink2],
  [42.5, EV.violetHits],
  [44.5, EV.pinkOut, EV.bPinkOut, 2],
  [49, EV.violetForward],
  [51, EV.cyanAnswers],
  [53, EV.amberHits],
  [55.5, EV.violetOut, EV.bVioletOut, 3],
  [57, EV.cyanStrikes],
  [58.2, EV.resigns, EV.bCyanWins, 0],
  [62, EV.wreckage],
  [70, EV.above],
];
/** Each watch screen's slice of the match; the ninth entry is Design's and never used. */
export const SEG: [number, number][] = [[0, 8], [8, 16], [16, 26], [26, 34], [34, 46], [46, 62], [62, 70], [70, 78], [70, 78]];
export const SEGS_LEN = 8;
type V3 = [number, number, number];
export type ShotDef =
  | [number, number, 'crane', { R: number; h: number; a0: number; sp: number; look: V3 }, string]
  | [number, number, 'dolly', { a: V3; b: V3; la: V3; lb: V3 }, string]
  | [number, number, 'follow', { owner: number }, string]
  | [number, number, 'tower', { id: number }, string]
  | [number, number, 'strike', { s: number }, string]
  | [number, number, 'top', Record<string, never>, string];
const CAM = LEARN_TEXT.cams;
export const SHOTS: ShotDef[] = [
  [0, 5, 'crane', { R: 38, h: 22, a0: .9, sp: .07, look: [0, 0, 0] }, CAM.crane],
  [5, 8, 'dolly', { a: [0, 9, 31], b: [0, 6.5, 23], la: [0, 0, 3], lb: [0, 0, 2] }, CAM.wide],
  [8, 16, 'dolly', { a: [-34, 27, 30], b: [-28, 23, 24], la: [0, 0, 0], lb: [2, 0, 0] }, CAM.wide],
  [16, 21, 'follow', { owner: 0 }, CAM.follow],
  [21, 26, 'dolly', { a: [-12, 2.4, 9], b: [10, 2.4, 9], la: [-4, .6, 0], lb: [4, .6, 0] }, CAM.low],
  [26, 30, 'dolly', { a: [27, 12, 22], b: [23, 9, 18], la: [13, 0, 7], lb: [12, 0, 6] }, CAM.cyanCorner],
  [30, 34, 'dolly', { a: [-27, 7, 18], b: [-22, 5, 13], la: [-13, 0, 5], lb: [-12, 0, 4] }, CAM.amberCorner],
  [34, 36.8, 'dolly', { a: [-6, 30, 34], b: [-10, 26, 28], la: [-8, 0, -2], lb: [-10, 0, -3] }, CAM.wide],
  [36.8, 39.5, 'tower', { id: 8 }, CAM.symbol],
  [39.5, 41, 'strike', { s: 1 }, CAM.follow],
  [41, 42.2, 'tower', { id: 7 }, CAM.symbol],
  [42.2, 43.4, 'strike', { s: 3 }, CAM.follow],
  [43.4, 46, 'tower', { id: 6 }, CAM.symbol],
  [46, 48.3, 'dolly', { a: [30, 28, 30], b: [26, 24, 24], la: [4, 0, -2], lb: [6, 0, -3] }, CAM.wide],
  [48.3, 50, 'tower', { id: 12 }, CAM.symbol],
  [50, 51.8, 'tower', { id: 11 }, CAM.symbol],
  [51.8, 53.6, 'strike', { s: 6 }, CAM.follow],
  [53.6, 56.8, 'tower', { id: 9 }, CAM.symbol],
  [56.8, 58.2, 'strike', { s: 8 }, CAM.follow],
  [58.2, 62, 'crane', { R: 13, h: 7, a0: .2, sp: .16, look: [16, 0, 9] }, CAM.cyanCorner],
  [62, 70, 'dolly', { a: [-22, 3, 14], b: [16, 3.6, -8], la: [-6, 0, 2], lb: [8, 0, -4] }, CAM.low],
  [70, 99, 'top', {}, CAM.overhead],
];

/** The symbol's four cells (towers' tops) and the glider's (drones, strike craft). */
export const SYM: [number, number][] = [[0, 0], [1, 1], [2, 1], [1, 2]];
export const GLIDER: [number, number][] = [[1, 0], [2, 0], [0, 1], [3, 1]];
export const SHIP: [number, number][] = [[1, 0], [2, 0], [0, 1], [3, 1]];
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, t: number) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const wx = (x: number) => x + .5 - W / 2;
export const wz = (z: number) => z + .5 - H / 2;

export interface Wall { x: number; z: number; p: number; born: number; from: number }
export interface Crew { fx: number; fz: number; x: number; z: number; p: number; born: number }
export function makeWorld() {
  const r = rng(7), rock = new Float32Array(W * H);
  const centers = [[18, 10], [24, 16], [30, 23], [24, 8], [23, 25], [14, 15], [34, 15], [20, 20], [28, 12], [10, 15], [38, 18], [17, 5], [32, 28], [8, 19], [40, 13], [27, 18]];
  for (const [cx, cz] of centers) {
    let x = cx, z = cz;
    const n = 4 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      if (x >= 0 && x < W && z >= 0 && z < H) rock[z * W + x] = .5 + r() * 1.3;
      const d = Math.floor(r() * 4);
      if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else z--;
    }
  }
  const clear = (x: number, z: number, rad: number) => {
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) { const X = x + dx, Z = z + dz; if (X >= 0 && X < W && Z >= 0 && Z < H) rock[Z * W + X] = 0; }
  };
  TOWERS.forEach((t) => clear(t[0], t[1], 2));
  const walls: Wall[] = [], rw = rng(11);
  TOWERS.forEach((t, ti) => {
    if (ti >= 12) return;
    const [x, z, p] = t, dx = Math.sign(24 - x), dz = Math.sign(16 - z);
    [[x + dx * 3, z + dz * 2], [x + dx * 2, z + dz * 3]].forEach((c) => walls.push({ x: c[0], z: c[1], p, born: 1 + rw() * 3.5, from: ti }));
  });
  [0, 1, 2, 3].forEach((p) => {
    const ti = p * 3, [x, z] = TOWERS[ti], dx = Math.sign(24 - x), dz = Math.sign(16 - z);
    for (let k = 0; k < 5; k++) walls.push({ x: x + dx * (5 + k), z: z + dz * (5 - k), p, born: 27.4 + p * .25 + k * .8, from: ti });
  });
  walls.forEach((w) => { w.x = clamp(w.x, 0, W - 1); w.z = clamp(w.z, 0, H - 1); clear(w.x, w.z, 0); });
  const crews: Crew[] = walls.map((w) => ({ fx: TOWERS[w.from][0], fz: TOWERS[w.from][1], x: w.x, z: w.z, p: w.p, born: w.born }));
  crews.push({ fx: 40, fz: 26, x: 30, z: 20, p: 0, born: 30.5 }, { fx: 37, fz: 29, x: 30, z: 20, p: 0, born: 30.3 }, { fx: 10, fz: 29, x: 14, z: 18, p: 1, born: 31.2 }, { fx: 6, fz: 26, x: 14, z: 18, p: 1, born: 31 });
  return { rock, walls, crews };
}
export const WORLD = makeWorld();

export interface Drone { id: number; x: number; z: number; dx: number; dz: number; p: number; life: number }
export interface Debris { x: number; y: number; z: number; vx: number; vy: number; vz: number; ry: number; rx: number; settled: boolean; col: string }
export interface Flash { x: number; z: number; t0: number; c: string }
export interface Sim {
  t: number;
  r: () => number;
  drones: Drone[];
  nid: number;
  debris: Debris[];
  flashes: Flash[];
  wallAlive: boolean[];
  wallAt: Int16Array;
  towerDead: number[];
  emit: number[];
  strikeDone: boolean[];
}
export function newSim(): Sim {
  const wallAt = new Int16Array(W * H).fill(-1);
  WORLD.walls.forEach((w, i) => { wallAt[w.z * W + w.x] = i; });
  return { t: 0, r: rng(42), drones: [], nid: 1, debris: [], flashes: [], wallAlive: WORLD.walls.map(() => true), wallAt, towerDead: TOWERS.map(() => -1), emit: [5, 5.15, 5.3, 5.45], strikeDone: STRIKES.map(() => false) };
}
export const towerUp = (S: Sim, i: number, t: number) => t >= TOWERS[i][3] && (S.towerDead[i] < 0 || t < S.towerDead[i]);
export function addDebris(S: Sim, x: number, y: number, z: number, vx: number, vy: number, vz: number, col: string) {
  S.debris.push({ x, y, z, vx, vy, vz, ry: S.r() * 6.28, rx: S.r() * 6.28, settled: vy === 0 && y <= .12, col });
  if (S.debris.length > 1400) { const k = S.debris.findIndex((d) => d.settled); S.debris.splice(k < 0 ? 0 : k, 1); }
}
export function stepSim(S: Sim) {
  S.t += DT;
  const t = S.t, r = S.r;
  for (let p = 0; p < 4; p++) {
    if (t < 5 || t >= 58.2 || t >= OUT_AT[p] || t < S.emit[p]) continue;
    S.emit[p] = t + 2.4 + r() * 1.4;
    const mine = TOWERS.map((tw, i) => i).filter((i) => TOWERS[i][2] === p && towerUp(S, i, t));
    if (!mine.length) continue;
    const tw = TOWERS[mine[Math.floor(r() * mine.length)]];
    let dx = 0, dz = 0;
    if (r() < .5) dx = Math.sign(24 - tw[0]) || 1; else dz = Math.sign(16 - tw[1]) || 1;
    S.drones.push({ id: S.nid++, x: tw[0] + .5 + dx * 1.6, z: tw[1] + .5 + dz * 1.6, dx, dz, p, life: 8 + r() * 6 });
  }
  const v = 4.2 * DT;
  for (const d of S.drones) {
    const nx = d.x + d.dx * v, nz = d.z + d.dz * v;
    if (nx < .3 || nx > W - .3) { d.dx = -d.dx; continue; }
    if (nz < .3 || nz > H - .3) { d.dz = -d.dz; continue; }
    const k = Math.floor(nz) * W + Math.floor(nx);
    if (WORLD.rock[k] > 0) {
      if (r() < .5) { d.dx = -d.dx; d.dz = -d.dz; } else if (d.dx) { d.dz = r() < .5 ? 1 : -1; d.dx = 0; } else { d.dx = r() < .5 ? 1 : -1; d.dz = 0; }
      continue;
    }
    const wi = S.wallAt[k];
    if (wi >= 0 && S.wallAlive[wi] && WORLD.walls[wi].born <= t && WORLD.walls[wi].p !== d.p) {
      d.dx = -d.dx; d.dz = -d.dz;
      if (r() < .35) { S.wallAlive[wi] = false; for (let q = 0; q < 3; q++) addDebris(S, Math.floor(nx) + .5, .4, Math.floor(nz) + .5, (r() - .5) * 3, 2 + r() * 2, (r() - .5) * 3, COL[WORLD.walls[wi].p]); }
      continue;
    }
    d.x = nx; d.z = nz; d.life -= DT;
  }
  const ds = S.drones;
  for (let i = 0; i < ds.length; i++) {
    const a = ds[i];
    if (a.life <= 0) continue;
    for (let j = i + 1; j < ds.length; j++) {
      const b = ds[j];
      if (b.life <= 0 || a.p === b.p) continue;
      if (Math.abs(a.x - b.x) < .55 && Math.abs(a.z - b.z) < .55) {
        a.life = b.life = -1;
        for (let q = 0; q < 2; q++) { addDebris(S, a.x, .5, a.z, (r() - .5) * 4, 2 + r() * 2, (r() - .5) * 4, COL[a.p]); addDebris(S, b.x, .5, b.z, (r() - .5) * 4, 2 + r() * 2, (r() - .5) * 4, COL[b.p]); }
        break;
      }
    }
  }
  S.drones = ds.filter((d) => { if (d.life > 0) return true; if (d.life > -1) addDebris(S, d.x, .12, d.z, 0, 0, 0, COL[d.p]); return false; });
  STRIKES.forEach((s, i) => {
    if (S.strikeDone[i] || t < s.imp) return;
    S.strikeDone[i] = true; S.towerDead[s.to] = s.imp;
    const tw = TOWERS[s.to];
    for (let q = 0; q < 34; q++) { const a = r() * 6.28, sp = 1 + r() * 6; addDebris(S, tw[0] + .5, 1.4 + r(), tw[1] + .5, Math.cos(a) * sp, 3 + r() * 7, Math.sin(a) * sp, q % 3 ? '#8A8C96' : COL[tw[2]]); }
    S.flashes.push({ x: tw[0] + .5, z: tw[1] + .5, t0: t, c: COL[tw[2]] });
  });
  for (const d of S.debris) {
    if (d.settled) continue;
    d.vy -= 18 * DT; d.x += d.vx * DT; d.y += d.vy * DT; d.z += d.vz * DT;
    d.x = clamp(d.x, .2, W - .2); d.z = clamp(d.z, .2, H - .2);
    if (d.y <= .12) { d.y = .12; if (Math.abs(d.vy) < 2.5) { d.settled = true; } else { d.vy *= -.3; d.vx *= .5; d.vz *= .5; } }
  }
  S.flashes = S.flashes.filter((f) => t - f.t0 < 1);
}
export const slowAt = (t: number) => (t > 44.1 && t < 45) || (t > 55.1 && t < 56) ? .3 : 1;
export function strikePos(s: Strike, t: number): [number, number, number, number] {
  const a = TOWERS[s.f], b = TOWERS[s.to], u = clamp((t - s.launch) / (s.imp - s.launch), 0, 1), apex = Math.min(6, s.d * .18);
  return [lerp(wx(a[0]), wx(b[0]), u), 2.2 + Math.sin(Math.PI * u) * apex - u * .8, lerp(wz(a[1]), wz(b[1]), u), u];
}

/** The camera's follow target, kept between frames (Design's R.follow). */
export interface CamState { follow: number; lastShot: number }
export interface Shot { si: number; pos: number[]; look: number[]; fov: number; label: string }
/** Component.shot: where the camera wants to be at time t. */
export function shotAt(t: number, reduced: boolean, S: Sim, R: CamState): Shot {
  let si = SHOTS.findIndex((s) => t >= s[0] && t < s[1]);
  if (si < 0) si = SHOTS.length - 1;
  const sd = SHOTS[si], [s0, s1, type, , label] = sd, red = reduced;
  const u = red ? 0 : clamp((t - s0) / (s1 - s0), 0, 1), e = u * u * (3 - 2 * u);
  let pos: number[], look: number[], fov = 50;
  if (sd[2] === 'crane') { const o = sd[3], tt = red ? 0 : t - s0, ang = o.a0 + o.sp * tt; pos = [o.look[0] + Math.cos(ang) * o.R, o.h - (red ? 0 : tt * .4), o.look[2] + Math.sin(ang) * o.R]; look = o.look; }
  else if (sd[2] === 'dolly') { const o = sd[3]; pos = o.a.map((v, k) => lerp(v, o.b[k], e)); look = o.la.map((v, k) => lerp(v, o.lb[k], e)); }
  else if (sd[2] === 'tower') {
    const tw = TOWERS[sd[3].id], X = wx(tw[0]), Z = wz(tw[1]);
    let dx = X, dz = Z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const dist = lerp(7, 5, e); pos = [X + dx * dist - dz * 2.2, 1.3, Z + dz * dist + dx * 2.2]; look = [X, 1.7, Z]; fov = 46;
  } else if (sd[2] === 'strike' && !red) {
    const s = STRIKES[sd[3].s], p = strikePos(s, t), q = strikePos(s, Math.min(s.imp, t + .15));
    let dx = q[0] - p[0], dz = q[2] - p[2];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    pos = [p[0] - dx * 5, p[1] + 1.8, p[2] - dz * 5]; look = [p[0] + dx * 6, p[1] - .6, p[2] + dz * 6];
  } else if (sd[2] === 'follow' && !red) {
    let d = S.drones.find((x) => x.id === R.follow);
    if (!d) { const mine = S.drones.filter((x) => x.p === (sd[3] as { owner: number }).owner); d = mine[mine.length - 1]; R.follow = d ? d.id : 0; }
    if (d) { const X = d.x - W / 2, Z = d.z - H / 2; pos = [X - d.dx * 3.4, 1.3, Z - d.dz * 3.4]; look = [X + d.dx * 6, .4, Z + d.dz * 6]; }
    else { pos = [0, 26, 28]; look = [0, 0, 0]; }
  } else if (type === 'top') { const f = red ? 1 : smooth(70.3, 74.5, t); pos = [lerp(16, 0, f), lerp(3.6, 46, f), lerp(-8, .01, f)]; look = [lerp(8, 0, f), 0, lerp(-4, 0, f)]; fov = lerp(50, 38, f); }
  else { pos = [0, 26, 28]; look = [0, 0, 0]; }
  return { si, pos, look, fov, label };
}

export interface Eyes { ex: number; ey: number; eh: number; op: number }
export interface Hud {
  minus: string;
  minusC: string;
  eyes: Eyes[];
  react: number;
  reactWin: boolean;
  turn: string;
  cam: string;
  comment: string;
  banner: string;
  bannerC: string;
  countdown: boolean;
  counts: { t: string; c: string }[];
}
/** Component.hudTick's values at the sim's time. */
export function hudAt(S: Sim, camLabel: string | undefined): Hud {
  const t = S.t, HT = LEARN_TEXT.hud;
  let ev: BEvent | null = null;
  for (const e of EVENTS) if (e[0] <= t + 1e-6) ev = e;
  let ban: BEvent | null = null;
  for (const e of EVENTS) if (e[2] && t >= e[0] && t - e[0] < (e[2] === EV.bCyanWins ? 3.8 : 2.4)) ban = e;
  const counts = [0, 1, 2, 3].map((p) => {
    const out = t >= OUT_AT[p], nn = TOWERS.filter((tw, i) => tw[2] === p && towerUp(S, i, t)).length;
    return { t: NAME[p].toUpperCase() + ' ' + (out ? HT.out : '●'.repeat(nn)), c: out ? '#7A7D88' : COL[p] };
  });
  const eyes = [0, 1, 2, 3].map((p) => {
    const out = t >= OUT_AT[p], blink = ((t * .7 + p * .37) % 1) < .06;
    return { ex: out ? 0 : Math.round(Math.sin(t * 1.3 + p * 2) * 2 + Math.sin(t * 3.1 + p) * .8), ey: out ? 2 : Math.round(Math.cos(t * 1.7 + p)), eh: out || blink ? 1 : 7, op: out ? .45 : 1 };
  });
  let mn: Strike | null = null;
  for (const s of STRIKES) if (t >= s.imp && t - s.imp < 1.8) mn = s;
  let rx: [number, number] | null = null;
  for (const e of REACT) if (t >= e[0] && t - e[0] < 2.4) rx = e;
  return {
    minus: mn ? HT.minus(NAME[TOWERS[mn.to][2]]) : '',
    minusC: mn ? COL[TOWERS[mn.to][2]] : '#fff',
    eyes,
    react: rx ? rx[1] : -1,
    reactWin: !!(rx && rx[0] === 58.2),
    turn: HT.turn(Math.floor(t * 34).toLocaleString('en-US')),
    cam: camLabel || CAM.crane,
    comment: ev ? ev[1] : '',
    banner: ban ? ban[2]! : '',
    bannerC: ban ? COL[ban[3]!] : '#E7E4DD',
    countdown: t < 4.8,
    counts,
  };
}
