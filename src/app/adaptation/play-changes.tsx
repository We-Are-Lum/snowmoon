'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiLabel } from '~/components/recipe-sheet';
import { AI_LABEL, WHOSE } from '~/lib/ai-declared';
import type { RecipeView } from '~/lib/recipe-view';
import { CHANGES_EVENT, changesKey, readChanges, shownFor, type Changes, type RemixRef } from './editor/my-changes';
import './play-changes.css';

/**
 * "Play with my changes" (owner, 2026-10-18): replay the scene with your changes, before any frame
 * renders. It plays the version's own video and sound; during each shot you changed in the live
 * editor, your version of the shot lies over the video, in time with it: the grey layout from your
 * camera, or your Remix frame once you've made one (the newer of the two). Everything it shows is
 * read from this browser (editor/my-changes.ts) and the version's editor data; it sends nothing and
 * costs nothing. The button shows only when this browser holds a change to this version.
 * Wording DRAFTED by the coding agent.
 */
interface Span {
  id: string;
  n: number;
  from: number;
  to: number;
}
type DataShot = { id: string; n: number; from: number; to: number };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function remixView(r: RemixRef, n: number): RecipeView {
  return {
    file: '',
    github: r.page,
    whose: WHOSE.reader(r.by),
    full: { href: r.page, text: 'Its page and recipe →' },
    what: `A Remix frame of shot ${n}, made from the camera ${r.by} set.`,
    // Never null here: null would read as "no model was used".
    model: r.model ?? { name: 'An image model, named on its page', licence: 'on its page', where: 'as its page says' },
    prompt: r.words ? { label: 'What to change, in their words', text: r.words } : null,
    inputs: [],
    published: { by: r.by, when: new Date(r.at).toISOString().slice(0, 10) },
  };
}

