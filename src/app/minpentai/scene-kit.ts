/**
 * What makes the tutorial's 3D broadcast (broadcast-scene.ts) feel alive, as shared parts, so the live page's 3D action
 * (m/[id]/replay-scene.ts) looks and moves the same way:
 *   - the renderer: filmic tone mapping, sRGB, soft shadows (shadows and pixel ratio drop on the low quality level);
 *   - the stage: a near-black room with exponential fog, a cool sky light and one warm sun, a dark field with a faint
 *     grid and a lit edge;
 *   - glow: one soft radial sprite texture, added (additive blending) for lights, gliders and flashes;
 *   - flashes that swell and fade, and debris that tumbles, falls, greys and fades;
 *   - the camera distance that frames the whole board (fitDistance), for any aspect ratio;
 *   - a camera that eases toward where it should be, never cuts mid-shot.
 * Drawing only: none of this knows the rules or the board.
 */
import type * as THREE_NS from 'three';

type T3 = typeof THREE_NS;
export type Quality = 'high' | 'low';

export const STAGE_BG = '#050507';

export function makeRenderer(T: T3, el: HTMLElement, w: number, h: number, o: { quality?: Quality; maxRatio?: number; preserve?: boolean } = {}) {
  const renderer = new T.WebGLRenderer({ antialias: o.quality !== 'low', preserveDrawingBuffer: !!o.preserve, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(o.maxRatio ?? 2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = o.quality !== 'low';
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  return renderer;
}

/** The room and its light. `W` × `H` is the field's size in world units, centred on the origin. */
export function makeStage(T: T3, scene: THREE_NS.Scene, W: number, H: number, o: { fog?: number; grid?: string; edge?: string; field?: string; shadow?: [number, number] } = {}) {
  scene.background = new T.Color(STAGE_BG);
  scene.fog = new T.FogExp2(STAGE_BG, o.fog ?? .016);
  scene.add(new T.HemisphereLight(0x8899aa, 0x080808, .55));
  const sun = new T.DirectionalLight(0xffffff, 1.5);
  sun.position.set(18, 40, 12);
  sun.castShadow = true;
  const [sx, sz] = o.shadow ?? [Math.max(W, H) * .75, Math.max(W, H) * .75];
  Object.assign(sun.shadow.camera, { left: -sx, right: sx, top: sz, bottom: -sz, near: 1, far: 100 });
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const floor = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshStandardMaterial({ color: '#08080A', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.02; floor.receiveShadow = true; scene.add(floor);
  const field = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ color: o.field ?? '#0E0F13', roughness: .95 }));
  field.rotation.x = -Math.PI / 2; field.receiveShadow = true; scene.add(field);
  const gp: number[] = [];
  for (let x = 0; x <= W; x++) gp.push(x - W / 2, .01, -H / 2, x - W / 2, .01, H / 2);
  for (let z = 0; z <= H; z++) gp.push(-W / 2, .01, z - H / 2, W / 2, .01, z - H / 2);
  const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(gp, 3));
  const gridMat = new T.LineBasicMaterial({ color: o.grid ?? '#1C1D24', transparent: true, opacity: .9 });
  scene.add(new T.LineSegments(gg, gridMat));
  const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(W, .02, H)), new T.LineBasicMaterial({ color: o.edge ?? '#4A4D5A' }));
  edge.position.y = .02; scene.add(edge);
  return { sun, floor, field, gridMat, edge };
}

/** The soft round glow every light in the broadcast uses. */
export function glowTexture(T: T3) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.25, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

export const glowSprite = (T: T3, tex: THREE_NS.Texture, color: string, size: number) => {
  const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  sp.scale.set(size, size, 1);
  return sp;
};

/** Flashes: a glow that swells and fades over `life` seconds (the broadcast's impact flashes). */
export function makeFlashes(T: T3, scene: THREE_NS.Scene, tex: THREE_NS.Texture, n: number) {
  const pool = Array.from({ length: n }, () => { const s = glowSprite(T, tex, '#ffffff', 1); s.visible = false; scene.add(s); return { s, age: 0, life: 1, size: 1 }; });
  let next = 0;
  return {
    fire(x: number, y: number, z: number, color: string, size: number, life = .6) {
      const f = pool[next++ % n];
      f.s.position.set(x, y, z); f.s.material.color.set(color); f.age = 0; f.life = life; f.size = size; f.s.visible = true;
    },
    update(dt: number) {
      for (const f of pool) {
        if (!f.s.visible) continue;
        f.age += dt;
        const a = f.age / f.life;
        if (a >= 1) { f.s.visible = false; continue; }
        f.s.scale.setScalar(f.size * (.4 + a * 1.6)); f.s.material.opacity = 1 - a;
      }
    },
    clear() { for (const f of pool) f.s.visible = false; },
    /** Shown for `compile` (so their material is compiled before the first flash), then hidden again. */
    prewarm(compile: () => void) { for (const f of pool) { f.s.visible = true; f.s.material.opacity = 0; } compile(); for (const f of pool) f.s.visible = false; },
  };
}

/**
 * Debris: small cubes thrown up, tumbling, that fall and settle on the field, then fade. Clearly debris, never mistakable
 * for a piece (owner, 2026-11-12, after the 3D end view's amber bits read as pieces): it starts half greyed, is grey
 * (`grey`, not a side's colour) within half a second, and is gone within `life` seconds (1.5).
 */
