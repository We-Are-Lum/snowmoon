'use client';

import { InfoLabel } from './info-label';
import { LABELS } from '~/lib/labels';
import { PODCAST_LINKS, REPO_URL } from '~/lib/config';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ReportPronunciation } from './report-pronunciation';
import { AiLabel } from './recipe-sheet';
import { AI_DECLARED, AI_LABEL } from '~/lib/ai-declared';
import { openComposer } from '~/lib/images/client';
import { useCanAddImage } from '~/lib/images/can-add';

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
  /** Its recipe (repo path) and its id in that recipe, for the recipe sheet. */
  recipe?: string;
  id?: string;
}
interface Props {
  chapter: number;
  chapters: number;
  /** Public URL of the narration's recipe, with every spoken text. */
  recipeUrl: string;
  url: string;
  duration: number;
  cues: PlayerCue[];
  images: PlayerImage[];
  /** The ¶ number readers see, by block index (for reports). */
  labels?: Record<number, number>;
  /** Read: the book on the page, and a slim bar while audio plays. Listen: the full listening pane. */
  view?: 'read' | 'listen';
  onView?: (v: 'read' | 'listen') => void;
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

export function ChapterPlayer({ chapter, chapters, recipeUrl, url, duration, cues, images, labels = {}, view = 'read', onView }: Props) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const canAddImage = useCanAddImage();
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [cue, setCue] = useState(0);
  const [ended, setEnded] = useState(false);
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
    if (view === 'read' && Date.now() - lastUserScroll.current > USER_SCROLL_PAUSE_MS) {
      const r = el.getBoundingClientRect();
      const bottomBar = 120;
      if (r.top < 60 || r.bottom > window.innerHeight - bottomBar) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [cue, cues, chapter, started, view]);

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

