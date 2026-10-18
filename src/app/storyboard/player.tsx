'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A storyboard played as a slideshow (owner, 2026-10-18): each frame for its length, with the scene's
 * own sound where it lines up (a frame whose lines all keep the version's takes plays the version's mix
 * from that shot's start, from the cut's video on the site's media host), and otherwise the lines it
 * holds, each in the take chosen for it, at its own time in the shot. Sound starts only from Play.
 */
export interface PlayLine {
  cue: string;
  offset: number;
  src: string;
  label: string;
}
export interface Slide {
  key: string;
  src: string | null;
  alt: string;
  caption: string;
  seconds: number;
  from: number;
  lines: PlayLine[];
  /** Every line keeps the version's own take: the version's mix plays under this frame. */
  mix: boolean;
}

export function StoryboardPlayer({ slides, mixUrl, aiLabel }: { slides: Slide[]; mixUrl: string | null; aiLabel: string | null }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mix = useRef<HTMLAudioElement | null>(null);
  const voices = useRef<HTMLAudioElement[]>([]);
  const timers = useRef<number[]>([]);
  const total = slides.reduce((n, s) => n + s.seconds, 0);

  const stopSound = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    voices.current.forEach((a) => a.pause());
    voices.current = [];
    mix.current?.pause();
  };
  useEffect(() => stopSound, []);

  useEffect(() => {
    if (!playing) return stopSound();
    const s = slides[i];
    if (!s) return setPlaying(false);
    stopSound();
    if (s.mix && mixUrl && mix.current) {
      mix.current.currentTime = s.from;
      void mix.current.play().catch(() => {});
    } else {
      for (const l of s.lines) {
        if (l.offset >= s.seconds) continue;
        timers.current.push(
          window.setTimeout(() => {
            const a = new Audio(l.src);
            voices.current.push(a);
            void a.play().catch(() => {});
          }, Math.max(0, l.offset) * 1000),
        );
      }
    }
    timers.current.push(window.setTimeout(() => (i + 1 < slides.length ? setI(i + 1) : setPlaying(false)), s.seconds * 1000));
  }, [playing, i, slides, mixUrl]);

  if (!slides.length) return <p className="sb-empty">No frames yet.</p>;
  const s = slides[Math.min(i, slides.length - 1)];
  return (
    <div className="sb-player">
      <figure className="sb-screen">
        {s.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.src} alt={s.alt} width={1280} height={720} />
        ) : (
          <div className="sb-blank label">{s.alt}</div>
        )}
        <figcaption className="label">
          {i + 1} / {slides.length} · {s.caption} · {s.seconds.toFixed(1)} s
        </figcaption>
      </figure>
      {mixUrl && <audio ref={mix} src={mixUrl} preload="none" />}
      <div className="sb-controls">
        <button type="button" className="rx-btn" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Previous frame">
          ‹ Back
        </button>
        <button
          type="button"
          className="rx-btn rx-btn-solid"
          onClick={() => {
            if (!playing && i >= slides.length - 1) setI(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="rx-btn" onClick={() => setI(Math.min(slides.length - 1, i + 1))} disabled={i >= slides.length - 1} aria-label="Next frame">
          Next ›
        </button>
        <span className="label sb-total">{total.toFixed(1)} s in all</span>
      </div>
      {s.lines.length > 0 && (
        <p className="sb-lines">
          {s.mix && mixUrl ? 'Sound: the version’s own mix. ' : 'Sound: '}
          {s.lines.map((l) => l.label).join(' · ')}
        </p>
      )}
      {aiLabel && <p className="label sb-ai">{aiLabel}</p>}
    </div>
  );
}
