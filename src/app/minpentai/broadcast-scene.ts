/**
 * The 3D broadcast, ported from Design's mockup (docs/design/minpentai-intro-v3.dc.html):
 *   buildScene -> Component.build (script lines 502–559)
 *   drawScene  -> Component.draw (603–655), less the camera's target, which the controller
 *                 computes (LearnController.camera, the same code) so it can be tested
 * three.js is the bundled three@0.186.1 (package.json), loaded only on the watch screens; Design
 * loaded 0.160.0 from a CDN, which production pages may not do (principle 6).
 */
import type * as THREE_NS from 'three';
import { COL, H, SHIP, STRIKES, SYM, GLIDER, TOWERS, W, WORLD, clamp, lerp, smooth, strikePos, towerUp, wx, wz, type Sim } from '~/lib/minpentai/learn-game/broadcast';

type T3 = typeof THREE_NS;
export interface Scene {
  render(S: Sim, cam: { pos: number[] | null; look: number[] | null; fov: number }): void;
  resize(): void;
  dispose(): void;
}

export function buildScene(T: T3, el: HTMLElement): Scene {
  const size = () => [el.clientWidth || 390, el.clientHeight || 260] as const;
  const [w, h] = size();
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const scene = new T.Scene();
  scene.background = new T.Color('#050507');
  scene.fog = new T.FogExp2('#050507', .016);
  const camera = new T.PerspectiveCamera(50, w / h, .1, 400);
  scene.add(new T.HemisphereLight(0x8899aa, 0x080808, .55));
  const sun = new T.DirectionalLight(0xffffff, 1.5);
  sun.position.set(18, 40, 12);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 24, bottom: -24, near: 1, far: 100 });
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const floor = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshStandardMaterial({ color: '#08080A', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.02; floor.receiveShadow = true; scene.add(floor);
  const field = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ color: '#0E0F13', roughness: .95 }));
  field.rotation.x = -Math.PI / 2; field.receiveShadow = true; scene.add(field);
  const gp: number[] = [];
  for (let x = 0; x <= W; x++) gp.push(x - W / 2, .01, -H / 2, x - W / 2, .01, H / 2);
  for (let z = 0; z <= H; z++) gp.push(-W / 2, .01, z - H / 2, W / 2, .01, z - H / 2);
  const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(gp, 3));
  const gridMat = new T.LineBasicMaterial({ color: '#1C1D24', transparent: true, opacity: .9 });
  scene.add(new T.LineSegments(gg, gridMat));
  const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(W, .02, H)), new T.LineBasicMaterial({ color: '#4A4D5A' }));
  edge.position.y = .02; scene.add(edge);
  const D = new T.Object3D(), box = new T.BoxGeometry(1, 1, 1);
  const rockIdx: [number, number][] = [];
  WORLD.rock.forEach((v, k) => { if (v > 0) rockIdx.push([k, v]); });
  const rocks = new T.InstancedMesh(box, new T.MeshStandardMaterial({ color: '#4B4C55', roughness: .85 }), rockIdx.length);
  rocks.castShadow = rocks.receiveShadow = true; scene.add(rocks);
  const walls = new T.InstancedMesh(box, new T.MeshStandardMaterial({ color: '#ffffff', roughness: .5, emissive: '#111111' }), WORLD.walls.length);
  walls.castShadow = true; scene.add(walls);
  WORLD.walls.forEach((wl, i) => walls.setColorAt(i, new T.Color(COL[wl.p]).multiplyScalar(.55)));
  const drones = new T.InstancedMesh(box, new T.MeshBasicMaterial({ color: '#ffffff' }), 900);
  drones.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(drones);
  for (let i = 0; i < 900; i++) drones.setColorAt(i, new T.Color('#ffffff'));
  const debris = new T.InstancedMesh(box, new T.MeshStandardMaterial({ color: '#ffffff', roughness: .9 }), 1500);
  debris.instanceMatrix.setUsage(T.DynamicDrawUsage); debris.castShadow = true; scene.add(debris);
  for (let i = 0; i < 1500; i++) debris.setColorAt(i, new T.Color('#5A5C66'));
  const crews = new T.InstancedMesh(new T.CapsuleGeometry(.12, .26, 4, 8), new T.MeshStandardMaterial({ color: '#ffffff', roughness: .6 }), WORLD.crews.length);
  crews.castShadow = true; scene.add(crews);
  WORLD.crews.forEach((c, i) => crews.setColorAt(i, new T.Color(COL[c.p])));
  const gc = document.createElement('canvas'); gc.width = gc.height = 64;
  const gx = gc.getContext('2d')!;
  const grd = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.25, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = grd; gx.fillRect(0, 0, 64, 64);
  const glowTex = new T.CanvasTexture(gc);
  const gpos = new Float32Array(260 * 3), gcol = new Float32Array(260 * 3), pg = new T.BufferGeometry();
  pg.setAttribute('position', new T.BufferAttribute(gpos, 3)); pg.setAttribute('color', new T.BufferAttribute(gcol, 3));
  const glow = new T.Points(pg, new T.PointsMaterial({ size: 1.5, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
  scene.add(glow);
  const colorObj = COL.map((c) => new T.Color(c));
  const towers = TOWERS.map(([x, z, p]) => {
    const g = new T.Group(); g.position.set(wx(x), 0, wz(z));
    const col = new T.Mesh(new T.CylinderGeometry(.16, .3, 2.2, 10), new T.MeshStandardMaterial({ color: '#2A2C34', metalness: .6, roughness: .4 }));
    col.position.y = 1.1; col.castShadow = true; g.add(col);
    const top = new T.Group(); top.position.y = 2.6;
    const mat = new T.MeshBasicMaterial({ color: COL[p] });
    const cubes = SYM.map(([a, b]) => { const m = new T.Mesh(box, mat); top.add(m); return [m, a - 1, b - 1] as const; });
    g.add(top);
    const base = new T.Mesh(new T.RingGeometry(.5, .75, 28), new T.MeshBasicMaterial({ color: COL[p], side: T.DoubleSide }));
    base.rotation.x = -Math.PI / 2; base.position.y = .03; g.add(base);
    const discMat = new T.MeshBasicMaterial({ color: COL[p], transparent: true, opacity: .05, depthWrite: false });
    const disc = new T.Mesh(new T.CircleGeometry(7, 48), discMat); disc.rotation.x = -Math.PI / 2; disc.position.y = .02; g.add(disc);
    const ringMat = new T.MeshBasicMaterial({ color: COL[p], transparent: true, opacity: .32, depthWrite: false, side: T.DoubleSide });
    const ring = new T.Mesh(new T.RingGeometry(6.88, 7, 64), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = .025; g.add(ring);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: COL[p], transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    sp.scale.set(2.6, 2.6, 1); sp.position.y = 2.6; g.add(sp);
    const warn = new T.Mesh(new T.RingGeometry(1.1, 1.35, 32), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: .8, depthWrite: false, side: T.DoubleSide }));
    warn.rotation.x = -Math.PI / 2; warn.position.y = .05; warn.visible = false; g.add(warn);
    scene.add(g);
    return { g, col, top, cubes, discMat, ringMat, sp, warn };
  });
  const ships = STRIKES.map((s) => {
    const g = new T.Group(), mat = new T.MeshBasicMaterial({ color: COL[s.p] });
    SHIP.forEach(([a, b]) => { const m = new T.Mesh(box, mat); m.scale.setScalar(.4); m.position.set((a - 1.5) * .44, 0, (b - 1) * .44); g.add(m); });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: COL[s.p], transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    sp.scale.set(4, 4, 1); g.add(sp);
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(new Float32Array(30 * 3), 3));
    const trail = new T.Line(tg, new T.LineBasicMaterial({ color: COL[s.p], transparent: true, opacity: .65 }));
    g.visible = trail.visible = false; scene.add(g); scene.add(trail);
    return { g, trail };
  });
  const flashes = [0, 1, 2].map(() => { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); s.visible = false; scene.add(s); return s; });
  const tmpC = new T.Color(), settledC = new T.Color('#3E4049');
  let lastF = -1;

  return {
    resize() {
      const [w2, h2] = size();
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    },
    dispose() {
      renderer.dispose();
      renderer.domElement.remove();
    },
    render(S, cam) {
      const t = S.t, f = smooth(70.5, 74.5, t);
      if (Math.abs(lastF - f) > 1e-4) {
        rockIdx.forEach(([k, hgt], n) => { const hh = lerp(hgt, .1, f); D.position.set(wx(k % W), hh / 2, wz((k / W) | 0)); D.rotation.set(0, 0, 0); D.scale.set(lerp(.98, .96, f), hh, lerp(.98, .96, f)); D.updateMatrix(); rocks.setMatrixAt(n, D.matrix); });
        rocks.instanceMatrix.needsUpdate = true; lastF = f; gridMat.color.set(f > .5 ? '#2A2C34' : '#1C1D24');
      }
      WORLD.walls.forEach((wl, i) => {
        const up = wl.born <= t && S.wallAlive[i], s = up ? clamp((t - wl.born) / .5, .01, 1) : .0001, hh = lerp(.7, .1, f) * s;
        D.position.set(wx(wl.x), hh / 2, wz(wl.z)); D.rotation.set(0, 0, 0); D.scale.set(.9, Math.max(hh, .0001), .9); D.updateMatrix(); walls.setMatrixAt(i, D.matrix);
      });
      walls.instanceMatrix.needsUpdate = true;
      let n = 0, gn = 0;
      const sp = lerp(.38, 1, f), sz = lerp(.32, .9, f);
      for (const d of S.drones) {
        if (n + 4 > 900) break;
        let cx = d.x - W / 2, cz = d.z - H / 2;
        if (f > .5) { cx = Math.floor(d.x) + .5 - W / 2; cz = Math.floor(d.z) + .5 - H / 2; }
        const y = lerp(.55 + Math.sin(t * 6 + d.id) * .07, .06, f), fx = d.dx, fz = d.dz, sx = -fz, sz2 = fx;
        for (const [c, r] of GLIDER) { const a = (c - 1.5) * sp, b = (.5 - r) * sp; D.position.set(cx + sx * a + fx * b, y, cz + sz2 * a + fz * b); D.rotation.set(0, 0, 0); D.scale.set(sz, lerp(sz, .1, f), sz); D.updateMatrix(); drones.setMatrixAt(n, D.matrix); drones.setColorAt(n, colorObj[d.p]); n++; }
        if (gn < 260) { gpos[gn * 3] = cx; gpos[gn * 3 + 1] = y; gpos[gn * 3 + 2] = cz; const c = colorObj[d.p]; gcol[gn * 3] = c.r * .7; gcol[gn * 3 + 1] = c.g * .7; gcol[gn * 3 + 2] = c.b * .7; gn++; }
      }
      drones.count = n; drones.instanceMatrix.needsUpdate = true; if (drones.instanceColor) drones.instanceColor.needsUpdate = true;
      glow.geometry.setDrawRange(0, gn); glow.geometry.attributes.position.needsUpdate = true; glow.geometry.attributes.color.needsUpdate = true; (glow.material as THREE_NS.PointsMaterial).size = lerp(1.5, .6, f);
      let m = 0;
      for (const d of S.debris) {
        if (m >= 1500) break;
        D.position.set(d.x - W / 2, d.y, d.z - H / 2); D.rotation.set(d.settled ? 0 : d.rx + t * 4, d.ry, 0);
        const s = .22; D.scale.set(s, lerp(s, .08, f), s); D.updateMatrix(); debris.setMatrixAt(m, D.matrix);
        tmpC.set(d.col).lerp(settledC, d.settled ? .78 : .2); debris.setColorAt(m, tmpC); m++;
      }
      debris.count = m; debris.instanceMatrix.needsUpdate = true; if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
      WORLD.crews.forEach((c, i) => {
        const a = c.born - 1.8, b = c.born + 1.4;
        const vis = t >= Math.max(0, a) && t <= b;
        let X = 0, Z = 0;
        if (vis) { const u = t < c.born ? smooth(a, c.born, t) : 1 - smooth(c.born, b, t); X = lerp(wx(c.fx), wx(c.x), u); Z = lerp(wz(c.fz), wz(c.z), u); }
        if (!vis || f > 0) { D.scale.set(.0001, .0001, .0001); D.position.set(0, -5, 0); } else { D.scale.set(1, 1, 1); D.position.set(X, .26 + Math.abs(Math.sin(t * 12 + i)) * .06, Z); }
        D.rotation.set(0, 0, 0); D.updateMatrix(); crews.setMatrixAt(i, D.matrix);
      });
      crews.instanceMatrix.needsUpdate = true;
      towers.forEach((o, i) => {
        const up = towerUp(S, i, t); o.g.visible = up; if (!up) return;
        const s = clamp((t - TOWERS[i][3]) / .8, .01, 1);
        o.col.scale.set(1, Math.max(.0001, s * (1 - f)), 1); o.col.position.y = 1.1 * s * (1 - f);
        o.top.position.y = lerp(2.6 * s, .06, f); o.top.rotation.y = (1 - f) * t * .8;
        const cs = lerp(.34, .92, f), gap = lerp(.36, 1, f);
        o.cubes.forEach(([mm, a, b]) => { mm.scale.set(cs, lerp(cs, .1, f), cs); mm.position.set(a * gap, lerp(b * -.36 + .36, 0, f), lerp(0, b * gap, f)); });
        const inb = f < .5 && STRIKES.some((st) => st.to === i && t >= st.launch - .6 && t < st.imp);
        o.warn.visible = inb;
        if (inb) { (o.warn.material as THREE_NS.MeshBasicMaterial).opacity = .45 + .45 * Math.sin(t * 16); o.warn.scale.setScalar(1 + .15 * Math.sin(t * 8)); }
        o.discMat.opacity = .05 * (1 - f); o.ringMat.opacity = .32 * (1 - f); o.sp.position.y = o.top.position.y; o.sp.material.opacity = 1 - f * .7;
      });
      STRIKES.forEach((s, i) => {
        const o = ships[i], on = t >= s.launch && t < s.imp;
        o.g.visible = o.trail.visible = on; if (!on) return;
        const p = strikePos(s, t), q = strikePos(s, Math.min(s.imp, t + .1));
        o.g.position.set(p[0], p[1], p[2]); o.g.lookAt(q[0], q[1], q[2]);
        const arr = o.trail.geometry.attributes.position.array as Float32Array;
        for (let k = 0; k < 30; k++) { const tt = lerp(Math.max(s.launch, t - 1.4), t, k / 29), pp = strikePos(s, tt); arr[k * 3] = pp[0]; arr[k * 3 + 1] = pp[1]; arr[k * 3 + 2] = pp[2]; }
        o.trail.geometry.attributes.position.needsUpdate = true;
      });
      flashes.forEach((sp2, k) => {
        const fl = S.flashes[k]; sp2.visible = !!fl; if (!fl) return;
        const a = t - fl.t0; sp2.position.set(fl.x - W / 2, 1.6, fl.z - H / 2); sp2.scale.setScalar(2 + a * 14); sp2.material.color.set(fl.c); sp2.material.opacity = 1 - a;
      });
      if (cam.pos && cam.look) {
        camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
        camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
        if (Math.abs(camera.fov - cam.fov) > .01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
      }
      renderer.render(scene, camera);
    },
  };
}
