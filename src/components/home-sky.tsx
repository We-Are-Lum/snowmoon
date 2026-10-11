'use client';

import { useEffect, useRef } from 'react';

/**
 * The home page's pixel sky (Claude Design, docs/design/home/HomeWindow.dc.html, initSky): a dithered
 * crescent snowmoon rising and stars fading in and twinkling, drawn at a quarter of the pixel size and
 * scaled up. Decoration only (aria-hidden). Still, one frame, under prefers-reduced-motion; paused
 * while the hero is off screen or the tab is hidden. Nothing is loaded: it is drawn in code.
 */
const P = 4;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function HomeSky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const host = c?.parentElement;
    const ctx = c?.getContext('2d');
    if (!c || !host || !ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let still = motion.matches;
    let W = 1, H = 1, R = 10, cx = 0, cy = 0;
    let moon: HTMLCanvasElement | null = null;
    let stars: { x: number; y: number; b: number; p: number; s: number; d: number; big: boolean }[] = [];
    const t0 = performance.now();
    let last = 0, raf = 0, onScreen = true;

    const size = () => {
      const r = host.getBoundingClientRect();
      W = Math.max(1, Math.ceil(r.width / P));
      H = Math.max(1, Math.ceil(r.height / P));
      c.width = W;
      c.height = H;
      R = Math.max(10, Math.round(Math.min(H * 0.3, W * 0.2)));
      cx = Math.round(W - Math.max(R + 8, W * 0.18));
      cy = Math.round(H * 0.4);
      moon = document.createElement('canvas');
      moon.width = moon.height = R * 2 + 1;
      const m = moon.getContext('2d')!;
      const id = m.createImageData(R * 2 + 1, R * 2 + 1);
      const maria = (u: number, v: number) => 0.5 + 0.5 * (Math.sin(u * 3.1 + 1.3) * Math.cos(v * 2.7 - 0.4) * 0.6 + Math.sin(u * 5.3 - v * 4.1 + 2) * 0.4);
      for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++) {
          const u = x / R, w = y / R;
          if (Math.hypot(u, w) > 1) continue;
          const cut = Math.hypot(u - 0.42, w + 0.16) / 0.9;
          if (cut < 1) continue;
          const edge = Math.min(1, (cut - 1) * 3.2);
          const v = (0.45 + 0.55 * edge) * (0.8 + 0.2 * (1 - Math.max(0, maria(u, w) - 0.6) * 2));
          if (v * 16 < BAYER[((y + R) % 4) * 4 + ((x + R) % 4)] + 0.5) continue;
          const i = ((y + R) * (R * 2 + 1) + (x + R)) * 4;
          id.data[i] = 231;
          id.data[i + 1] = 236;
          id.data[i + 2] = 240;
          id.data[i + 3] = 255;
        }
      m.putImageData(id, 0, 0);
      let a = 20261009;
      const rnd = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
      stars = [];
      const n = Math.round((W * H) / 70);
      for (let i = 0; i < n; i++) {
        const x = (rnd() * W) | 0, y = (rnd() * H) | 0;
        if (Math.hypot(x - cx, y - cy) < R + 3) continue;
        stars.push({ x, y, b: 0.2 + rnd() * 0.8, p: rnd() * 6.28, s: 0.6 + rnd() * 1.8, d: rnd() * 1.4, big: rnd() < 0.06 });
      }
    };
    const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
    const draw = (now: number) => {
      const t = still ? 99 : (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const mk = ease(t / 2.2);
      ctx.globalAlpha = 0.26 * mk;
      if (moon) ctx.drawImage(moon, cx - R, cy - R + Math.round((1 - mk) * R * 0.6));
      ctx.fillStyle = '#E7ECF0';
      for (const s of stars) {
        const k = ease((t - s.d) / 0.8);
        if (k <= 0) continue;
        const tw = still ? 0.7 : 0.55 + 0.45 * Math.sin(t * s.s + s.p);
        const al = s.b * tw * k * 0.5;
        ctx.globalAlpha = al;
        ctx.fillRect(s.x, s.y, 1, 1);
        if (s.big && tw > 0.9) {
          ctx.globalAlpha = al * 0.5;
          ctx.fillRect(s.x - 1, s.y, 1, 1);
          ctx.fillRect(s.x + 1, s.y, 1, 1);
          ctx.fillRect(s.x, s.y - 1, 1, 1);
          ctx.fillRect(s.x, s.y + 1, 1, 1);
        }
      }
      if (!still && t > 1.6) {
        const g = Math.sin(t * 0.9);
        if (g > 0.96) {
          ctx.globalAlpha = (g - 0.96) * 8;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(cx - Math.round(R * 0.62), cy - Math.round(R * 0.62), 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    };
    const loop = (now: number) => {
      if (now - last > 50) {
        draw(now);
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (still) draw(0);
      else if (onScreen && !document.hidden) raf = requestAnimationFrame(loop);
    };
    size();
    draw(performance.now());
    const ro = new ResizeObserver(() => {
      size();
      draw(performance.now());
    });
    ro.observe(host);
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      run();
    });
    io.observe(host);
    const onVis = () => run();
    const onMotion = () => {
      still = motion.matches;
      run();
    };
    document.addEventListener('visibilitychange', onVis);
    motion.addEventListener('change', onMotion);
    run();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      motion.removeEventListener('change', onMotion);
    };
  }, []);
  return <canvas ref={ref} className="home-sky" aria-hidden="true" />;
}
