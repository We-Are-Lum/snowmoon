'use client';

/**
 * The broadcast (docs/design/minpentai-study.md): the recorded four-player match drawn as the
 * crowd might see it on the big screen, in 3D. Imagined: the book's crowd watches "a large
 * detailed map" (c4-b114), so every screen that shows this says "Broadcast imagined".
 *
 * Everything on the field comes from the engine through broadcast.ts: towers are players'
 * sites, drones are recognised gliders, blocks are other live cells. Nothing is scripted by hand.
 * The camera director cuts on the match's real events (a tower about to fall gets a close-up),
 * looking ahead in the precomputed story the way a director with a copy of the match would.
 *
 * three.js is bundled with the app (no outside request, principle 6) and loaded only here.
 * The canvas is role="img"; the commentary line is aria-live and carries the story, so nothing
 * depends on seeing the 3D. Reduced motion: still shots, hard cuts, no slow motion. Without
 * WebGL: a flat top view of the same frames.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE_NS from 'three';
import { SYMBOL_ROWS } from '~/lib/minpentai/symbol';
import { DEFAULT_RULES } from '~/lib/minpentai/match';
import type { Segment, ShotKind } from '~/lib/minpentai/segment';
import { LEARN_TEXT } from '~/lib/minpentai/learn-text';
import { PLAYER_COLOURS, PLAYER_NAMES, broadcast, commentary, type Broadcast, type Frame, type Story } from '~/lib/minpentai/broadcast';

export type { Segment, ShotKind };

const H = LEARN_TEXT.hud;
const SLOW = 0.3;
const CLOSE_UP_TURNS = 10;
const FIELD = '#0E0F13';
const BG = '#050507';
const ROCK = '#4B4C55';
const GREY = '#5A5C66';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
const SYM_CELLS = SYMBOL_ROWS.flatMap((r, j) => [...r].flatMap((ch, i) => (ch === '#' ? [[i - 1, j - 1] as [number, number]] : [])));
const GLIDER_CELLS: [number, number][] = [[1, 0], [2, 0], [0, 1], [3, 1]];

interface Hud {
  turn: number;
  cam: string;
  comment: string;
  banner: { text: string; colour: string } | null;
  minus: { text: string; colour: string } | null;
  /** The player cam shown after an event: whose face, and since when (seconds). */
  react: { player: number; win: boolean } | null;
  countdown: boolean;
  score: (number | null)[];
  /** Seconds since mount, for the faces' eyes. */
  clock: number;
}

