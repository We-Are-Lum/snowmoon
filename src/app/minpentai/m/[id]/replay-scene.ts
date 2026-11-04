/**
 * The 3D action (owner, 2026-11-03: "2D is for thinking; 3D is for the action"). It looks and moves like the tutorial's
 * 3D broadcast, from the same parts (../../scene-kit.ts): the dark stage in fog, filmic light, glowing pieces, flashes
 * and debris, a camera that eases. Drawn only from the frames the 2D board is given (solo.ts turnFrames: a board in the
 * side's fog view, and the squares it sees), so it can't show anything the page wasn't sent. Every effect comes from
 * replay-events.ts, which reads only those frames and fires only on squares in sight. The dark is a cloud over the
 * squares out of sight; it drifts and covers nothing, because nothing hidden was sent. Once the match is over the
 * frames are the whole board, and there is no cloud.
 *
 * This edition's own abstract pieces: grey blocks for rocks; for towers a metal column under a floating, turning
 * emblem in the side's colour; for gliders a chevron of small lit cubes (a bright core for symbol gliders); low blocks
 * for squares; thin slabs for mirrors; squat cubes for factories; bars for moving walls.
 *
 * Two quality levels: high (shadows, pixel ratio up to 1.5, more debris) and low (none of those), so a phone can hold
 * its frame target; the page measures and steps down, and plays the action in 2D if even low can't hold it.
 */
import type * as THREE_NS from 'three';
import type { boardOut } from '~/lib/minpentai/agent-play/solo';
import { easeCamera, fpsMeter, glowTexture, makeDebris, makeFlashes, makeRenderer, makeStage, type Quality } from '../../scene-kit';
import { actionCentre, dirOf, replayEvents, type Moment, type ReplayEvent } from './replay-events';

type T3 = typeof THREE_NS;
type Board = ReturnType<typeof boardOut>;
export interface ReplayScene {
  /** Show a frame. `prev`, when given, is the frame before it: the action between them plays over `stepMs`. */
  show(board: Board, seen: [number, number][] | null, prev: Board | null, stepMs: number): void;
  setQuality(q: Quality): void;
  /** An instant replay's camera: close on a square in sight (replay-events' moments), or null for the usual view. */
  focus(f: { at: [number, number]; mode: Moment['mode']; ms: number } | null): void;
  /** Median frames a second since the last reset (0 until there are enough frames), and the seconds measured. */
  fps(): { fps: number; seconds: number };
  resetFps(): void;
  dispose(): void;
}

const CYAN = '#46D7E8', AMBER = '#FFB43A';
const sideCol = (side: string | null) => (side === 'mine' ? CYAN : side === 'theirs' ? AMBER : '#8A8C96');
/** The glider's chevron: five cubes, (forward, across) in squares, pointing along its heading. */
const CHEVRON: [number, number][] = [[.24, 0], [.06, -.16], [.06, .16], [-.12, -.32], [-.12, .32]];
/** A tower's emblem: a small plus of cubes. */
const EMBLEM: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];

