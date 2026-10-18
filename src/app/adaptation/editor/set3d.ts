/**
 * The live 3D set for the shot editor: the same grey-box sets the frames were laid out in
 * (adaptations/<seed>/preprod/sets/<set>.json), built with the same shapes as scripts/set-render.html,
 * so the grey layout here matches the set frame the model was sent. Two views of one scene: an orbit
 * view where the camera, the point it looks at and the people can be dragged, and the shot camera's
 * own view (the live layout). Runs only in the browser; nothing is fetched but the set's own JSON.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type Vec3 = [number, number, number];
export type Face = string | number;
export interface PersonSpec {
  at: [number, number];
  face: Face;
  pose?: string;
  y?: number;
}
export interface ShotCamera {
  cam: Vec3;
  look: Vec3;
  fov: number;
  people: Record<string, PersonSpec | string>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SetJson = any;

const FACE: Record<string, number> = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2, NE: (3 * Math.PI) / 4, NW: (-3 * Math.PI) / 4, SE: Math.PI / 4, SW: -Math.PI / 4 };
export const faceAngle = (f: Face) => (typeof f === 'number' ? (f * Math.PI) / 180 : (FACE[f] ?? 0));
/** A facing in degrees (0 = toward +z, 90 = toward +x), whatever form the set gave it in. */
export const faceDegrees = (f: Face) => Math.round(((faceAngle(f) * 180) / Math.PI + 360) % 360);

/** Clothes colours for the people (Zei orange, Bai lime, Deluin cream, Kau charcoal, the robot white). */
export const PERSON_COLOUR: Record<string, number> = { Z: 0xe8771e, B: 0x9bd13a, D: 0xe6dcc4, K: 0x55555f, R: 0xf2f2f2 };
export const PERSON_NAME: Record<string, string> = { Z: 'Zei', B: 'Bai', D: 'Deluin', K: 'Kau', R: 'The robot waiter' };
const HEIGHT: Record<string, number> = { Z: 0.97, B: 0.98, D: 1.07, K: 1.0, R: 1 };
const HELPERS = 1; // layer of the handles: seen by the orbit view, never by the shot camera
const CAM_COLOUR = 0x2e5a3a;

function grey(c: number) {
  return new THREE.MeshLambertMaterial({ color: c });
}
const EDGE = new THREE.LineBasicMaterial({ color: 0x3a3a40 });

function add(parent: THREE.Object3D, mesh: THREE.Mesh, edges = true) {
  parent.add(mesh);
  if (edges) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), EDGE);
    e.position.copy(mesh.position);
    e.rotation.copy(mesh.rotation);
    e.scale.copy(mesh.scale);
    parent.add(e);
  }
  return mesh;
}
function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, c = 0xd8d8dc) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), grey(c));
  m.position.set(x, y, z);
  return add(parent, m);
}
function cyl(parent: THREE.Object3D, rt: number, rb: number, h: number, x: number, y: number, z: number, c = 0xd8d8dc, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), grey(c));
  m.position.set(x, y, z);
  return add(parent, m);
}

function chair(parent: THREE.Object3D, x: number, z: number, face: Face, y = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = faceAngle(face);
  parent.add(g);
  const wb = (w: number, h: number, d: number, px: number, py: number, pz: number) => box(g, w, h, d, px, py, pz, 0xcfcfd4);
  wb(0.45, 0.05, 0.45, 0, 0.45, 0);
  wb(0.45, 0.04, 0.05, 0, 0.88, -0.22);
  wb(0.45, 0.04, 0.05, 0, 0.7, -0.22);
  for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) wb(0.04, 0.45, 0.04, a, 0.225, b);
  for (const a of [-0.2, 0.2]) wb(0.04, 0.45, 0.04, a, 0.67, -0.22);
  return g;
}

function limb(parent: THREE.Object3D, a: Vec3, b: Vec3, rad: number, col: number) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, Math.max(0.01, A.distanceTo(B)), 4, 10), grey(col));
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return add(parent, m);
}