export function BroadcastStage({ segment, paused, onPause, label }: { segment: Segment; paused: boolean; onPause: () => void; label: string }) {
  const b = useMemo(() => broadcast(), []);
  const hostRef = useRef<HTMLDivElement>(null);
  const camRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [noGL, setNoGL] = useState(false);
  const [hud, setHud] = useState<Hud>(() => hudFor(b, segment.from, segment, '', 0));
  const state = useRef({ t: segment.from, paused, segment, still: false });
  state.current.paused = paused;
  state.current.segment = segment;

  // A new segment replays from its start.
  useEffect(() => {
    state.current.t = segment.from;
  }, [segment.from, segment.to]);

  useEffect(() => {
    let dead = false;
    let raf = 0;
    let cleanup = () => {};
    state.current.still = reduced();
    if (!webglOk()) {
      setNoGL(true);
      return;
    }
    void import('three').then((T) => {
      if (dead || !hostRef.current) return;
      cleanup = run(T, hostRef.current, b, state, setHud, camRefs, (f) => (raf = f));
    }).catch(() => setNoGL(true));
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [b]);

  // Without WebGL: the same frames from above, flat, on a timer.
  const flatRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!noGL) return;
    const t0 = performance.now();
    let last = t0;
    let lastHud = 0;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = state.current;
      if (!s.paused) {
        s.t += Math.max(0, (now - last) / 1000) * s.segment.speed;
        if (s.t > s.segment.to) s.t = s.segment.hold ? s.segment.to : s.segment.from;
      }
      last = now;
      const f = b.frames[Math.min(b.frames.length - 1, Math.floor(s.t))];
      drawFlat(flatRef.current, b, f, null);
      if (now - lastHud > 150) {
        lastHud = now;
        setHud(hudFor(b, s.t, s.segment, H.topView, (now - t0) / 1000));
        if (s.segment.cams) camRefs.current.forEach((c, p) => drawFlat(c, b, f, p));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [noGL, b]);

  const still = state.current.still;
  return (
    <div className={segment.cams ? 'bc bc-with-cams' : 'bc'}>
      <div className="bc-field">
        {noGL ? (
          <canvas ref={flatRef} className="bc-flat" width={260} height={260} role="img" aria-label={label} />
        ) : (
          <div ref={hostRef} className="bc-gl" role="img" aria-label={label} />
        )}
      </div>
      <div className="bc-hud" aria-hidden="true">
        <div className="bc-box bc-score">
          <span className="bc-live-line"><span className="bc-live" />{H.live(hud.turn)}</span>
          <span className="bc-grid">
            {hud.score.map((n, p) => (
              <span key={p} style={{ color: n === null ? '#7A7D88' : PLAYER_COLOURS[p] }}>
                {PLAYER_NAMES[p].toUpperCase()} {n === null ? H.out : '●'.repeat(Math.min(n, 6))}
              </span>
            ))}
          </span>
        </div>
        {hud.cam && <div className="bc-box bc-cam-label">{hud.cam}</div>}
        {hud.countdown && (
          <div className="bc-countdown">
            <span className="bc-dz">MU GU GEI TAU FA</span>
            <span className="bc-dz-en">The battle begins in fifty ticks.</span>
          </div>
        )}
        {hud.banner && !hud.countdown && (
          <div className="bc-banner" style={{ borderTopColor: hud.banner.colour }}>
            {hud.banner.text}
          </div>
        )}
        {hud.minus && !hud.countdown && (
          <div className="bc-minus" style={{ color: hud.minus.colour }}>
            {hud.minus.text}
          </div>
        )}
        {hud.react && !segment.cams && !hud.countdown && (
          <div className="bc-react">
            <PlayerFace player={hud.react.player} out={hud.score[hud.react.player] === null} win={hud.react.win} clock={still ? 0 : hud.clock} />
            <span className="bc-react-label" style={{ color: PLAYER_COLOURS[hud.react.player] }}>{H.atConsole(PLAYER_NAMES[hud.react.player])}</span>
          </div>
        )}
      </div>
      {segment.cams && (
        <div className="bc-cams" aria-hidden="true">
          {PLAYER_NAMES.map((n, p) => (
            <figure key={n} className="bc-cam">
              <figcaption style={{ color: PLAYER_COLOURS[p] }}>{n.toUpperCase()}</figcaption>
              <PlayerFace player={p} out={hud.score[p] === null} win={false} clock={still ? 0 : hud.clock} />
              <canvas ref={(el) => { camRefs.current[p] = el; }} width={192} height={128} />
            </figure>
          ))}
        </div>
      )}
      <p className={segment.cams ? 'bc-comment bc-visually-hidden' : 'bc-comment'} aria-live="polite">
        {hud.comment}
      </p>
      <button type="button" className="bc-pause" onClick={onPause} aria-label={paused ? H.play : H.pause} aria-pressed={paused}>
        {paused ? '▶' : 'II'}
      </button>
    </div>
  );
}

/**
 * A face at the console, after Design's face card (97 × 62): a stand-in, not a person from the
 * book. The lenses are clear so the eyes show (invented; the book gives glasses on a cable, c4-b82).
 */
function PlayerFace({ player, out, win, clock: t }: { player: number; out: boolean; win: boolean; clock: number }) {
  const c = PLAYER_COLOURS[player];
  const ex = out ? 0 : Math.round(Math.sin(1.3 * t + 2 * player) * 2 + Math.sin(3.1 * t + player) * 0.8);
  const ey = out ? 2 : Math.round(Math.cos(1.7 * t + player));
  const blink = !out && ((0.7 * t + 0.37 * player) % 1) < 0.06;
  const eh = out || blink ? 1 : win ? 8 : 7;
  return (
    <svg className="bc-face" viewBox="0 0 97 62" style={{ opacity: out ? 0.45 : 1 }} aria-hidden="true">
      <rect width="97" height="62" fill="#141519" />
      <path d="M14 72 V70 Q14 50 34 50 H64 Q84 50 84 70 V72 Z" fill="#2A2C34" />
      <ellipse cx="49" cy="31" rx="21" ry="25" fill="#3A3B42" />
      <rect x="73" y="28" width="1" height="34" fill="#5A5C66" />
      <rect x="22" y="21" width="54" height="15" rx="5" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="1" style={{ filter: `drop-shadow(0 0 5px ${c})` }} />
      {[30, 57].map((x) => (
        <g key={x}>
          <rect x={x} y={28.5 - eh / 2} width="11" height={eh} rx="1" fill="#E7E4DD" />
          {eh > 2 && <rect x={x + 3 + ex} y={26 + ey} width="5" height="5" fill="#050507" />}
        </g>
      ))}
    </svg>
  );
}

