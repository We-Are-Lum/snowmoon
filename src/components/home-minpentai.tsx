'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { InfoLabel } from './info-label';
import { LABELS } from '~/lib/labels';
import { HOME_TEXT as H } from '~/lib/home';
import { LEARN_TEXT as T } from '~/lib/minpentai/learn-text';
import { COL, rng } from '~/lib/minpentai/learn-game/broadcast';
import { LS, indexOf, type PiecesLesson } from '~/lib/minpentai/learn-game/lessons';
import { COST, PH, PW, pStep, towers, type Hit, type PState } from '~/lib/minpentai/learn-game/pieces';
import { botTurn } from '~/lib/minpentai/learn-game/bot';

/**
 * Minpentai playing itself, small: Learn's practice match (src/lib/minpentai/learn-game, RULES INVENTED
 * FOR THIS EDITION) on its own board, with Learn's computer player taking both sides (bot.ts). Every
 * EVERY turns both sides place pieces (who goes first alternates); the match ends when a side has no
 * towers or at LIMIT turns, then a new one starts. The practice match's random new rule is not used.
 * Paused off screen and in a hidden tab; under prefers-reduced-motion it starts paused.
 */
const EVERY = 12;
const LIMIT = 96;
const STEP_MS = 260;
const practice = LS[indexOf('practice')] as PiecesLesson;
const fresh = (): PState => practice.build();

function act(s: PState, random: () => number): PState {
  const first = (s.turn / EVERY) % 2 === 0 ? 0 : 1;
  const a = botTurn(s, first, COST, random);
  return botTurn(a, first === 0 ? 1 : 0, COST, random);
}

function draw(c: HTMLCanvasElement, s: PState, hits: Hit[]) {
  const g = c.getContext('2d');
  if (!g) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  if (!w) return;
  c.width = Math.round(w * dpr);
  c.height = Math.round(((w * PH) / PW) * dpr);
  const cp = c.width / PW;
  g.fillStyle = '#060608';
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    g.fillStyle = '#0E0F13';
    g.fillRect(x * cp + 0.5, y * cp + 0.5, cp - 1, cp - 1);
  }
  for (const q of s.pieces) {
    const cx = (q.x + 0.5) * cp, cy = (q.y + 0.5) * cp;
    if (q.k === 'rock') { g.fillStyle = '#4B4C55'; g.fillRect(q.x * cp + cp * 0.12, q.y * cp + cp * 0.12, cp * 0.76, cp * 0.76); continue; }
    const col = COL[q.p!];
    g.fillStyle = col;
    if (q.k === 'tower') {
      g.beginPath(); g.arc(cx, cy, cp * 0.38, 0, 6.283); g.fill();
      g.fillStyle = '#0E0F13'; g.beginPath(); g.arc(cx, cy, cp * 0.17, 0, 6.283); g.fill();
    } else if (q.k === 'square') {
      g.globalAlpha = q.hp === 1 ? 0.3 : 0.6;
      g.fillRect(q.x * cp + cp * 0.2, q.y * cp + cp * 0.2, cp * 0.6, cp * 0.6);
      g.globalAlpha = 1;
    } else {
      q.trail.forEach(([tx, ty], k) => { g.globalAlpha = 0.3 - k * 0.09; g.fillRect((tx + 0.4) * cp, (ty + 0.4) * cp, cp * 0.2, cp * 0.2); });
      g.globalAlpha = 1;
      const n = Math.hypot(q.dx, q.dy) || 1, fx = q.dx / n, fy = q.dy / n, sx = -fy, sy = fx;
      g.beginPath();
      g.moveTo(cx + fx * cp * 0.38, cy + fy * cp * 0.38);
      g.lineTo(cx - fx * cp * 0.28 + sx * cp * 0.3, cy - fy * cp * 0.28 + sy * cp * 0.3);
      g.lineTo(cx - fx * cp * 0.12, cy - fy * cp * 0.12);
      g.lineTo(cx - fx * cp * 0.28 - sx * cp * 0.3, cy - fy * cp * 0.28 - sy * cp * 0.3);
      g.closePath(); g.fill();
    }
  }
  for (const h of hits) {
    g.strokeStyle = h.k === 'tower' ? COL[h.p!] : '#E7E4DD';
    g.lineWidth = Math.max(1, cp * 0.12);
    g.beginPath(); g.arc((h.x + 0.5) * cp, (h.y + 0.5) * cp, cp * 0.55, 0, 6.283); g.stroke();
  }
}

export function HomeMinpentai() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [s, setS] = useState<PState>(fresh);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);
  const random = useRef<() => number>(() => 0.5);

  useEffect(() => {
    random.current = rng(Date.now() >>> 0);
    setS((x) => act(x, random.current));
    setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    const el = box.current;
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      setVisible(onScreen && !document.hidden);
    });
    if (el) io.observe(el);
    const onVis = () => setVisible(onScreen && !document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const t = window.setInterval(() => {
      setS((x) => {
        if (!towers(x, 0) || !towers(x, 1) || x.turn >= LIMIT) return act(fresh(), random.current);
        const n = pStep(x);
        return n.turn % EVERY === 0 ? { ...act(n, random.current), hits: n.hits } : n;
      });
    }, STEP_MS);
    return () => window.clearInterval(t);
  }, [playing, visible]);

  useEffect(() => {
    if (canvas.current) draw(canvas.current, s, s.hits);
  }, [s]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ro = new ResizeObserver(() => draw(c, s, s.hits));
    ro.observe(c);
    return () => ro.disconnect();
  }, [s]);

  const L = LABELS.minpentai.invented;
  return (
    <section className="home-card home-game" aria-labelledby="home-game-head">
      <div className="home-card-head">
        <h2 id="home-game-head">{H.game.head}</h2>
        <span className="home-turn" data-turn={s.turn}>
          Turn {s.turn}
        </span>
      </div>
      <div ref={box} className="home-board">
        <canvas ref={canvas} aria-hidden="true" />
        <button type="button" className="home-board-toggle" aria-pressed={!playing} onClick={() => setPlaying(!playing)}>
          {playing ? H.game.pause : H.game.resume}
        </button>
      </div>
      <p className="home-game-caption">{H.game.caption}</p>
      <div className="home-game-foot">
        <InfoLabel
          className="ml-tag ml-tag-dashed"
          word={L.word}
          kind="invented"
          declaration={`${T.tags.rules}: ${L.declaration}`}
          title={L.title}
          body={[T.tagDetails.rules]}
          links={[{ href: '/minpentai/rule', label: "The rule recovered from the book's figure →" }]}
        />
      </div>
      <Link href="/minpentai" className="home-btn home-btn-line">
        {H.game.play}
      </Link>
    </section>
  );
}