/** A mannequin (or the robot), in the person's clothes colour, facing +z before its group is turned. */
function mannequin(who: string, pose: string, col: number, withChair: boolean) {
  const g = new THREE.Group();
  if (pose === 'robot' || who === 'R') {
    cyl(g, 0.32, 0.42, 0.06, 0, 0.03, 0, col);
    cyl(g, 0.16, 0.3, 0.75, 0, 0.42, 0, col);
    box(g, 0.44, 0.45, 0.26, 0, 1.02, 0, col);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), grey(col));
    hd.position.set(0, 1.4, 0);
    add(g, hd);
    return g;
  }
  const s = HEIGHT[who] ?? 1;
  const seated = pose === 'seated' || pose === 'seated-low';
  const skin = 0xc49a7c;
  const legs = 0x55555f;
  const hip = seated ? 0.5 : 0.92 * s;
  const sh = hip + 0.52 * s;
  const hy = sh + 0.24 * s;
  if (seated) {
    if (withChair) chair(g, 0, 0, 0);
    for (const sx of [-0.1, 0.1]) {
      limb(g, [sx * s, hip, 0.02], [sx * s, hip, 0.44], 0.065 * s, legs);
      limb(g, [sx * s, hip, 0.46], [sx * s, 0.06, 0.5], 0.055 * s, legs);
    }
    for (const sx of [-0.2, 0.2]) {
      limb(g, [sx * s, sh - 0.02, 0], [sx * 1.05 * s, sh - 0.27 * s, 0.1], 0.045 * s, col);
      limb(g, [sx * 1.05 * s, sh - 0.27 * s, 0.1], [sx * 0.8 * s, sh - 0.3 * s, 0.38], 0.04 * s, skin);
    }
  } else {
    for (const sx of [-0.1, 0.1]) limb(g, [sx * s, hip, 0], [sx * s, 0.06, 0.02], 0.065 * s, legs);
    for (const sx of [-0.21, 0.21]) limb(g, [sx * s, sh - 0.02, 0], [sx * 1.12 * s, hip - 0.05, 0.03], 0.045 * s, col);
  }
  limb(g, [0, hip + 0.05, 0], [0, sh - 0.08 * s, 0], 0.15 * s, col);
  limb(g, [0, sh - 0.04, 0], [0, sh + 0.08 * s, 0], 0.05 * s, skin);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 20, 14), grey(skin));
  head.scale.set(0.9, 1.12, 1);
  head.position.set(0, hy, 0);
  add(g, head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 10).rotateX(Math.PI / 2), grey(skin));
  nose.position.set(0, hy, 0.11 * s);
  add(g, nose, false);
  return g;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prim(pr: any, parent: THREE.Object3D) {
  const c = pr.c ?? 0xd2d2d8;
  let m: THREE.Mesh | null = null;
  if (pr.shape === 'box') m = new THREE.Mesh(new THREE.BoxGeometry(...(pr.s as Vec3)), grey(c));
  else if (pr.shape === 'cyl') m = new THREE.Mesh(new THREE.CylinderGeometry(pr.rt ?? pr.r, pr.r, pr.h, pr.seg ?? 20, 1, !!pr.open, pr.t0 ?? 0, pr.tl ?? Math.PI * 2), grey(c));
  else if (pr.shape === 'sphere') m = new THREE.Mesh(new THREE.SphereGeometry(pr.r, 16, 10), grey(c));
  else if (pr.shape === 'cone') m = new THREE.Mesh(new THREE.ConeGeometry(pr.r, pr.h, pr.seg ?? 4), grey(c));
  else if (pr.shape === 'disc') {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, pr.r, 0, Math.PI * 2, false);
    for (const [hx, hz, hr] of pr.holes || []) {
      const h = new THREE.Path();
      h.absarc(hx, -hz, hr, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
    m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 64).rotateX(-Math.PI / 2), grey(c));
    (m.material as THREE.Material).side = THREE.DoubleSide;
  } else if (pr.shape === 'line') {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pr.pts.map((q: Vec3) => new THREE.Vector3(...q))), EDGE);
    parent.add(l);
    return;
  }
  if (!m) return;
  if (pr.open) (m.material as THREE.Material).side = THREE.DoubleSide;
  m.position.set(...(pr.p as Vec3));
  if (pr.ry) m.rotation.y = pr.ry;
  if (pr.rx) m.rotation.x = pr.rx;
  if (pr.rz) m.rotation.z = pr.rz;
  add(parent, m, pr.edges !== false);
}