export function makeDebris(T: T3, scene: THREE_NS.Scene, n: number, shadows: boolean, o: { life?: number; grey?: string } = {}) {
  const life = o.life ?? 1.5;
  const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ color: '#ffffff', roughness: .9 }), n);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.castShadow = shadows; mesh.count = 0; scene.add(mesh);
  const D = new T.Object3D(), C = new T.Color(), settled = new T.Color(o.grey ?? '#4A4C55');
  const bits: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; age: number; col: string; s: number }[] = [];
  return {
    burst(x: number, z: number, color: string, count: number, power = 1) {
      for (let i = 0; i < count; i++) {
        if (bits.length >= n) bits.shift();
        const a = Math.random() * Math.PI * 2, v = (1.2 + Math.random() * 2.2) * power;
        bits.push({ x, y: .3, z, vx: Math.cos(a) * v, vy: (2.5 + Math.random() * 3) * power, vz: Math.sin(a) * v, rx: Math.random() * 6, ry: Math.random() * 6, age: 0, col: color, s: .06 + Math.random() * .08 });
      }
    },
    update(dt: number) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.age += dt;
        if (b.age > life) { bits.splice(i, 1); continue; }
        if (b.y > b.s / 2) { b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += dt * 9; b.ry += dt * 7; }
        if (b.y <= b.s / 2) { b.y = b.s / 2; b.vy = 0; b.vx *= .5; b.vz *= .5; }
      }
      bits.forEach((b, i) => {
        const fade = debrisFade(b.age, life), s = b.s * Math.max(.0001, fade);
        D.position.set(b.x, b.y, b.z); D.rotation.set(b.y > b.s ? b.rx : 0, b.ry, 0); D.scale.set(s, s, s); D.updateMatrix();
        mesh.setMatrixAt(i, D.matrix);
        mesh.setColorAt(i, C.set(b.col).lerp(settled, debrisGrey(b.age)));
      });
      mesh.count = bits.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    clear() { bits.length = 0; mesh.count = 0; mesh.instanceMatrix.needsUpdate = true; },
  };
}
/** How grey a bit of debris is at `age` seconds: half at once, all of it by half a second. */
export const debrisGrey = (age: number) => Math.min(1, .5 + age);
/** Its size, 1 to 0: whole until half a second before `life`, then shrinking away. */
export const debrisFade = (age: number, life: number) => (age < life - .5 ? 1 : Math.max(0, (life - age) / .5));

/**
 * Where a camera looking at `look` from the direction `u` (pointing from the look point toward the camera) must stand
 * to frame points `pts`, the board's corners (owner, 2026-11-12: the 3D end view cropped the board's far corner): the
 * least distance at which every point projects inside the frame with `margin` to spare (normalised device coordinates,
 * so for any aspect ratio). `fov` is the vertical field of view in degrees. Pure: no three.js, so it can be tested.
 */
export function fitDistance(pts: [number, number, number][], look: [number, number, number], u: [number, number, number], fov: number, aspect: number, margin = .06): number {
  const fits = (d: number) => pts.every((p) => { const q = toNdc(p, [look[0] + u[0] * d, look[1] + u[1] * d, look[2] + u[2] * d], look, fov, aspect); return q !== null && Math.abs(q[0]) <= 1 - margin && Math.abs(q[1]) <= 1 - margin; });
  let lo = .5, hi = 1;
  while (!fits(hi) && hi < 4096) hi *= 2;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}
/** A point as a perspective camera at `pos` looking at `look` (up: +y) sees it: [x, y] in -1..1 inside the frame, or null behind it. */
export function toNdc(p: [number, number, number], pos: [number, number, number], look: [number, number, number], fov: number, aspect: number): [number, number] | null {
  const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = norm([look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]]), r = norm(cross(f, [0, 1, 0])), up = cross(r, f);
  const v = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]], z = dot(v, f);
  if (z <= 1e-6) return null;
  const t = Math.tan((fov * Math.PI) / 360);
  return [dot(v, r) / (z * t * aspect), dot(v, up) / (z * t)];
}

/** A camera that eases toward a position and a point to look at (the broadcast's camera: ease, never jump mid-shot). */
export function easeCamera(T: T3, camera: THREE_NS.PerspectiveCamera) {
  const pos = camera.position.clone(), look = new T.Vector3(), want = { pos: new T.Vector3(), look: new T.Vector3() };
  let started = false, clock = 0;
  return {
    aim(p: [number, number, number], l: [number, number, number]) { want.pos.set(...p); want.look.set(...l); if (!started) { pos.copy(want.pos); look.copy(want.look); started = true; } },
    /** `rate`: how quickly it closes on where it should be (per second). The shake is smooth, not a random jitter. */
    update(dt: number, shake = 0, rate = 2.2) {
      const k = 1 - Math.exp(-dt * rate);
      pos.lerp(want.pos, k); look.lerp(want.look, k);
      camera.position.copy(pos);
      if (shake > 0) { clock += dt; camera.position.x += Math.sin(clock * 37) * shake; camera.position.y += Math.sin(clock * 41 + 1) * shake * .6; camera.position.z += Math.sin(clock * 29 + 2) * shake; }
      camera.lookAt(look);
    },
  };
}

/** Frames per second over a window, the median of frame times (one slow frame doesn't decide it). */
export function fpsMeter() {
  let times: number[] = [];
  return {
    tick(dt: number) { if (dt > 0 && dt < 1) times.push(dt); },
    reset() { times = []; },
    seconds() { return times.reduce((a, b) => a + b, 0); },
    fps() { if (times.length < 10) return 0; const s = [...times].sort((a, b) => a - b); return 1 / s[s.length >> 1]; },
  };
}