export function buildReplayScene(T: T3, el: HTMLElement, W: number, H: number, quality: Quality = 'high', pieceScale = 1): ReplayScene {
  const P = pieceScale;
  const size = () => [Math.max(1, el.clientWidth), Math.max(1, el.clientHeight)] as const;
  let q = quality;
  const renderer = makeRenderer(T, el, ...size(), { quality: q, maxRatio: q === 'high' ? 1.5 : 1 });
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, size()[0] / size()[1], .1, 400);
  const stage = makeStage(T, scene, W, H, { fog: .012 });
  const glowTex = glowTexture(T);
  const flashes = makeFlashes(T, scene, glowTex, 24);
  const debris = makeDebris(T, scene, 700, true);
  const cam = easeCamera(T, camera);
  const meter = fpsMeter();

  const X = (x: number) => x - W / 2 + .5, Z = (y: number) => y - H / 2 + .5;
  const D = new T.Object3D(), C = new T.Color();
  const disposables: { dispose(): void }[] = [glowTex];
  const inst = (geo: THREE_NS.BufferGeometry, mat: THREE_NS.Material, n: number, shadow = true) => {
    const mesh = new T.InstancedMesh(geo, mat, n);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = shadow; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    disposables.push(geo, mat);
    scene.add(mesh);
    return mesh;
  };
  const box = () => new T.BoxGeometry(1, 1, 1);
  const std = (extra: Partial<THREE_NS.MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color: '#ffffff', roughness: .6, ...extra });

  // The squares the side sees: a faint light on the field, like the broadcast's sight discs.
  const sight = inst(new T.PlaneGeometry(.96, .96), new T.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: .07, depthWrite: false }), W * H, false);
  const rocks = inst(box(), std({ color: '#4B4C55', roughness: .85 }), W * H);
  const columns = inst(new T.CylinderGeometry(.12, .24, 1.3, 10), std({ color: '#5A5E6C', metalness: .6, roughness: .35, emissive: '#15161B' }), 64);
  const emblems = inst(box(), new T.MeshBasicMaterial({ color: '#ffffff' }), 64 * EMBLEM.length, false);
  const bases = inst(new T.RingGeometry(.3, .42, 28), new T.MeshBasicMaterial({ color: '#ffffff', side: T.DoubleSide }), 64, false);
  const squares = inst(box(), std({ roughness: .5, emissive: '#111111' }), W * H);
  const mirrors = inst(box(), std({ metalness: .5, roughness: .25 }), W * H);
  const factories = inst(box(), std(), W * H);
  const walls = inst(box(), std({ roughness: .5, emissive: '#111111' }), W * H);
  const resting = inst(new T.SphereGeometry(.16, 12, 10), new T.MeshBasicMaterial({ color: '#ffffff' }), W * H, false);
  const cubes = inst(box(), new T.MeshBasicMaterial({ color: '#ffffff' }), 300 * CHEVRON.length, false);
  // Glows: one additive point per glider, tower and symbol core (the broadcast's glow layer).
  const GMAX = 400, gpos = new Float32Array(GMAX * 3), gcol = new Float32Array(GMAX * 3), pg = new T.BufferGeometry();
  pg.setAttribute('position', new T.BufferAttribute(gpos, 3)); pg.setAttribute('color', new T.BufferAttribute(gcol, 3));
  const glowMat = new T.PointsMaterial({ size: 1.9, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true });
  const glow = new T.Points(pg, glowMat); glow.frustumCulled = false; scene.add(glow); disposables.push(pg, glowMat);
  // The cloud: soft puffs over the squares out of sight, drifting.
  const cloudTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(200,205,220,0.95)'); grad.addColorStop(.6, 'rgba(200,205,220,0.6)'); grad.addColorStop(1, 'rgba(200,205,220,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c); disposables.push(t); return t;
  })();
  const cloud = inst(new T.PlaneGeometry(1.9, 1.9), new T.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: .6, depthWrite: false, color: '#7E8496' }), W * H * 2, false);
  const cloudCells: [number, number][] = [];

  const setQ = (nq: Quality) => {
    q = nq;
    renderer.setPixelRatio(Math.min(q === 'high' ? 1.5 : 1, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = q === 'high';
    stage.sun.castShadow = q === 'high';
    scene.traverse((o) => { const m = (o as THREE_NS.Mesh).material as THREE_NS.Material | undefined; if (m) m.needsUpdate = true; });
  };
  setQ(q);

  const finish = (mesh: THREE_NS.InstancedMesh, n: number) => { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; };
  const place = (mesh: THREE_NS.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, color?: string, ry = 0) => {
    D.position.set(x, y, z); D.rotation.set(0, ry, 0); D.scale.set(sx, sy, sz); D.updateMatrix();
    mesh.setMatrixAt(i, D.matrix);
    if (color) mesh.setColorAt(i, C.set(color));
  };

  type Glider = { side: string; from: [number, number]; to: [number, number]; dir: string; symbol?: boolean; fade: 'in' | 'out' | null };
  let state: { board: Board; gliders: Glider[]; at: number; stepMs: number } | null = null;
  let shake = 0, centre: [number, number] | null = null;
  let focusOn: { at: [number, number]; mode: Moment['mode']; ms: number; since: number } | null = null;

  function show(board: Board, seen: [number, number][] | null, prev: Board | null, stepMs: number) {
    const ev = replayEvents(prev, board, seen, [W, H]);
    // The static pieces, as this frame shows them.
    const lit = seen ? new Set(seen.map(([x, y]) => y * W + x)) : null;
    let n = 0;
    if (lit) for (const k of lit) { D.position.set(X(k % W), .015, Z(Math.floor(k / W))); D.rotation.set(-Math.PI / 2, 0, 0); D.scale.set(1, 1, 1); D.updateMatrix(); sight.setMatrixAt(n++, D.matrix); }
    finish(sight, n);
    n = 0; for (const r of board.rocks) place(rocks, n++, X(r.x), .35, Z(r.y), .94, .7, .94); finish(rocks, n);
    n = 0; for (const s of board.squares) place(squares, n++, X(s.x), .2, Z(s.y), .74, s.hits_left > 1 ? .4 : .22, .74, C.set(sideCol(s.side)).multiplyScalar(.6).getStyle()); finish(squares, n);
    n = 0; for (const m of board.mirrors ?? []) place(mirrors, n++, X(m.x), .3, Z(m.y), .95, .6, .07, sideCol(m.side), m.slant === '/' ? Math.PI / 4 : -Math.PI / 4); finish(mirrors, n);
    n = 0; for (const f of board.factories ?? []) place(factories, n++, X(f.x), .22, Z(f.y), .62, .44, .62, C.set(sideCol(f.side)).multiplyScalar(.7).getStyle()); finish(factories, n);
    n = 0; for (const w of board.moving_walls ?? []) for (const c of w.squares) place(walls, n++, X(c.x), .2, Z(c.y), .86, .4, .86, C.set(sideCol(w.side)).multiplyScalar(.55).getStyle()); finish(walls, n);
    n = 0; for (const r of board.resting_symbol_gliders ?? []) place(resting, n++, X(r.x), .2, Z(r.y), 1, 1, 1, sideCol(r.side)); finish(resting, n);
    n = 0; for (const t of board.towers) { D.position.set(X(t.x), .02, Z(t.y)); D.rotation.set(-Math.PI / 2, 0, 0); D.scale.set(1, 1, 1); D.updateMatrix(); bases.setMatrixAt(n, D.matrix); bases.setColorAt(n, C.set(sideCol(t.side))); n++; } finish(bases, n);
    // The cloud: two puffs a square out of sight; none once the match is over.
    cloudCells.length = 0;
    if (lit) for (let k = 0; k < W * H; k++) if (!lit.has(k)) cloudCells.push([k % W, Math.floor(k / W)]);
    // Gliders: where each was a step ago and where it is (replay-events), and the ones fading out into the dark.
    const gliders: Glider[] = [];
    for (const e of ev) {
      if (e.kind === 'glide') gliders.push({ side: e.side, from: e.from, to: e.to, dir: e.dir, symbol: e.symbol, fade: null });
      else if (e.kind === 'leave') { const [dx, dy] = dirOf(e.dir); gliders.push({ side: e.side, from: e.at, to: [e.at[0] + dx, e.at[1] + dy], dir: e.dir, fade: 'out' }); }
    }
    for (const g of board.gliders) if (!ev.some((e) => e.kind === 'glide' && e.to[0] === g.x && e.to[1] === g.y && e.side === g.side)) gliders.push({ side: g.side, from: [g.x, g.y], to: [g.x, g.y], dir: g.dir, symbol: g.symbol, fade: prev ? 'in' : null });
    // Steady motion: a step that follows the last one starts when the last one ends (the page's timer drifts a few
    // milliseconds against the display; this keeps the gliders' speed even), unless it's far off (a pause, a skip).
    const now = performance.now(), end = state && prev ? state.at + state.stepMs : -1;
    const at = end > 0 && Math.abs(now - end) < stepMs * .5 ? end : now;
    state = { board, gliders, at, stepMs };
    centre = actionCentre(ev);
    // Effects, each on a square in sight (replay-events fires no other).
    fire(ev);
  }

  function fire(ev: ReplayEvent[]) {
    const many = q === 'high' ? 1 : .35;
    for (const e of ev) {
      if (e.kind === 'destroyed') {
        const [x, y] = e.at, big = e.piece === 'tower';
        flashes.fire(X(x), big ? 1.4 : .7, Z(y), e.piece === 'rock' ? '#C9CBD6' : sideCol(e.side), big ? 4.2 : 2.2, big ? .9 : .55);
        debris.burst(X(x), Z(y), e.piece === 'rock' ? '#6A6C76' : sideCol(e.side), Math.round((big ? 46 : e.piece === 'rock' ? 22 : 16) * many), big ? 1.2 : .8);
        if (big) shake = Math.max(shake, .22);
      } else if (e.kind === 'hit') {
        // A chip: a hard white spark, a coloured glow behind it, a few chips flying.
        flashes.fire(X(e.at[0]), .7, Z(e.at[1]), '#FFFFFF', 2.4, .22);
        flashes.fire(X(e.at[0]), .5, Z(e.at[1]), sideCol(e.side), 1.8, .5);
        debris.burst(X(e.at[0]), Z(e.at[1]), sideCol(e.side), Math.round(12 * many), .9);
        shake = Math.max(shake, .05);
      } else if (e.kind === 'formed') {
        flashes.fire(X(e.at[0]), 1.2, Z(e.at[1]), sideCol(e.side), 3, .8);
      } else if (e.kind === 'stopped') {
        flashes.fire(X(e.at[0]), .5, Z(e.at[1]), sideCol(e.side), 1.4, .35);
        debris.burst(X(e.at[0]), Z(e.at[1]), sideCol(e.side), Math.round(5 * many), .5);
      }
    }
  }

  // The camera: a three-quarter view from Cyan's side, swaying slowly, as the broadcast's cameras do.
  const R = Math.max(W, H);
  let raf = 0, last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    last = now;
    meter.tick(dt);
    const t = now / 1000;
    // Far enough to frame the whole board at any width (the fov is vertical, so a narrow frame needs more distance).
    const fit = Math.max(H, W / camera.aspect) / 2 / Math.tan((camera.fov * Math.PI) / 360);
    if (focusOn) {
      // An instant replay: around a square in sight. close: a quick close-up; orbit: once around a little; sweep: in
      // from the usual view; final: in close, then back over the whole board.
      const u = Math.min(1, (now - focusOn.since) / focusOn.ms), fx = X(focusOn.at[0]), fz = Z(focusOn.at[1]);
      const sm = (x: number) => x * x * (3 - 2 * x);
      let a = -.34, r = 4.2, h = 3.2, lookY = .5, wide = 0;
      if (focusOn.mode === 'close') { r = 4.4 - .8 * sm(u); h = 2.6 - .4 * sm(u); a = -.3 + .25 * u; }
      else if (focusOn.mode === 'orbit') { r = 4.6; h = 3; a = -.6 + 1.6 * sm(u); }
      else if (focusOn.mode === 'sweep') { const v = sm(Math.min(1, u * 1.4)); r = 9 - 5.6 * v; h = 7.5 - 5.3 * v; a = -1 + 1.2 * sm(u); }
      else { const inT = Math.min(1, u / .55), out = Math.max(0, (u - .62) / .38); r = 6 - 2.8 * sm(inT); h = 4.5 - 2.6 * sm(inT); a = -.8 + .6 * u; wide = sm(out); lookY = .4; }
      const near: [number, number, number] = [fx + Math.sin(a) * r, h, fz + Math.cos(a) * r], far: [number, number, number] = [0, fit * 1.45, fit * .55];
      cam.aim(near.map((v, i) => v + (far[i] - v) * wide) as [number, number, number], [fx * (1 - wide), lookY * (1 - wide), fz * (1 - wide)]);
      cam.update(dt, shake, 5);
    } else {
      // The usual view, swaying slowly; during playback it leans gently toward this step's action in sight.
      const a = -.34 + Math.sin(t * .09) * .07, d = fit * (1.27 + Math.sin(t * .13) * .03);
      const [cx, cz] = centre ? [X(centre[0]) * .22, Z(centre[1]) * .22] : [0, 0];
      cam.aim([cx + Math.sin(a) * d * .66, d * .75, cz + Math.cos(a) * d * .66], [cx, 0, cz - H * .04]);
      cam.update(dt, shake);
    }
    shake = Math.max(0, shake - dt * .6);
    if (state) {
      // Linear through the step: a glider crosses each square at a steady speed; a bounce turns at once.
      const e = state.stepMs > 0 ? Math.min(1, Math.max(0, (now - state.at) / state.stepMs)) : 1;
      let n = 0, gn = 0;
      const glowAt = (x: number, y: number, z: number, col: string, s: number) => { if (gn >= GMAX) return; C.set(col).multiplyScalar(s); gpos.set([x, y, z], gn * 3); gcol.set([C.r, C.g, C.b], gn * 3); gn++; };
      for (const g of state.gliders) {
        const [dx, dy] = dirOf(g.dir), len = Math.hypot(dx, dy) || 1, fx = dx / len, fz = dy / len;
        const gx = X(g.from[0] + (g.to[0] - g.from[0]) * e), gz = Z(g.from[1] + (g.to[1] - g.from[1]) * e);
        const vis = g.fade === 'in' ? e : g.fade === 'out' ? 1 - e : 1, y = .42 + Math.sin(t * 6 + g.from[0] * 1.3 + g.from[1]) * .05;
        const col = sideCol(g.side), sz = .16 * P * Math.max(.001, vis);
        for (const [f, s] of CHEVRON) place(cubes, n++, gx + (fx * f - fz * s) * P, y, gz + (fz * f + fx * s) * P, sz, sz, sz, col);
        glowAt(gx, y, gz, col, (g.symbol ? 1.3 : 1) * vis);
        if (g.symbol) glowAt(gx, y + .1, gz, '#FFFFFF', .8 * vis);
      }
      finish(cubes, n);
      // Towers: the column, and the emblem floating and turning over it.
      let c = 0, m = 0;
      for (const tw of state.board.towers) {
        const x = X(tw.x), z = Z(tw.y), col = sideCol(tw.side), h = (tw.forming ? .6 : 1) * P, ey = .65 + 1.3 * h + Math.sin(t * 1.6 + tw.x) * .06, ry = t * .8 + tw.y;
        place(columns, c++, x, .65 * h, z, P, h, P);
        for (const [a, b, u] of EMBLEM) {
          const ca = Math.cos(ry), sa = Math.sin(ry);
          place(emblems, m++, x + (a * ca - u * sa) * .21 * P, ey + b * .21 * P, z + (a * sa + u * ca) * .21 * P, .19 * P, .19 * P, .19 * P, col, ry);
        }
        glowAt(x, ey, z, col, 1.6);
      }
      finish(columns, c); finish(emblems, m);
      glow.geometry.setDrawRange(0, gn); pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
    }
    // The cloud drifts: each puff wanders a little around its square and breathes, never off it by more than a third.
    let ci = 0;
    for (let i = 0; i < cloudCells.length; i++) {
      const [x, y] = cloudCells[i];
      for (let j = 0; j < 2; j++) {
        const ph = x * 1.7 + y * .9 + j * 2.1;
        D.position.set(X(x) + Math.sin(t * .23 + ph) * .3, .95 + j * .22 + Math.sin(t * .5 + ph) * .06, Z(y) + Math.cos(t * .19 + ph) * .3);
        D.rotation.set(-Math.PI / 2, 0, t * .05 * (j ? -1 : 1) + ph); D.scale.setScalar(1 + .1 * Math.sin(t * .4 + ph)); D.updateMatrix();
        cloud.setMatrixAt(ci++, D.matrix);
      }
    }
    finish(cloud, ci);
    flashes.update(dt);
    debris.update(dt);
    renderer.render(scene, camera);
    // The scene's own time per frame, for scripts/measure-minpentai-3d-frames.ts (only when it asks).
    const w = window as unknown as { __sceneMs?: number[]; __frames?: number[] };
    w.__sceneMs?.push(performance.now() - t0);
    if (dt) w.__frames?.push(dt * 1000);
  };
  // Compile every material now, flashes included, so the first hit or burst doesn't stall a frame.
  flashes.prewarm(() => renderer.compile(scene, camera));
  raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(() => { const [w, h] = size(); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); });
  ro.observe(el);

  return {
    show,
    setQuality: setQ,
    focus(f) { focusOn = f ? { ...f, since: performance.now() } : null; },
    fps: () => ({ fps: meter.fps(), seconds: meter.seconds() }),
    resetFps: () => meter.reset(),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
