'use client';

import { useRef, useState } from 'react';

/**
 * "Play this moment": that version's cut, from the shot's start to its end, then it stops (owner,
 * 2026-10-19). Nothing loads until it is pressed (preload none), so a page with several versions costs
 * nothing until a reader plays one.
 */
export function MomentPlay({ sources, poster, from, to, label }: { sources: { src: string; media?: string }[]; poster?: string; from: number; to: number; label: string }) {
  const v = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);

  const play = () => {
    const el = v.current;
    if (!el) return;
    setOn(true);
    const start = () => {
      el.currentTime = from;
      void el.play().catch(() => {});
    };
    if (el.readyState >= 1) start();
    else {
      el.addEventListener('loadedmetadata', start, { once: true });
      el.load();
    }
  };

  return (
    <div className="moment-play">
      <video
        ref={v}
        className="moment-video"
        poster={poster}
        preload="none"
        playsInline
        controls={on}
        aria-label={label}
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime >= to) e.currentTarget.pause();
        }}
      >
        {sources.map((s) => (
          <source key={s.src} src={s.src} media={s.media} type="video/mp4" />
        ))}
      </video>
      <button type="button" className="scene-small scene-small-solid moment-play-btn" onClick={play}>
        Play this moment
      </button>
    </div>
  );
}