/** The set's fixed dressing, as scripts/set-render.html draws it (grey, no crowd faces). Returns where its chairs are. */
function buildSet(scene: THREE.Scene, SET: SetJson): [number, number][] {
  const chairs: [number, number][] = [];
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(SET.ground.w, SET.ground.d).rotateX(-Math.PI / 2), grey(0xe6e6ea));
  gm.position.y = SET.ground.y || 0;
  gm.name = 'ground';
  scene.add(gm);
  const n = Math.max(SET.ground.w, SET.ground.d);
  const grid = new THREE.GridHelper(n, n, 0xc4c4ca, 0xc4c4ca);
  grid.position.y = (SET.ground.y || 0) + 0.002;
  scene.add(grid);
  for (const o of SET.objects) {
    if (o.kind === 'group') {
      const g = new THREE.Group();
      scene.add(g);
      for (const pr of o.prims) prim(pr, g);
    } else if (o.kind === 'crowd') {
      for (const q of o.at) {
        const p = mannequin('x', q[4] || 'seated', 0xe0e0e4, false);
        p.position.set(q[0], q[1], q[2]);
        p.rotation.y = faceAngle(q[3] || 'N');
        scene.add(p);
      }
    } else if (o.kind === 'table') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.size[0], 0.05, o.size[1]), grey(0xd2d2d8));
      m.position.set(o.at[0], o.h, o.at[1]);
      add(scene, m);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(scene, 0.06, o.h, 0.06, o.at[0] + a * (o.size[0] / 2 - 0.1), o.h / 2, o.at[1] + b * (o.size[1] / 2 - 0.1));
    } else if (o.kind === 'roundtable') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 0.04, 28), grey(0xd2d2d8));
      m.position.set(o.at[0], o.h, o.at[1]);
      add(scene, m);
      cyl(scene, 0.04, 0.04, o.h, o.at[0], o.h / 2, o.at[1]);
    } else if (o.kind === 'chair') {
      chair(scene, o.at[0], o.at[1], o.face);
      chairs.push([o.at[0], o.at[1]]);
    } else if (o.kind === 'tree') {
      cyl(scene, 0.18, 0.25, 2.6, o.at[0], 1.3, o.at[1], 0xb8b8be);
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), grey(0xcacad0));
      c.position.set(o.at[0], 3.4, o.at[1]);
      add(scene, c);
    } else if (o.kind === 'gate') {
      box(scene, o.w, 2.4, 0.08, o.at[0], 1.2, o.at[1], 0x9d9da5);
      for (let i = 0; i < 9; i++) box(scene, 0.04, 2.4, 0.1, o.at[0] - o.w / 2 + (i * o.w) / 8, 1.2, o.at[1] + 0.05, 0x6d6d75);
    } else if (o.kind === 'wall') {
      const [x1, z1] = o.from;
      const [x2, z2] = o.to;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ang = Math.atan2(z2 - z1, x2 - x1);
      const w = new THREE.Mesh(new THREE.BoxGeometry(len, o.h, 0.2), grey(0xc9c9cf));
      w.position.set((x1 + x2) / 2, o.h / 2, (z1 + z2) / 2);
      w.rotation.y = -ang;
      add(scene, w);
      for (let i = 0; i < o.windows; i++) {
        const t = (i + 0.5) / o.windows;
        const win = new THREE.Mesh(new THREE.BoxGeometry((len / o.windows) * 0.6, 1.4, 0.24), grey(0xa9a9b2));
        win.position.set(x1 + (x2 - x1) * t, 1.3, z1 + (z2 - z1) * t);
        win.rotation.y = -ang;
        add(scene, win);
      }
    } else if (o.kind === 'counter') box(scene, o.size[0], 1.0, o.size[1], o.at[0], 0.5, o.at[1], 0xbfbfc6);
    else if (o.kind === 'skyline') {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const d = 26 + (i % 3) * 6;
        const h = 10 + ((i * 37) % 17);
        const m = new THREE.Mesh(i % 4 === 0 ? new THREE.ConeGeometry(5, h * 1.6, 4) : new THREE.BoxGeometry(3, h, 3), grey(0xdedee3));
        m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
        add(scene, m);
      }
    } else if (o.kind === 'lights') {
      for (const t of o.to) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 12; i++) {
          const k = i / 12;
          pts.push(new THREE.Vector3(o.from[0] + (t[0] - o.from[0]) * k, 3.4 - Math.sin(k * Math.PI) * 0.6, o.from[1] + (t[1] - o.from[1]) * k));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), EDGE));
      }
    }
  }
  return chairs;
}