/* ---------------- what the overlays say ---------------- */

const REACT_TURNS = 20;
function hudFor(b: Broadcast, t: number, seg: Segment, cam: string, clock: number): Hud {
  const turn = Math.floor(t);
  const f = b.frames[Math.min(b.frames.length - 1, turn)];
  const countdown = !!seg.countdown && t < seg.from + (seg.to - seg.from) * 0.55;
  let comment = '';
  for (const s of b.story) if (s.turn <= turn && s.turn >= seg.from) comment = commentary(s);
  if (countdown) comment = H.setup;
  else if (!comment) comment = seg.from === 0 ? H.begins : H.runs;
  let banner: Hud['banner'] = null;
  if (seg.countdown && !countdown && turn < seg.to) banner = { text: H.battleBegins, colour: PLAYER_COLOURS[0] };
  let react: Hud['react'] = null;
  for (const s of b.story) {
    if (s.turn > turn || s.turn < seg.from || turn - s.turn > REACT_TURNS) continue;
    if (s.kind === 'intervention' && turn - s.turn < 14) banner = { text: H.intervention, colour: PLAYER_COLOURS[0] };
    if (s.kind === 'out' && s.player !== undefined) { banner = { text: H.isOut(PLAYER_NAMES[s.player]), colour: PLAYER_COLOURS[s.player] }; react = { player: s.player, win: false }; }
    if (s.kind === 'end') { banner = { text: s.player !== undefined ? H.wins(PLAYER_NAMES[s.player]) : H.draw, colour: s.player !== undefined ? PLAYER_COLOURS[s.player] : '#E7E4DD' }; if (s.player !== undefined) react = { player: s.player, win: true }; }
  }
  if (seg.hold && turn >= seg.to && b.winner !== null && b.story.some((s) => s.kind === 'end' && s.turn <= seg.to && s.turn >= seg.from)) {
    banner = { text: H.wins(PLAYER_NAMES[b.winner]), colour: PLAYER_COLOURS[b.winner] };
    react = { player: b.winner, win: true };
  }
  let minus: Hud['minus'] = null;
  for (const s of b.story) if (s.kind === 'lost' && s.player !== undefined && s.turn <= turn && s.turn >= seg.from && turn - s.turn < 10) minus = { text: `−1 ${PLAYER_NAMES[s.player].toUpperCase()}`, colour: PLAYER_COLOURS[s.player] };
  return { turn, cam, comment, banner, minus, react, countdown, score: f.score, clock };
}

/* ---------------- the flat view (no WebGL, and the player cams) ---------------- */

