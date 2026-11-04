/**
 * The 3D replay (owner, 2026-11-03; docs/proposals/minpentai-matches-between-people.md, "The 3D replay"). Drawn only
 * from the frames the 2D replay is given (solo.ts turnFrames: a board in the side's fog view, and the squares it sees),
 * so it can't show anything the page wasn't sent. The dark is a cloud over the squares out of sight: it covers nothing,
 * because nothing hidden was sent. Once the match is over the frames are the whole board, and there is no cloud.
 *
 * This edition's own abstract pieces: low slate tiles; faceted stones for rocks; hexagonal columns with a ring for towers;
 * low blocks for squares; darts for gliders (a small orb for symbol gliders); thin slabs for mirrors; squat cubes for
 * factories; bars for moving walls. three.js is the bundled three (package.json), loaded only when a replay opens.
 *
 * Built for a mid-range phone: one instanced mesh per kind of piece, the pixel ratio capped at 1.5, no shadows, the
 * cloud a single instanced layer.
 */
import type * as THREE_NS from 'three';
import type { boardOut } from '~/lib/minpentai/agent-play/solo';

type T3 = typeof THREE_NS;
type Board = ReturnType<typeof boardOut>;
export interface ReplayScene {
  /** Show a frame. `prev`, when given, is the frame before it: gliders glide from there over one step's time. */
  show(board: Board, seen: [number, number][] | null, prev: Board | null, stepMs: number): void;
  /** Median frames a second over the first two seconds drawn (null until measured). */
  fps(): number | null;
  dispose(): void;
}

const CYAN = 0x46d7e8, AMBER = 0xffb43a, ROCK = 0x5a5b64, TILE = 0x17181d, TILE_SEEN = 0x1f2c30;
const DIR: Record<string, [number, number]> = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };

export function buildReplayScene(T: T3, el: HTMLElement, W: number, H: number): ReplayScene {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = T.SRGBColorSpace;
  const size = () => [Math.max(1, el.clientWidth), Math.max(1, el.clientHeight)] as const;
  renderer.setSize(...size());
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const scene = new T.Scene();
  scene.background = new T.Color('#060608');
  const camera = new T.PerspectiveCamera(42, size()[0] / size()[1], 0.1, 200);
  scene.add(new T.HemisphereLight(0x9fb3c8, 0x101014, 1.1));
  const sun = new T.DirectionalLight(0xffffff, 1.2);
  sun.position.set(-6, 14, 8);
  scene.add(sun);

  const X = (x: number) => x - W / 2 + 0.5, Z = (y: number) => y - H / 2 + 0.5;
  const m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), s3 = new T.Vector3(), up = new T.Vector3(0, 1, 0), col = new T.Color();
  const disposables: { dispose(): void }[] = [];
  const inst = (geo: THREE_NS.BufferGeometry, mat: THREE_NS.Material, n: number) => {
    const mesh = new T.InstancedMesh(geo, mat, n);
    mesh.count = 0;
    mesh.frustumCulled = false;
    disposables.push(geo, mat);
    scene.add(mesh);
    return mesh;
  };
  const std = (color: number, extra: Partial<THREE_NS.MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });

  // The board: one tile a square, a touch lighter where the side sees.
  const tiles = inst(new T.BoxGeometry(0.94, 0.12, 0.94), std(0xffffff), W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    m4.makeTranslation(X(x), -0.06, Z(y));
    tiles.setMatrixAt(y * W + x, m4);
    tiles.setColorAt(y * W + x, col.set(TILE));
  }
  tiles.count = W * H;
  const rocks = inst(new T.DodecahedronGeometry(0.36, 0), std(ROCK, { flatShading: true }), W * H);
  const towers = inst(new T.CylinderGeometry(0.3, 0.34, 0.9, 6), std(0xffffff, { emissive: 0x000000 }), 64);
  const rings = inst(new T.TorusGeometry(0.38, 0.04, 6, 24), new T.MeshBasicMaterial({ color: 0xffffff }), 64);
  const squares = inst(new T.BoxGeometry(0.7, 0.28, 0.7), std(0xffffff), W * H);
  const darts = inst(new T.ConeGeometry(0.17, 0.5, 4), std(0xffffff, { emissive: 0x111111 }), 240);
  const orbs = inst(new T.SphereGeometry(0.1, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff }), 240);
  const resting = inst(new T.SphereGeometry(0.17, 12, 10), std(0xffffff), W * H);
  const mirrors = inst(new T.BoxGeometry(0.9, 0.5, 0.06), std(0xffffff, { metalness: 0.4, roughness: 0.3 }), W * H);
  const factories = inst(new T.BoxGeometry(0.62, 0.42, 0.62), std(0xffffff), W * H);
  const walls = inst(new T.BoxGeometry(0.86, 0.38, 0.86), std(0xffffff, { transparent: true, opacity: 0.85 }), W * H);
  const flashes = inst(new T.SphereGeometry(0.4, 12, 10), new T.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.7, depthWrite: false }), 64);

  // The cloud: soft drifting puffs over the squares out of sight, from one canvas-made texture.
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(210,214,226,0.9)');
    grad.addColorStop(1, 'rgba(210,214,226,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c);
    disposables.push(t);
    return t;
  })();
  const cloud = inst(new T.PlaneGeometry(1.7, 1.7), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, color: 0x9aa0b4 }), W * H);
  const cloudCells: [number, number][] = [];

  const sideColor = (side: string) => (side === 'mine' ? CYAN : AMBER);
  const put = (mesh: THREE_NS.InstancedMesh, i: number, x: number, y: number, z: number, opts: { color?: number; scale?: number | [number, number, number]; rot?: THREE_NS.Quaternion } = {}) => {
    const sc = opts.scale ?? 1;
    s3.set(...(Array.isArray(sc) ? sc : ([sc, sc, sc] as [number, number, number])));
    m4.compose(v.set(x, y, z), opts.rot ?? q.identity(), s3);
    mesh.setMatrixAt(i, m4);
    if (opts.color !== undefined) mesh.setColorAt(i, col.set(opts.color));
  };
  const finish = (mesh: THREE_NS.InstancedMesh, n: number) => {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  let current: { board: Board; prev: Board | null; at: number; stepMs: number; flashAt: [number, number][]; prevAt: Set<string> } | null = null;
  // Rotations, made once: a piece facing each direction, a ring lying flat, a puff lying flat, mirrors leaning.
  const dirQs = new Map(Object.entries(DIR).map(([k, [dx, dy]]) => [k, new T.Quaternion().setFromUnitVectors(up, new T.Vector3(dx, 0, dy).normalize())]));
  const dirQ = (dir: string) => dirQs.get(dir) ?? dirQs.get('E')!;
  const flat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2), flatDown = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
  const lean = { '/': new T.Quaternion().setFromAxisAngle(up, Math.PI / 4), '\\': new T.Quaternion().setFromAxisAngle(up, -Math.PI / 4) } as Record<string, THREE_NS.Quaternion>;

  function show(board: Board, seen: [number, number][] | null, prev: Board | null, stepMs: number) {
    // Tiles: lighter where the side sees (the whole board after the end).
    const lit = seen ? new Set(seen.map(([x, y]) => y * W + x)) : null;
    for (let k = 0; k < W * H; k++) tiles.setColorAt(k, col.set(!lit || lit.has(k) ? TILE_SEEN : TILE));
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    let n = 0;
    for (const r of board.rocks) put(rocks, n++, X(r.x), 0.28, Z(r.y), { scale: [1, 0.8, 1] });
    finish(rocks, n);
    n = 0;
    for (const t of board.towers) {
      put(towers, n, X(t.x), 0.45, Z(t.y), { color: sideColor(t.side), scale: t.forming ? [1, 0.6, 1] : 1 });
      put(rings, n, X(t.x), 0.93, Z(t.y), { color: sideColor(t.side), rot: flat });
      n++;
    }
    finish(towers, n); finish(rings, n);
    n = 0;
    for (const sq of board.squares) put(squares, n++, X(sq.x), 0.14, Z(sq.y), { color: sideColor(sq.side), scale: [1, sq.hits_left > 1 ? 1 : 0.55, 1] });
    finish(squares, n);
    n = 0;
    for (const m of board.mirrors ?? []) put(mirrors, n++, X(m.x), 0.25, Z(m.y), { color: sideColor(m.side), rot: lean[m.slant] ?? lean['/'] });
    finish(mirrors, n);
    n = 0;
    for (const f of board.factories ?? []) put(factories, n++, X(f.x), 0.21, Z(f.y), { color: sideColor(f.side), rot: dirQ(f.dir) });
    finish(factories, n);
    n = 0;
    for (const w of board.moving_walls ?? []) for (const c of w.squares) put(walls, n++, X(c.x), 0.19, Z(c.y), { color: sideColor(w.side) });
    finish(walls, n);
    n = 0;
    for (const r of board.resting_symbol_gliders ?? []) put(resting, n++, X(r.x), 0.18, Z(r.y), { color: sideColor(r.side) });
    finish(resting, n);
    // The cloud: one puff a square out of sight; none once the match is over.
    cloudCells.length = 0;
    if (lit) for (let k = 0; k < W * H; k++) if (!lit.has(k)) cloudCells.push([k % W, Math.floor(k / W)]);
    cloud.count = cloudCells.length;
    // A hit: where a tower, square, mirror or factory stood in the last frame and doesn't now, a flash (only what both
    // frames show: the side saw it go).
    const flashAt: [number, number][] = [];
    if (prev) {
      const now = new Set([...board.towers, ...board.squares, ...(board.mirrors ?? []), ...(board.factories ?? [])].map((p) => p.y * W + p.x));
      for (const p of [...prev.towers, ...prev.squares, ...(prev.mirrors ?? []), ...(prev.factories ?? [])]) if (!now.has(p.y * W + p.x) && (!lit || lit.has(p.y * W + p.x))) flashAt.push([p.x, p.y]);
    }
    current = { board, prev, at: performance.now(), stepMs, flashAt, prevAt: new Set((prev?.gliders ?? []).map((g) => `${g.x},${g.y},${g.dir},${g.side}`)) };
  }

  // The camera: a three-quarter view from Cyan's side, drifting slowly.
  const R = Math.max(W, H);
  const aim = () => {
    const t = performance.now() / 1000, a = -0.55 + Math.sin(t * 0.07) * 0.06;
    camera.position.set(Math.sin(a) * R * 0.75, R * 0.72, Math.cos(a) * R * 0.75);
    camera.lookAt(0, 0, 0);
  };
  const deltas: number[] = [];
  let started = 0, last = 0, raf = 0, measured: number | null = null;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!started) started = now;
    if (last && now - started < 2000) deltas.push(now - last);
    else if (measured === null && now - started >= 2000 && deltas.length) { const d = [...deltas].sort((a, b) => a - b)[deltas.length >> 1]; measured = 1000 / d; }
    last = now;
    if (current) {
      const k = Math.min(1, (now - current.at) / Math.max(1, current.stepMs * 0.9)), e = k * k * (3 - 2 * k);
      // Gliders: from where they were one step ago (the same side and direction) to where they are.
      const prevAt = current.prevAt;
      let n = 0;
      for (const g of current.board.gliders) {
        const [dx, dy] = DIR[g.dir] ?? [0, 0], from = prevAt.has(`${g.x - dx},${g.y - dy},${g.dir},${g.side}`);
        const gx = from ? g.x - dx + dx * e : g.x, gy = from ? g.y - dy + dy * e : g.y;
        put(darts, n, X(gx), 0.3, Z(gy), { color: sideColor(g.side), rot: dirQ(g.dir), scale: from ? 1 : 0.4 + 0.6 * e });
        if (g.symbol) put(orbs, n, X(gx), 0.55, Z(gy), { color: sideColor(g.side) });
        else put(orbs, n, 0, -50, 0);
        n++;
      }
      finish(darts, n); finish(orbs, n);
      let f = 0;
      for (const [x, y] of current.flashAt) put(flashes, f++, X(x), 0.4, Z(y), { scale: 0.4 + 1.4 * e });
      (flashes.material as THREE_NS.MeshBasicMaterial).opacity = 0.7 * (1 - e);
      finish(flashes, f);
    }
    // The cloud drifts.
    const t = now / 1000;
    for (let i = 0; i < cloudCells.length; i++) {
      const [x, y] = cloudCells[i], b = Math.sin(t * 0.6 + x * 1.7 + y * 0.9) * 0.06;
      put(cloud, i, X(x) + Math.sin(t * 0.2 + y) * 0.1, 0.75 + b, Z(y), { rot: flatDown, scale: 1 + 0.08 * Math.sin(t * 0.4 + i) });
    }
    cloud.count = cloudCells.length;
    cloud.instanceMatrix.needsUpdate = true;
    aim();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(() => { const [w, h] = size(); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); });
  ro.observe(el);

  return {
    show,
    fps: () => measured,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