export function PlayChanges({
  adaptation,
  version,
  dataUrl,
  videoUrl,
  poster,
  startAt = 0,
  variant = 'scene',
}: {
  adaptation: number;
  version: number;
  dataUrl: string;
  videoUrl: string | null;
  poster?: string;
  /** Where the replay starts, in seconds (the editor starts it at the shot you're on). */
  startAt?: number;
  variant?: 'scene' | 'editor';
}) {
  const [changes, setChanges] = useState<Changes>({});
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const read = () => setChanges(readChanges(adaptation, version));
    const onStorage = (e: StorageEvent) => (e.key === null || e.key === changesKey(adaptation, version)) && read();
    read();
    window.addEventListener(CHANGES_EVENT, read);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGES_EVENT, read);
      window.removeEventListener('storage', onStorage);
    };
  }, [adaptation, version]);

  const count = Object.keys(changes).length;
  if (!videoUrl || (!count && !open)) return null;
  return (
    <>
      <button ref={opener} type="button" className={variant === 'scene' ? 'pc-open pc-open-scene' : 'pc-open pc-open-editor'} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Play with my changes
        <span className="pc-open-sub">
          {count === 1 ? '1 shot' : `${count} shots`} you changed, over version {version}
        </span>
      </button>
      {open && (
        <Player
          version={version}
          dataUrl={dataUrl}
          videoUrl={videoUrl}
          poster={poster}
          startAt={startAt}
          changes={changes}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Player({ version, dataUrl, videoUrl, poster, startAt, changes, onClose }: { version: number; dataUrl: string; videoUrl: string; poster?: string; startAt: number; changes: Changes; onClose: () => void }) {
  const [shots, setShots] = useState<DataShot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(startAt);
  const [active, setActive] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const spansRef = useRef<Span[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch(dataUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { shots?: DataShot[] }) => alive && setShots(d.shots ?? []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [dataUrl]);

  // The changed shots, in the version's timeline: [from, to) in seconds.
  const spans = useMemo<Span[]>(() => (shots ?? []).filter((s) => changes[s.id] && shownFor(changes[s.id])).map((s) => ({ id: s.id, n: s.n, from: s.from, to: s.to })), [shots, changes]);
  spansRef.current = spans;

  // Which shot the video is in, read from its own clock: on every frame while it plays, and on seek, pause and end.
  const sync = useCallback(() => {
    const v = video.current;
    if (!v) return;
    const t = v.currentTime;
    setNow(Math.floor(t * 10) / 10);
    setActive(spansRef.current.find((s) => t >= s.from && t < s.to)?.id ?? null);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const loop = () => {
      sync();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, sync]);
  useEffect(sync, [spans, sync]);

  // A dialog: focus inside, Escape closes, Tab stays inside, the page behind doesn't scroll.
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('.pc-close')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key !== 'Tab' || !sheet.current) return;
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'));
      if (!items.length) return;
      if (e.shiftKey && document.activeElement === items[0]) (e.preventDefault(), items[items.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === items[items.length - 1]) (e.preventDefault(), items[0].focus());
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const v = video.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      v?.pause();
    };
  }, [onClose]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      if (v.ended) v.currentTime = 0;
      void v.play().catch(() => setPlaying(false));
    } else v.pause();
  };
  const seek = (t: number, play = false) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    sync();
    if (play && v.paused) void v.play().catch(() => {});
  };

  const span = spans.find((s) => s.id === active) ?? null;
  const shown = span ? shownFor(changes[span.id]) : null;
  const unknown = shots ? Object.keys(changes).filter((id) => !shots.some((s) => s.id === id)).length : 0;

  return (
    <div className="pc-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="pc-sheet" role="dialog" aria-modal="true" aria-labelledby="pc-title">
        <div className="pc-head">
          <h2 id="pc-title" className="pc-title">
            Your changes · version {version}
          </h2>
          <button type="button" className="pc-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="pc-screen">
          <video
            ref={video}
            className="pc-video"
            src={videoUrl}
            poster={poster}
            preload="auto"
            playsInline
            aria-label={`Version ${version}, with your changes over it`}
            onClick={toggle}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
              if (startAt > 0) e.currentTarget.currentTime = startAt;
              sync();
            }}
            onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => (setPlaying(false), sync())}
            onEnded={() => (setPlaying(false), sync())}
            onSeeked={sync}
            onTimeUpdate={sync}
          />
          {span && shown && (
            <figure className="pc-over" data-kind={shown.kind} data-shot={span.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shown.src} alt={shown.kind === 'remix' ? `Your Remix frame of shot ${span.n}: ${shown.remix.words}` : `Shot ${span.n}: the grey layout from the camera you set`} />
              <figcaption className="pc-tag">
                {shown.kind === 'remix' ? (
                  <>
                    Your Remix frame · <AiLabel kind="image" text={AI_LABEL.imageBy(shown.remix.by)} view={remixView(shown.remix, span.n)} />
                  </>
                ) : (
                  'Your change · grey layout, no AI'
                )}
              </figcaption>
            </figure>
          )}
        </div>

        <div className="pc-controls">
          <button type="button" className="pc-btn pc-play" onClick={toggle}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            className="pc-seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(now, duration || now)}
            onChange={(e) => seek(+e.target.value)}
            aria-label="Position in the scene"
            aria-valuetext={`${clock(now)} of ${clock(duration)}`}
            disabled={!duration}
          />
          <span className="pc-time">
            {clock(now)} / {clock(duration)}
          </span>
        </div>

        <p className="pc-now" aria-live="polite">
          {span ? `Shot ${span.n} · your change` : 'The version as made'}
        </p>

        {failed ? (
          <p className="pc-help">The shots of this version couldn&rsquo;t be read, so your changes can&rsquo;t be placed.</p>
        ) : !shots ? (
          <p className="pc-help">…</p>
        ) : (
          <>
            <ol className="pc-list" aria-label="The shots you changed">
              {spans.map((s) => {
                const k = shownFor(changes[s.id])?.kind;
                return (
                  <li key={s.id}>
                    <button type="button" className="pc-btn pc-jump" aria-current={s.id === active ? 'true' : undefined} onClick={() => seek(s.from + 0.01, true)}>
                      Shot {s.n} · {clock(s.from)} · {k === 'remix' ? 'Remix frame' : 'layout'}
                    </button>
                  </li>
                );
              })}
            </ol>
            {unknown > 0 && <p className="pc-help">{unknown === 1 ? 'One change is' : `${unknown} changes are`} for shots this version no longer has.</p>}
          </>
        )}
        <p className="pc-help">
          Sound: the version&rsquo;s own mix. Your layouts are kept in this browser only.
        </p>
      </div>
    </div>
  );
}