function drawFlat(c: HTMLCanvasElement | null, b: Broadcast, f: Frame, viewer: number | null) {
  if (!c) return;
  const g = c.getContext('2d');
  if (!g) return;
  const k = Math.min(c.width / b.w, c.height / b.h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.save();
  g.translate((c.width - b.w * k) / 2, (c.height - b.h * k) / 2);
  if (viewer !== null) {
    // A player sees only within `sight` of their own towers (c4-b93; the radius is invented).
    g.beginPath();
    for (const t of f.towers) if (t.player === viewer) g.rect((t.x - DEFAULT_RULES.sight) * k, (t.y - DEFAULT_RULES.sight) * k, (2 * DEFAULT_RULES.sight + 1) * k, (2 * DEFAULT_RULES.sight + 1) * k);
    g.clip();
  }
  g.fillStyle = FIELD;
  g.fillRect(0, 0, b.w * k, b.h * k);
  g.fillStyle = ROCK;
  for (const [x, y] of b.rocks) g.fillRect(x * k, y * k, k, k);
  for (const [x, y, o] of f.blocks) {
    g.fillStyle = o ? PLAYER_COLOURS[o - 1] : GREY;
    g.globalAlpha = 0.6;
    g.fillRect(x * k, y * k, k, k);
  }
  g.globalAlpha = 1;
  for (const d of f.drones) {
    g.fillStyle = d.player === null ? GREY : PLAYER_COLOURS[d.player];
    for (const [a, r] of GLIDER_CELLS) g.fillRect((d.x + (d.dx ? r : a)) * k, (d.y + (d.dx ? a : r)) * k, k, k);
  }
  for (const t of f.towers) {
    g.fillStyle = PLAYER_COLOURS[t.player];
    for (const [a, r] of SYM_CELLS) g.fillRect((t.x + a) * k, (t.y + r) * k, k, k);
  }
  g.restore();
}

/* ---------------- the 3D field ---------------- */

type THREE = typeof THREE_NS;
type StateRef = React.MutableRefObject<{ t: number; paused: boolean; segment: Segment; still: boolean }>;

function run(
  T: THREE,
  host: HTMLDivElement,
  b: Broadcast,
  state: StateRef,
  setHud: (h: Hud) => void,
  camRefs: React.MutableRefObject<(HTMLCanvasElement | null)[]>,
  setRaf: (id: number) => void,
): () => void {
  const W = b.w, H = b.h;
  const wx = (x: number) => x + 0.5 - W / 2;
  const wz = (y: number) => y + 0.5 - H / 2;
  let w = host.clientWidth || 390, h = host.clientHeight || 260;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const scene = new T.Scene();
  scene.background = new T.Color(BG);
  scene.fog = new T.FogExp2(BG, 0.014);
  const camera = new T.PerspectiveCamera(50, w / h, 0.1, 400);
  scene.add(new T.HemisphereLight(0x8899aa, 0x080808, 0.55));
  const sun = new T.DirectionalLight(0xffffff, 1.5);
  sun.position.set(18, 40, 12);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 120 });
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const floor = new T.Mesh(new T.PlaneGeometry(260, 260), new T.MeshStandardMaterial({ color: '#08080A', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);
  const field = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ color: FIELD, roughness: 0.95 }));
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  scene.add(field);
  const gp: number[] = [];
  for (let x = 0; x <= W; x++) gp.push(x - W / 2, 0.01, -H / 2, x - W / 2, 0.01, H / 2);
  for (let z = 0; z <= H; z++) gp.push(-W / 2, 0.01, z - H / 2, W / 2, 0.01, z - H / 2);
  const gg = new T.BufferGeometry();
  gg.setAttribute('position', new T.Float32BufferAttribute(gp, 3));
  const gridMat = new T.LineBasicMaterial({ color: '#1C1D24', transparent: true, opacity: 0.9 });
  scene.add(new T.LineSegments(gg, gridMat));
  const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(W, 0.02, H)), new T.LineBasicMaterial({ color: '#4A4D5A' }));
  edge.position.y = 0.02;
  scene.add(edge);

  const D = new T.Object3D();
  const box = new T.BoxGeometry(1, 1, 1);
  const colours = PLAYER_COLOURS.map((c) => new T.Color(c));
  // Rocks: a grey block each, of a fixed height (seeded, so every replay matches).
  const rocks = new T.InstancedMesh(box, new T.MeshStandardMaterial({ color: ROCK, roughness: 0.85 }), Math.max(1, b.rocks.length));
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);
  const rockH = b.rocks.map((_, i) => 0.8 + ((i * 2654435761) % 997) / 997);
  const blocks = new T.InstancedMesh(box, new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: '#111111' }), 800);
  blocks.instanceMatrix.setUsage(T.DynamicDrawUsage);
  blocks.castShadow = true;
  scene.add(blocks);
  const drones = new T.InstancedMesh(box, new T.MeshBasicMaterial({ color: '#ffffff' }), 200);
  drones.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(drones);
  const debris = new T.InstancedMesh(box, new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), 900);
  debris.instanceMatrix.setUsage(T.DynamicDrawUsage);
  debris.castShadow = true;
  scene.add(debris);
  const crews = new T.InstancedMesh(new T.CapsuleGeometry(0.12, 0.26, 4, 8), new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 120);
  crews.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(crews);
  for (let i = 0; i < 800; i++) blocks.setColorAt(i, new T.Color('#ffffff'));
  for (let i = 0; i < 200; i++) drones.setColorAt(i, new T.Color('#ffffff'));
  for (let i = 0; i < 900; i++) debris.setColorAt(i, new T.Color(GREY));
  for (let i = 0; i < 120; i++) crews.setColorAt(i, new T.Color('#ffffff'));
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gx = gc.getContext('2d')!;
  const grd = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = grd;
  gx.fillRect(0, 0, 64, 64);
  const glowTex = new T.CanvasTexture(gc);

  // Towers, by id: a column, the symbol turning on top, a ring at the base, the circle of sight.
  const towerObjs = new Map<number, { g: THREE_NS.Group; top: THREE_NS.Group; col: THREE_NS.Mesh; warn: THREE_NS.Mesh; disc: THREE_NS.MeshBasicMaterial; ring: THREE_NS.MeshBasicMaterial; born: number }>();
  const makeTower = (player: number) => {
    const g = new T.Group();
    const col = new T.Mesh(new T.CylinderGeometry(0.16, 0.3, 2.2, 10), new T.MeshStandardMaterial({ color: '#2A2C34', metalness: 0.6, roughness: 0.4 }));
    col.position.y = 1.1;
    col.castShadow = true;
    g.add(col);
    const top = new T.Group();
    top.position.y = 2.6;
    const mat = new T.MeshBasicMaterial({ color: PLAYER_COLOURS[player] });
    for (const [a, r] of SYM_CELLS) {
      const m = new T.Mesh(box, mat);
      m.scale.setScalar(0.34);
      m.position.set(a * 0.36, -r * 0.36, 0);
      top.add(m);
    }
    g.add(top);
    const base = new T.Mesh(new T.RingGeometry(0.5, 0.75, 28), new T.MeshBasicMaterial({ color: PLAYER_COLOURS[player], side: T.DoubleSide }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.03;
    g.add(base);
    const disc = new T.MeshBasicMaterial({ color: PLAYER_COLOURS[player], transparent: true, opacity: 0.05, depthWrite: false });
    const dm = new T.Mesh(new T.CircleGeometry(DEFAULT_RULES.sight, 48), disc);
    dm.rotation.x = -Math.PI / 2;
    dm.position.y = 0.02;
    g.add(dm);
    const ring = new T.MeshBasicMaterial({ color: PLAYER_COLOURS[player], transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide });
    const rm = new T.Mesh(new T.RingGeometry(DEFAULT_RULES.sight - 0.12, DEFAULT_RULES.sight, 64), ring);
    rm.rotation.x = -Math.PI / 2;
    rm.position.y = 0.025;
    g.add(rm);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: PLAYER_COLOURS[player], transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    sp.scale.set(2.6, 2.6, 1);
    sp.position.y = 2.6;
    g.add(sp);
    const warn = new T.Mesh(new T.RingGeometry(1.1, 1.35, 32), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.y = 0.05;
    warn.visible = false;
    g.add(warn);
    scene.add(g);
    return { g, top, col, warn, disc, ring };
  };
  const flashes = [0, 1, 2].map(() => {
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    s.visible = false;
    scene.add(s);
    return s;
  });

  // Debris: bursts when a tower falls, then it settles and stays (the "wasteland", c4-b140).
  type Bit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; settled: boolean; c: string };
  let bits: Bit[] = [];
  let burstsDone = new Set<number>();
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const burst = (s: Story) => {
    if (!s.tower) return;
    for (let q = 0; q < 34; q++) {
      const a = rnd() * 6.28, sp = 1 + rnd() * 6;
      bits.push({ x: wx(s.tower.x), y: 1.4 + rnd(), z: wz(s.tower.y), vx: Math.cos(a) * sp, vy: 3 + rnd() * 7, vz: Math.sin(a) * sp, settled: false, c: q % 3 ? '#8A8C96' : PLAYER_COLOURS[s.tower.player] });
    }
    if (bits.length > 880) bits = bits.slice(bits.length - 880);
  };

  // The director: which shot at this turn.
  let lastShotKey = '';
  const camPos = new T.Vector3(0, 30, 30), camLook = new T.Vector3();
  let followId = -1;
  const shotAt = (t: number, seg: Segment, still: boolean) => {
    // A tower about to fall in this segment gets a close-up (lookahead in the story).
    const falling = state.current.segment === seg ? b.story.find((s) => s.kind === 'lost' && s.tower && t >= s.turn - CLOSE_UP_TURNS && t < s.turn + 3 && s.turn >= seg.from && s.turn <= seg.to) : undefined;
    if (falling && seg.shots.includes('tower')) return { kind: 'tower' as ShotKind, key: `tower-${falling.turn}-${falling.tower!.id}`, story: falling };
    const plain = seg.shots.filter((k) => k !== 'tower');
    const len = Math.max(1, seg.to - seg.from + 1);
    const idx = Math.min(plain.length - 1, Math.floor(((t - seg.from) / len) * plain.length));
    const kind = plain[Math.max(0, idx)] ?? 'wide';
    return { kind, key: `${kind}-${idx}-${still}`, story: undefined };
  };
  const label = LEARN_TEXT.hud.cams;

  const setCamera = (t: number, dt: number, frame: Frame, flat: number) => {
    const s = state.current;
    const seg = s.segment;
    const sh = shotAt(t, seg, s.still);
    const u = s.still ? 0 : Math.min(1, Math.max(0, (t - seg.from) / Math.max(1, seg.to - seg.from)));
    const e = u * u * (3 - 2 * u);
    let pos: [number, number, number] = [0, 30, 34], look: [number, number, number] = [0, 0, 0], fov = 50;
    if (sh.kind === 'crane') {
      const ang = 0.9 + (s.still ? 0 : (t - seg.from) * 0.03);
      pos = [Math.cos(ang) * 44, 26 - (s.still ? 0 : e * 6), Math.sin(ang) * 44];
    } else if (sh.kind === 'wide') {
      pos = [-34 + e * 6, 30 - e * 4, 34 - e * 6];
      look = [e * 2, 0, 0];
    } else if (sh.kind === 'low') {
      pos = [-18 + e * 30, 2.6, 12];
      look = [-6 + e * 12, 0.6, 0];
    } else if (sh.kind === 'corner') {
      // The corner of the player who acted most recently: Cyan's at the start.
      pos = [-30 + e * 4, 12 - e * 3, -30 + e * 4];
      look = [-16, 0, -16];
    } else if (sh.kind === 'tower' && sh.story?.tower) {
      const X = wx(sh.story.tower.x), Z = wz(sh.story.tower.y);
      let dx = X, dz = Z;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      const dist = s.still ? 6 : 7 - Math.min(2, (t - (sh.story.turn - CLOSE_UP_TURNS)) * 0.2);
      pos = [X + dx * dist - dz * 2.2, 1.3, Z + dz * dist + dx * 2.2];
      look = [X, 1.7, Z];
      fov = 46;
    } else if (sh.kind === 'follow' && !s.still) {
      let d = frame.drones[followId] ?? frame.drones[0];
      if (!d) d = undefined as never;
      if (d) {
        followId = frame.drones.indexOf(d);
        const X = wx(d.x + 1.5), Z = wz(d.y + 0.5);
        pos = [X - d.dx * 6, 2.2, Z - d.dy * 6];
        look = [X + d.dx * 8, 0.4, Z + d.dy * 8];
      }
    } else if (sh.kind === 'top') {
      pos = [0, 52 + flat * 4, 0.01];
      fov = 42;
    }
    if (flat > 0) {
      pos = [pos[0] * (1 - flat), pos[1] * (1 - flat) + 60 * flat, pos[2] * (1 - flat) + 0.01];
      look = [look[0] * (1 - flat), 0, look[2] * (1 - flat)];
      fov = 50 - flat * 12;
    }
    const tp = new T.Vector3(...pos), tl = new T.Vector3(...look);
    // Hard cuts between shots, as in a sports broadcast; within a shot the camera eases.
    if (sh.key !== lastShotKey) {
      camPos.copy(tp);
      camLook.copy(tl);
      lastShotKey = sh.key;
    } else {
      const k = 1 - Math.exp(-dt * 7);
      camPos.lerp(tp, k);
      camLook.lerp(tl, k);
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return { cam: label[sh.kind], falling: sh.story };
  };

  const t0 = performance.now();
  let last = t0;
  let lastHud = 0;
  let prevTurn = -1;
  const loop = (now: number) => {
    setRaf(requestAnimationFrame(loop));
    const dtReal = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    const s = state.current;
    const seg = s.segment;
    // Slow motion for the moment a tower falls (not with reduced motion).
    const slow = !s.still && b.story.some((q) => q.kind === 'lost' && Math.abs(s.t - q.turn) < 1.2 && q.turn >= seg.from && q.turn <= seg.to);
    if (!s.paused) {
      s.t += dtReal * seg.speed * (slow ? SLOW : 1);
      if (s.t > seg.to) {
        if (seg.hold) s.t = seg.to;
        else {
          s.t = seg.from;
          bits = [];
          burstsDone = new Set();
        }
      }
    }
    if (s.t < prevTurn) { bits = []; burstsDone = new Set(); }
    if (s.t < seg.from) s.t = seg.from;
    const turn = Math.max(0, Math.min(b.frames.length - 1, Math.floor(s.t)));
    const frac = s.t - Math.floor(s.t);
    const f = b.frames[turn];
    const nf = b.frames[Math.min(b.frames.length - 1, turn + 1)];
    // Bursts for towers that fell up to now in this pass.
    for (const q of b.story) if (q.kind === 'lost' && q.turn <= turn && q.turn >= seg.from && !burstsDone.has(q.turn * 1000 + (q.tower?.id ?? 0))) {
      burstsDone.add(q.turn * 1000 + (q.tower?.id ?? 0));
      if (turn - q.turn < 4) burst(q);
    }
    prevTurn = s.t;
    const flat = seg.flatten ? (s.still ? (s.t >= seg.to - 1 ? 1 : 0) : Math.min(1, Math.max(0, (s.t - (seg.to - 24)) / 20))) : 0;

    // Rocks
    b.rocks.forEach(([x, y], i) => {
      const hh = rockH[i] * (1 - flat) + 0.1 * flat;
      D.position.set(wx(x), hh / 2, wz(y));
      D.rotation.set(0, 0, 0);
      D.scale.set(0.98, hh, 0.98);
      D.updateMatrix();
      rocks.setMatrixAt(i, D.matrix);
    });
    rocks.instanceMatrix.needsUpdate = true;
    gridMat.color.set(flat > 0.5 ? '#2A2C34' : '#1C1D24');
    // Blocks: squares and wreckage, in their owner's colour, dimmed.
    let n = 0;
    const fresh = new Set(f.placed.map(([x, y]) => y * W + x));
    for (const [x, y, o] of f.blocks) {
      if (n >= 800) break;
      const hh = (fresh.has(y * W + x) ? 0.7 : 0.45) * (1 - flat) + 0.1 * flat;
      D.position.set(wx(x), hh / 2, wz(y));
      D.rotation.set(0, 0, 0);
      D.scale.set(0.9, hh, 0.9);
      D.updateMatrix();
      blocks.setMatrixAt(n, D.matrix);
      blocks.setColorAt(n, o ? colours[o - 1].clone().multiplyScalar(0.55) : new T.Color(GREY));
      n++;
    }
    blocks.count = n;
    blocks.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
    // Drones: four lit cubes in the glider's shape, a little above the field, moving between turns.
    let m = 0;
    for (const d of f.drones) {
      const nd = nf.drones.find((q) => q.dx === d.dx && q.dy === d.dy && Math.abs(q.x - d.x) <= 2 && Math.abs(q.y - d.y) <= 2);
      const ix = nd ? d.x + (nd.x - d.x) * frac : d.x, iy = nd ? d.y + (nd.y - d.y) * frac : d.y;
      const y = (0.55 + Math.sin(now / 160 + m) * 0.07) * (1 - flat) + 0.06 * flat;
      for (const [a, r] of GLIDER_CELLS) {
        if (m >= 200) break;
        const cx = d.dx ? ix + r : ix + a, cy = d.dx ? iy + a : iy + r;
        D.position.set(wx(cx), y, wz(cy));
        D.rotation.set(0, 0, 0);
        const sz = 0.32 + 0.58 * flat;
        D.scale.set(sz, sz * (1 - flat) + 0.1 * flat, sz);
        D.updateMatrix();
        drones.setMatrixAt(m, D.matrix);
        drones.setColorAt(m, d.player === null ? new T.Color(GREY) : colours[d.player]);
        m++;
      }
    }
    drones.count = m;
    drones.instanceMatrix.needsUpdate = true;
    if (drones.instanceColor) drones.instanceColor.needsUpdate = true;
    // Crews: at a turn to act, figures walk from the nearest tower to each square put down.
    let cn = 0;
    if (flat === 0) {
      const iv = b.frames.slice(Math.max(0, turn - 6), turn + 1).find((q) => q.placed.length);
      if (iv) {
        const u = Math.min(1, (s.t - iv.turn) / 6);
        for (const [x, y, p] of iv.placed) {
          if (cn >= 120) break;
          const home = f.towers.filter((q) => q.player === p).sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y))[0];
          if (!home) continue;
          const back = u > 0.6 ? (u - 0.6) / 0.4 : 0;
          const v = u < 0.6 ? u / 0.6 : 1 - back;
          D.position.set(wx(home.x + (x - home.x) * v), 0.26 + Math.abs(Math.sin(now / 80 + cn)) * 0.06, wz(home.y + (y - home.y) * v));
          D.rotation.set(0, 0, 0);
          D.scale.setScalar(u >= 1 ? 0.0001 : 1);
          D.updateMatrix();
          crews.setMatrixAt(cn, D.matrix);
          crews.setColorAt(cn, colours[p]);
          cn++;
        }
      }
    }
    crews.count = cn;
    crews.instanceMatrix.needsUpdate = true;
    if (crews.instanceColor) crews.instanceColor.needsUpdate = true;
    // Debris physics.
    let dn = 0;
    for (const d of bits) {
      if (!d.settled && !s.paused) {
        d.vy -= 18 * dtReal * (slow ? SLOW : 1);
        d.x += d.vx * dtReal * (slow ? SLOW : 1);
        d.y += d.vy * dtReal * (slow ? SLOW : 1);
        d.z += d.vz * dtReal * (slow ? SLOW : 1);
        if (d.y <= 0.12) {
          d.y = 0.12;
          if (Math.abs(d.vy) < 2.5) d.settled = true;
          else { d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; }
        }
      }
      if (dn >= 900) break;
      D.position.set(d.x, d.y * (1 - flat), d.z);
      D.rotation.set(d.settled ? 0 : now / 250, 0, 0);
      D.scale.set(0.22, 0.22 * (1 - flat) + 0.06 * flat, 0.22);
      D.updateMatrix();
      debris.setMatrixAt(dn, D.matrix);
      debris.setColorAt(dn, new T.Color(d.c).lerp(new T.Color('#3E4049'), d.settled ? 0.78 : 0.2));
      dn++;
    }
    debris.count = dn;
    debris.instanceMatrix.needsUpdate = true;
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
    // Towers
    const shown = new Set<number>();
    for (const t of f.towers) {
      shown.add(t.id);
      let o = towerObjs.get(t.id);
      if (!o) {
        o = { ...makeTower(t.player), born: s.t };
        towerObjs.set(t.id, o);
      }
      o.g.visible = true;
      o.g.position.set(wx(t.x), 0, wz(t.y));
      const grow = s.still ? 1 : Math.min(1, Math.max(0.01, (s.t - o.born) / 6));
      o.col.scale.set(1, Math.max(0.0001, grow * (1 - flat)), 1);
      o.col.position.y = 1.1 * grow * (1 - flat);
      o.top.position.y = 2.6 * grow * (1 - flat) + 0.06 * flat;
      o.top.rotation.y = s.still ? 0 : (1 - flat) * (now / 1250);
      o.top.children.forEach((c, i) => {
        const [a, r] = SYM_CELLS[i];
        const cs = 0.34 + 0.58 * flat, gap = 0.36 + 0.64 * flat;
        c.scale.set(cs, cs * (1 - flat) + 0.1 * flat, cs);
        c.position.set(a * gap, -r * 0.36 * (1 - flat), r * gap * flat);
      });
      const falling = b.story.find((q) => q.kind === 'lost' && q.tower?.id === t.id && s.t >= q.turn - CLOSE_UP_TURNS && s.t < q.turn);
      o.warn.visible = !!falling && flat < 0.5;
      if (falling) {
        (o.warn.material as THREE_NS.MeshBasicMaterial).opacity = s.still ? 0.8 : 0.45 + 0.45 * Math.sin(now / 60);
        o.warn.scale.setScalar(s.still ? 1 : 1 + 0.15 * Math.sin(now / 120));
      }
      o.disc.opacity = 0.05 * (1 - flat);
      o.ring.opacity = 0.32 * (1 - flat);
    }
    for (const [id, o] of towerObjs) {
      if (shown.has(id)) continue;
      o.g.visible = false;
      if (s.t < o.born) { scene.remove(o.g); towerObjs.delete(id); }
    }
    // A flash where a tower just fell.
    const recent = b.story.filter((q) => q.kind === 'lost' && q.tower && q.turn <= s.t && s.t - q.turn < 3 && q.turn >= seg.from).slice(-3);
    flashes.forEach((sp, k) => {
      const q = recent[k];
      sp.visible = !!q && flat < 0.5;
      if (!q?.tower) return;
      const a = (s.t - q.turn) / 3;
      sp.position.set(wx(q.tower.x), 1.6, wz(q.tower.y));
      sp.scale.setScalar(2 + a * 14);
      sp.material.color.set(PLAYER_COLOURS[q.tower.player]);
      sp.material.opacity = 1 - a;
    });

    const { cam } = setCamera(s.t, dtReal, f, flat);
    renderer.render(scene, camera);
    if (now - lastHud > 150) {
      lastHud = now;
      setHud(hudFor(b, s.t, seg, cam, (now - t0) / 1000));
      if (seg.cams) camRefs.current.forEach((c, p) => drawFlat(c, b, f, p));
    }
  };
  setRaf(requestAnimationFrame(loop));

  const ro = new ResizeObserver(() => {
    w = host.clientWidth || w;
    h = host.clientHeight || h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(host);
  return () => {
    ro.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