/** A plain copy of a camera, with every person written out in full (no 'seated' or 'later' shorthands). */
export function normalise(cam: ShotCamera, SET: SetJson): ShotCamera {
  const people: Record<string, PersonSpec> = {};
  for (const [who, spec] of Object.entries(cam.people || {})) {
    const s = spec === 'seated' ? { ...SET.people?.seated?.[who], pose: 'seated' } : spec === 'later' ? SET.people?.later?.[who] : spec;
    if (s?.at) people[who] = { at: [s.at[0], s.at[1]], face: s.face ?? 0, pose: s.pose ?? 'standing', ...(s.y ? { y: s.y } : {}) };
  }
  return { cam: [...cam.cam] as Vec3, look: [...cam.look] as Vec3, fov: cam.fov, people };
}

type Drag = { kind: 'cam' | 'look' | 'person'; who?: string; plane: THREE.Plane; offset: THREE.Vector3 };

/**
 * The editor's 3D: build once per set, then setCamera() for each preset or reset. onChange gets a
 * fresh copy of the camera whenever a drag or a control moves something.
 */
export class SetStage {
  private scene = new THREE.Scene();
  private orbitR: THREE.WebGLRenderer;
  private shotR: THREE.WebGLRenderer;
  private orbitCam = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
  private shotCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
  private controls: OrbitControls;
  private chairs: [number, number][];
  private people = new Map<string, THREE.Group>();
  private camMarker: THREE.Mesh;
  private lookRing: THREE.Mesh;
  private sightLine: THREE.Line;
  private frustum: THREE.CameraHelper;
  private state: ShotCamera;
  private drag: Drag | null = null;
  private ray = new THREE.Raycaster();
  private frame = 0;
  private observer: ResizeObserver;
  private disposed = false;

  constructor(
    private orbitCanvas: HTMLCanvasElement,
    private shotCanvas: HTMLCanvasElement,
    private SET: SetJson,
    start: ShotCamera,
    private onChange: (c: ShotCamera) => void,
  ) {
    this.state = normalise(start, SET);
    this.scene.background = new THREE.Color(0xf4f4f6);
    if (SET.fog) this.scene.fog = new THREE.Fog(0xf4f4f6, SET.fog[0], SET.fog[1]);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9aa2, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-6, 10, 4);
    this.scene.add(sun);
    this.chairs = buildSet(this.scene, SET);

    this.orbitR = new THREE.WebGLRenderer({ canvas: orbitCanvas, antialias: true });
    this.shotR = new THREE.WebGLRenderer({ canvas: shotCanvas, antialias: true, preserveDrawingBuffer: true });
    for (const r of [this.orbitR, this.shotR]) r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.orbitCam.layers.enable(HELPERS);

