'use client';

import { useEffect, useState } from 'react';

const ANIMATE_KEY = 'snowmoon.action.3d', SLOW_KEY = 'snowmoon.action.3dslow', REPLAYS_KEY = 'snowmoon.action.replays';
export type Replays = 'all' | 'big' | 'off';

/**
 * Where and how the 3D action shows (owner, 2026-11-03). 3D only with WebGL and without reduced motion. Wide screens
 * keep the 3D view beside the 2D board the whole time. Phones have no view toggle, only the setting "Animate action in
 * 3D" (on by default, remembered): on, a turn's action plays in 3D in the board's place, then the 2D board returns.
 * `slow`: on this device 3D couldn't hold the frame target, so the action plays in 2D (for the rest of the visit).
 * `replays`: "Instant replays: all / big moments / off" (owner, 2026-11-04; all by default, remembered).
 */
export function use3D() {
  const [can, setCan] = useState(false), [wide, setWide] = useState(false), [animate, setAnimate] = useState(true), [slow, setSlow] = useState(false), [replays, setReplays] = useState<Replays>('all');
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let gl = false;
    try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { gl = false; }
    setCan(gl && !reduce);
    const mq = window.matchMedia('(min-width: 1100px)'), onWide = () => setWide(mq.matches);
    onWide(); mq.addEventListener('change', onWide);
    try { if (localStorage.getItem(ANIMATE_KEY) === 'off') setAnimate(false); if (sessionStorage.getItem(SLOW_KEY)) setSlow(true); const r = localStorage.getItem(REPLAYS_KEY); if (r === 'big' || r === 'off') setReplays(r); } catch { /* storage blocked */ }
    return () => mq.removeEventListener('change', onWide);
  }, []);
  return {
    can, wide, animate, slow, replays,
    setReplays: (v: Replays) => { setReplays(v); try { localStorage.setItem(REPLAYS_KEY, v); } catch { /* storage blocked */ } },
    /** 3D is offered here at all (the 3D view, Watch again in 3D). */
    on: can && !slow,
    setAnimate: (v: boolean) => { setAnimate(v); try { localStorage.setItem(ANIMATE_KEY, v ? 'on' : 'off'); } catch { /* storage blocked */ } },
    markSlow: () => { setSlow(true); try { sessionStorage.setItem(SLOW_KEY, '1'); } catch { /* storage blocked */ } },
  };
}
