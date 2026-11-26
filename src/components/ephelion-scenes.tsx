'use client';
import { useEffect, useRef, useState } from 'react';
import { SCENES, SCENE_KEY, sceneById, type Scene } from '~/lib/voice/scenes';
import { RECORDER as W } from '~/lib/voice/recorder-wording';
import { mmss } from '~/components/voice-recorder-core';

/**
 * "Choose his scene" and the preview on the recorder's Listen step (Nate, 2026-11-26; plan v3, PR 3; his PhoneFlow and
 * Recorder files). Three ready-made scenes only, each a marked placeholder until the images session's set is approved
 * (src/lib/voice/scenes.ts). The choice is a setting kept on this device (localStorage), for every speech; nothing is
 * sent or stored anywhere else.
 */
export function useScene(): [Scene, (id: Scene['id']) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(localStorage.getItem(SCENE_KEY));
    } catch {
      /* storage blocked: the first scene */
    }
  }, []);
  const pick = (next: Scene['id']) => {
    setId(next);
    try {
      localStorage.setItem(SCENE_KEY, next);
    } catch {
      /* storage blocked: kept for this tab */
    }
  };
  return [sceneById(id), pick];
}

/** A scene's picture, or its placeholder: a dark tile that says so. */
function ScenePicture({ scene, big = false }: { scene: Scene; big?: boolean }) {
  if (scene.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="es-pic" src={scene.picture.src} alt={scene.picture.alt} />;
  }
  return (
    <span className={big ? 'es-pic es-placeholder es-big' : 'es-pic es-placeholder'} data-placeholder="true" role="img" aria-label={W.scenePlaceholderAlt(scene.title)}>
      <span className="es-placeholder-text">{big ? W.scenePlaceholderBig(scene.title) : W.scenePlaceholder}</span>
    </span>
  );
}

export function ScenePicker({ scene, onPick, cols }: { scene: Scene; onPick: (id: Scene['id']) => void; cols: 2 | 3 }) {
  return (
    <div className="es-choose" data-slot="scenes">
      <p className="er-kicker">{W.chooseScene}</p>
      <div className={`es-grid es-cols-${cols}`} role="radiogroup" aria-label={W.chooseScene}>
        {SCENES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={s.id === scene.id} className={s.id === scene.id ? 'es-card es-on' : 'es-card'} data-scene={s.id} onClick={() => onPick(s.id)}>
            <ScenePicture scene={s} />
            <span className="es-name">{s.title}</span>
          </button>
        ))}
        {/* "Describe your own" (the one free picture) and paying for more go here once Nate turns them on; off for now. */}
      </div>
    </div>
  );
}

/** Lord Ephelion in the chosen scene, with the converted take playing over it; before converting, the line that says how. */
export function ScenePreview({ scene, url }: { scene: Scene; url: string | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  useEffect(() => {
    setPlaying(false);
    setT(0);
  }, [url]);
  return (
    <div className="es-preview" data-slot="preview">
      <div className="es-stage">
        <ScenePicture scene={scene} big />
        {url && (
          <div className="es-player">
            <button type="button" className="es-playbtn" aria-label={playing ? W.pause : W.play} onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}>
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
              )}
            </button>
            <span className="es-bar" aria-hidden="true">
              <span className="es-bar-fill" style={{ width: len ? `${Math.min(100, (t / len) * 100)}%` : '0%' }} />
            </span>
            <span className="es-time">{`${mmss(t)} / ${mmss(len)}`}</span>
            <audio
              ref={audio}
              src={url}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setLen(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
              hidden
            />
          </div>
        )}
      </div>
      <p className="er-note">{url ? W.previewLine : W.previewBefore}</p>
    </div>
  );
}