    const green = new THREE.MeshBasicMaterial({ color: CAM_COLOUR });
    this.camMarker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), green);
    this.lookRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 10, 32).rotateX(Math.PI / 2), green);
    this.sightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: CAM_COLOUR, dashSize: 0.15, gapSize: 0.1 }));
    this.frustum = new THREE.CameraHelper(this.shotCam);
    for (const h of [this.camMarker, this.lookRing, this.sightLine, this.frustum]) {
      h.layers.set(HELPERS);
      this.scene.add(h);
    }

    this.controls = new OrbitControls(this.orbitCam, orbitCanvas);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.render());
    orbitCanvas.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(orbitCanvas);
    this.observer.observe(shotCanvas);
    this.apply(true);
    this.frameOrbit();
    this.resize();
    // For the page tests only: reachable from the canvas element, not from window.
    (orbitCanvas as HTMLCanvasElement & { edStage?: SetStage }).edStage = this;
  }

  /** The orbit view starts above and behind the shot camera, looking at the middle of the action. */
  frameOrbit() {
    const c = new THREE.Vector3(...this.state.cam);
    const l = new THREE.Vector3(...this.state.look);
    const mid = c.clone().add(l).multiplyScalar(0.5);
    const back = c.clone().sub(l).setY(0).normalize();
    if (!isFinite(back.x)) back.set(0, 0, 1);
    const span = Math.max(4, c.distanceTo(l) * 1.6);
    this.orbitCam.position.copy(mid).add(back.multiplyScalar(span)).add(new THREE.Vector3(0, span * 0.8, 0));
    this.controls.target.copy(mid);
    this.controls.update();
  }

  setCamera(cam: ShotCamera) {
    this.state = normalise(cam, this.SET);
    this.apply(true);
    this.frameOrbit();
    this.emit();
  }

  get camera(): ShotCamera {
    return JSON.parse(JSON.stringify(this.state));
  }

  setFov(fov: number) {
    this.state.fov = fov;
    this.apply(false);
    this.emit();
  }

  /** Camera height in metres (the look point keeps its own height). */
  setHeight(h: number) {
    this.state.cam[1] = h;
    this.apply(false);
    this.emit();
  }

  turnPerson(who: string, by: number) {
    const p = this.state.people[who] as PersonSpec;
    if (!p) return;
    p.face = (faceDegrees(p.face) + by + 360) % 360;
    this.apply(false);
    this.emit();
  }

  setPose(who: string, pose: string) {
    const p = this.state.people[who] as PersonSpec;
    if (!p) return;
    p.pose = pose;
    this.apply(true);
    this.emit();
  }

  /**
   * Where a handle is on the orbit canvas, in CSS pixels from its top left (for the page tests, which
   * drag it like a person would). kind: 'cam', 'look' or a person's letter.
   */
  screenOf(kind: string): { x: number; y: number } | null {
    const p = kind === 'cam' ? new THREE.Vector3(...this.state.cam) : kind === 'look' ? new THREE.Vector3(...this.state.look) : this.people.get(kind)?.position.clone().setY(0.9);
    if (!p) return null;
    const v = p.project(this.orbitCam);
    return { x: ((v.x + 1) / 2) * this.orbitCanvas.clientWidth, y: ((1 - v.y) / 2) * this.orbitCanvas.clientHeight };
  }

  /** The shot camera's view as a PNG data URL . */
  snapshot(): string {
    this.shotR.render(this.scene, this.shotCam);
    return this.shotCanvas.toDataURL('image/png');
  }

  private emit() {
    this.onChange(this.camera);
  }

  private apply(rebuildPeople: boolean) {
    const s = this.state;
    if (rebuildPeople) {
      for (const g of this.people.values()) this.scene.remove(g);
      this.people.clear();
      for (const [who, p] of Object.entries(s.people) as [string, PersonSpec][]) {
        const seated = p.pose === 'seated' || p.pose === 'seated-low';
        const chairThere = this.chairs.some((c) => Math.hypot(c[0] - p.at[0], c[1] - p.at[1]) < 0.55);
        const g = mannequin(who, p.pose ?? 'standing', PERSON_COLOUR[who] ?? 0xb9b9c0, seated && !chairThere);
        g.userData.who = who;
        this.scene.add(g);
        this.people.set(who, g);
      }
    }
    for (const [who, g] of this.people) {
      const p = s.people[who] as PersonSpec;
      g.position.set(p.at[0], p.y ?? 0, p.at[1]);
      g.rotation.y = faceAngle(p.face);
    }
    this.shotCam.fov = s.fov;
    this.shotCam.position.set(...s.cam);
    this.shotCam.lookAt(...s.look);
    this.shotCam.updateProjectionMatrix();
    this.shotCam.updateMatrixWorld();
    this.frustum.update();
    this.camMarker.position.set(...s.cam);
    this.camMarker.lookAt(...s.look);
    this.lookRing.position.set(...s.look);
    const pos = this.sightLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, ...s.cam);
    pos.setXYZ(1, ...s.look);
    pos.needsUpdate = true;
    this.sightLine.computeLineDistances();
    this.render();
  }

  private pointer(e: PointerEvent) {
    const r = this.orbitCanvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private down = (e: PointerEvent) => {
    this.ray.setFromCamera(this.pointer(e), this.orbitCam);
    this.ray.layers.enableAll();
    const targets: THREE.Object3D[] = [this.camMarker, this.lookRing, ...this.people.values()];
    const hit = this.ray.intersectObjects(targets, true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && o !== this.camMarker && o !== this.lookRing && !o.userData.who) o = o.parent;
    if (!o) return;
    const kind = o === this.camMarker ? 'cam' : o === this.lookRing ? 'look' : 'person';
    const anchor = kind === 'cam' ? new THREE.Vector3(...this.state.cam) : kind === 'look' ? new THREE.Vector3(...this.state.look) : o.position.clone();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -anchor.y);
    const at = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(plane, at)) return;
    this.drag = { kind, who: o.userData.who, plane, offset: anchor.clone().sub(at) };
    this.controls.enabled = false;
    this.orbitCanvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  private move = (e: PointerEvent) => {
    if (!this.drag) return;
    this.ray.setFromCamera(this.pointer(e), this.orbitCam);
    const at = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.drag.plane, at)) return;
    at.add(this.drag.offset);
    const half = (this.SET.ground?.w ?? 30) / 2 + 10;
    const x = +Math.max(-half, Math.min(half, at.x)).toFixed(3);
    const z = +Math.max(-half, Math.min(half, at.z)).toFixed(3);
    if (this.drag.kind === 'cam') this.state.cam = [x, this.state.cam[1], z];
    else if (this.drag.kind === 'look') this.state.look = [x, this.state.look[1], z];
    else if (this.drag.who) (this.state.people[this.drag.who] as PersonSpec).at = [x, z];
    this.apply(false);
    this.emit();
  };

  private up = () => {
    if (!this.drag) return;
    this.drag = null;
    this.controls.enabled = true;
  };

  private resize() {
    const size = (c: HTMLCanvasElement, r: THREE.WebGLRenderer) => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w && h) r.setSize(w, h, false);
      return w / Math.max(1, h);
    };
    this.orbitCam.aspect = size(this.orbitCanvas, this.orbitR);
    this.orbitCam.updateProjectionMatrix();
    size(this.shotCanvas, this.shotR);
    this.render();
  }

  private render() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.orbitR.render(this.scene, this.orbitCam);
      // The live layout: what the shot camera sees, with no handles in it.
      this.frustum.visible = false;
      this.shotR.render(this.scene, this.shotCam);
      this.frustum.visible = true;
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.orbitCanvas.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    this.orbitR.dispose();
    this.shotR.dispose();
  }
}
