'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SHARE_BLOCK_EVENT } from './quote-share';

/**
 * Play view (brief Milestone 3 and §4e): plays the chapter's house narration,
 * highlights the block being read and keeps it in view, and shows the image for
 * the current block. Everything is anchored to blocks; time comes only from the
 * narration's cues, so other narrations can replace this one without touching
 * anchors.
 */
export interface PlayerCue {
  idx: number;
  start: number;
  end: number;
  description?: string;
}
export interface PlayerImage {
  idx: number;
  url: string;
  alt: string;
}
interface Props {
  chapter: number;
  chapters: number;
  label: string;
  /** Public URL of the narration's recipe, with every spoken text. */
  recipeUrl: string;
  url: string;
  duration: number;
  cues: PlayerCue[];
  images: PlayerImage[];
}

const RATES = [1, 1.25, 1.5, 2, 0.8];
const USER_SCROLL_PAUSE_MS = 4000;

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** The cue being read at time t: the last cue that has started. */
function cueAt(cues: PlayerCue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t + 0.05) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return Math.max(0, found);
}

export function ChapterPlayer({ chapter, chapters, label, recipeUrl, url, duration, cues, images }: Props) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [cue, setCue] = useState(0);
  const [ended, setEnded] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const lastUserScroll = useRef(0);
  const highlighted = useRef<Element | null>(null);
  const storageKey = `snowmoon:position:c${chapter}`;

  const cueByIdx = useMemo(() => new Map(cues.map((c, i) => [c.idx, i])), [cues]);
  const image = useMemo(() => {
    const idx = cues[cue]?.idx ?? -1;
    let current: PlayerImage | null = null;
    for (const im of images) if (im.idx <= idx) current = im;
    return current;
  }, [cue, cues, images]);

  // Highlight the block being read and keep it in view, unless the reader just scrolled.
  useEffect(() => {
    if (!started) return;
    const c = cues[cue];
    if (!c) return;
    const el = document.getElementById(`c${chapter}-b${c.idx}`);
    if (highlighted.current && highlighted.current !== el) highlighted.current.classList.remove('is-reading');
    if (!el) return;
    el.classList.add('is-reading');
    highlighted.current = el;
    if (Date.now() - lastUserScroll.current > USER_SCROLL_PAUSE_MS) {
      const r = el.getBoundingClientRect();
      const bottomBar = 120;
      if (r.top < 60 || r.bottom > window.innerHeight - bottomBar) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [cue, cues, chapter, started]);

  useEffect(() => {
    const onScroll = () => {
      lastUserScroll.current = Date.now();
    };
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('touchmove', onScroll);
      highlighted.current?.classList.remove('is-reading');
    };
  }, []);

  const seek = useCallback(
    (i: number, play = true) => {
      const a = audio.current;
      const c = cues[Math.max(0, Math.min(cues.length - 1, i))];
      if (!a || !c) return;
      a.currentTime = c.start;
      setCue(cues.indexOf(c));
      setStarted(true);
      setEnded(false);
      if (play) void a.play();
    },
    [cues],
  );

  const start = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (!started) {
      // Start at the linked paragraph if the page was opened at one, else where this chapter was left.
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const m = hash.match(/^c\d+-b(\d+)$/);
      const fromHash = m ? cueByIdx.get(Number(m[1])) : undefined;
      if (fromHash !== undefined) return seek(fromHash);
      const saved = Number(localStorage.getItem(storageKey) ?? 0);
      if (saved > 0 && saved < duration - 5) a.currentTime = saved;
      setStarted(true);
    }
    void a.play();
  }, [started, cueByIdx, seek, storageKey, duration]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) start();
    else a.pause();
  }, [start]);

  const step = useCallback((d: number) => seek(cue + d), [cue, seek]);

  // While listening, tapping a block jumps there.
  useEffect(() => {
    if (!started) return;
    const article = document.querySelector('article.chapter');
    const onClick = (e: Event) => {
      const target = e.target as Element;
      if (target.closest('a, button, summary, .chapter-player')) return;
      const block = target.closest('.block[id]');
      const m = block?.id.match(/-b(\d+)$/);
      const i = m ? cueByIdx.get(Number(m[1])) : undefined;
      if (i !== undefined) seek(i);
    };
    article?.addEventListener('click', onClick);
    return () => article?.removeEventListener('click', onClick);
  }, [started, cueByIdx, seek]);

  // Lock screen and headphone controls.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Chapter ${chapter}`,
      artist: 'Snowmoon · synthetic narration',
      album: 'Snowmoon by Vitalik Buterin (GPL-3.0)',
      artwork: image ? [{ src: image.url, sizes: '1024x576', type: 'image/jpeg' }] : [{ src: '/icon.png', sizes: '1024x1024', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => start());
    navigator.mediaSession.setActionHandler('pause', () => audio.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }, [chapter, image, start, step]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  const onTime = () => {
    const a = audio.current;
    if (!a) return;
    setTime(a.currentTime);
    const i = cueAt(cues, a.currentTime);
    if (i !== cue) setCue(i);
    if (Math.floor(a.currentTime) % 5 === 0) localStorage.setItem(storageKey, String(a.currentTime));
  };

  return (
    <div className={`chapter-player${started ? ' is-started' : ''}`} role="region" aria-label="Narration">
      <audio
        ref={audio}
        src={url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTime}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
          localStorage.removeItem(storageKey);
        }}
      />
      {started && cues[cue]?.description && (
        <p className="player-description">
          <span className="player-description-label">Model-drafted description, not the author&apos;s words</span>
          {cues[cue].description}
        </p>
      )}
      {started && image && showImage && (
        <button type="button" className="player-image" onClick={() => setShowImage(false)} aria-label="Hide image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt} width={1024} height={576} />
          <span className="player-image-label">AI-generated image</span>
        </button>
      )}
      <div className="player-controls">
        {!started ? (
          <button type="button" className="player-listen" onClick={start}>
            ▶ Listen · {Math.round(duration / 60)} min
          </button>
        ) : (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="Previous paragraph">
              ⏮
            </button>
            <button type="button" className="player-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '⏸' : '▶'}
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next paragraph">
              ⏭
            </button>
            <span className="player-time">
              {fmt(time)} / {fmt(duration)}
            </span>
            <button
              type="button"
              className="player-rate"
              onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}
              aria-label={`Speed ${rate} times`}
            >
              {rate}×
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(SHARE_BLOCK_EVENT, { detail: { idx: cues[cue]?.idx } }))}
              aria-label="Share this paragraph as a quote card"
            >
              ↗
            </button>
            {images.length > 0 && !showImage && (
              <button type="button" onClick={() => setShowImage(true)} aria-label="Show images">
                🖼
              </button>
            )}
          </>
        )}
        <a className="player-download" href={url} download={`snowmoon-chapter-${chapter}.m4a`} aria-label="Download this chapter's audio">
          ⤓
        </a>
      </div>
      {ended && chapter < chapters && (
        <Link className="player-next" href={`/chapter/${chapter + 1}`}>
          Next: Chapter {chapter + 1} →
        </Link>
      )}
      <p className="player-label">
        {label} · GPL-3.0 · <a href={recipeUrl}>recipe</a>
      </p>
    </div>
  );
}