  const current = cues[cue];
  const next = cues[cue + 1];
  const imageIdx = useMemo(() => new Set(images.map((im) => im.idx)), [images]);
  const blockHtml = (idx?: number) => (idx === undefined ? '' : (document.getElementById(`c${chapter}-b${idx}`)?.innerHTML ?? ''));
  const [texts, setTexts] = useState<{ current: string; next: string }>({ current: '', next: '' });
  useEffect(() => {
    if (view !== 'listen') return;
    setTexts({ current: current?.description ? '' : blockHtml(current?.idx), next: next?.description ? '' : blockHtml(next?.idx) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cue, chapter]);
  const para = (c?: PlayerCue) => (c && labels[c.idx] ? `¶ ${labels[c.idx]}` : '');
  const totalParas = Object.keys(labels).length;

  const audioEl = (
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
  );
  // One short line (owner, 2026-10-08): the model and settings are in the recipe.
  const footer = (
    <p className="player-label">
      <AiLabel kind="voice" text={AI_LABEL.voice} file={recipeUrl} item={current ? String(current.idx) : undefined} />
      {started && current && (
        <>
          {' · '}
          {/* Model-drafted wording (owner to rewrite). */}
          <ReportPronunciation target={{ chapter, idx: current.idx, label: labels[current.idx] ?? null }} />
        </>
      )}
      {' · '}
      <a href={url} download={`snowmoon-chapter-${chapter}.m4a`}>
        Download
      </a>
    </p>
  );
  // Where each image starts, as a share of the chapter's paragraphs: marks on the progress bar.
  const marks = useMemo(() => cues.map((c, i) => (imageIdx.has(c.idx) ? i : -1)).filter((i) => i >= 0), [cues, imageIdx]);
  const at = (i: number) => `${(i / Math.max(1, cues.length)) * 100}%`;

  if (view === 'read')
    return (
      <div className={`chapter-player player-mini${started ? ' is-started' : ''}`} role="region" aria-label="Narration">
        {audioEl}
        {started && (
          <div className="player-controls">
            <button type="button" className="player-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '⏸' : '▶'}
            </button>
            <span className="player-time">
              Listening · {para(current)} · {fmt(time)} / {fmt(duration)}
            </span>
            {onView && (
              <button type="button" className="player-to-listen" onClick={() => onView('listen')}>
                Listen view
              </button>
            )}
          </div>
        )}
      </div>
    );

  return (
    <section className={`chapter-player listen-pane${started ? ' is-started' : ''}`} aria-label="Listen">
      {audioEl}
      {/* The podcast feed, moved here from the menu (owner, 2026-10-09). Model-drafted wording. */}
      <p className="listen-podcast">
        Every chapter as a podcast: <a href={PODCAST_LINKS.spotify} target="_blank" rel="noreferrer">Spotify ↗</a> · <a href={PODCAST_LINKS.feed}>RSS feed</a>
      </p>
      {/* No picture for this part: nothing is shown in its place (owner, 2026-10-08). */}
      {image && (
        <figure className="listen-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt} width={1024} height={576} />
          <figcaption className="block-caption">
            {labels[image.idx] ? `¶ ${labels[image.idx]} · ` : ''}
            {image.recipe ? (
              <AiLabel kind="image" text={AI_LABEL.image} file={image.recipe} item={image.id} />
            ) : (
              <>
                {AI_LABEL.image}
                <span className="sr-only"> ({AI_DECLARED.image})</span>
              </>
            )}
          </figcaption>
        </figure>
      )}
      <div className="listen-text">
        {current?.description ? (
          <p className="listen-current listen-description">
            {/* Owner ruling, 2026-10-09: while a spoken description plays, "AI description ⓘ". */}
            <span className="player-description-label">
              <InfoLabel
                word={LABELS.aiDescription.word}
                kind="ai-description"
                declaration={LABELS.aiDescription.declaration}
                title={LABELS.aiDescription.title}
                body={[...LABELS.aiDescription.body]}
                links={[{ href: `${REPO_URL}/blob/main/docs/prompts/008a-agent-prompts.md`, label: LABELS.aiDescription.prompt, external: true }]}
              />
            </span>
            {current.description}
          </p>
        ) : (
          <div className="listen-current" dangerouslySetInnerHTML={{ __html: texts.current }} />
        )}
        {next && (next.description ? <p className="listen-next">{next.description}</p> : <div className="listen-next" aria-hidden="true" dangerouslySetInnerHTML={{ __html: texts.next }} />)}
      </div>
      <div className="listen-bottom">
      <div
        className="listen-progress"
        role="slider"
        tabIndex={0}
        aria-label="Position in the chapter, by paragraph"
        aria-valuemin={1}
        aria-valuemax={cues.length}
        aria-valuenow={cue + 1}
        aria-valuetext={`${para(current) || `Block ${cue + 1}`} of ${totalParas} paragraphs`}
        onKeyDown={(e) => {
          const go = { ArrowRight: cue + 1, ArrowLeft: cue - 1, ArrowUp: cue + 1, ArrowDown: cue - 1, Home: 0, End: cues.length - 1 }[e.key];
          if (go === undefined) return;
          e.preventDefault();
          seek(go, playing);
        }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seek(Math.floor(((e.clientX - r.left) / r.width) * cues.length), playing);
        }}
      >
        {/* A plain bar: the part heard so far, and a mark where each image begins. */}
        <span className="listen-track" />
        <span className="listen-fill" style={{ width: at(cue + 1) }} />
        {marks.map((i) => (
          <span key={i} className="listen-mark" style={{ left: at(i) }} />
        ))}
      </div>
      <p className="listen-meta">
        <span>
          {para(current) ? `${para(current)} of ${totalParas}` : `Title · ${totalParas} paragraphs`} · {fmt(time)}
        </span>
        <span>{fmt(duration)}</span>
      </p>
      <div className="listen-controls">
        <button type="button" className="player-rate" onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])} aria-label={`Speed ${rate} times`}>
          {rate.toFixed(1)}×
        </button>
        <div className="listen-transport">
          <button type="button" className="listen-step" onClick={() => step(-1)} aria-label="Previous paragraph">
            |◀
          </button>
          <button type="button" className="listen-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="listen-step" onClick={() => step(1)} aria-label="Next paragraph">
            ▶|
          </button>
        </div>
        <span className="listen-voice">house voice</span>
      </div>
      {/* L18: an image for the paragraph being read; playback pauses while the composer is open. */}
      {current && canAddImage && (
        <button
          type="button"
          className="add-image listen-add-image"
          onClick={() => {
            audio.current?.pause();
            openComposer({ chapter, start: current.idx, end: current.idx });
          }}
        >
          + Add an image to this moment
        </button>
      )}
      </div>
      {ended && chapter < chapters && (
        <Link className="player-next" href={`/chapter/${chapter + 1}?view=listen`}>
          Next: Chapter {chapter + 1} →
        </Link>
      )}
      {footer}
    </section>
  );
}
