'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { joinAudio } from '~/lib/voice/join-audio';
import { saveVideo, videoType } from '~/lib/voice/video';
import type { CreditLine } from '~/lib/voice/closing';
import '../styles/voice.css';

/**
 * A published spoken storyboard (slice 4, DRAFT): the kept pictures over the performance, then the closing card; the
 * credits as text; the full recipe behind "Recipe"; and "Save as a video" (made on this device: pictures stitched to
 * the audio, no AI video). Used by /storyboard/spoken/<id> and, before publishing, by the draft's own board.
 */
export interface SpokenFile { role: string; url: string; sha256: string; n?: number; part?: string; replaces?: [number, number] | null; shotKey?: string; start?: number; end?: number; seconds?: number }
export interface SpokenProps {
  title: string;
  seconds: number;
  shots: { n: number; key: string; start: number; end: number; words: string }[];
  files: SpokenFile[];
  credits: CreditLine[];
  recipe: Record<string, unknown> | null;
  standIns: boolean;
  closingSeconds: number;
  fileName: string;
}

export function VoiceSpoken(p: SpokenProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [video, setVideo] = useState<{ url: string; ext: string } | null>(null);
  const stop = useRef<AbortController | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const [ended, setEnded] = useState(false);
  const pictureFor = useMemo(() => new Map(p.files.filter((f) => f.role === 'shot').map((f) => [f.shotKey!, f.url])), [p.files]);
  const closing = p.files.find((f) => f.role === 'closing')?.url ?? null;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const audio = p.files.filter((f) => f.role === 'audio').sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
      const get = async (u: string) => {
        const r = await fetch(u).catch(() => null);
        return r?.ok ? r.blob() : null;
      };
      const main = audio[0] ? await get(audio[0].url) : null;
      if (!main) return alive && setMessage('The audio could not be loaded.');
      const redos = [];
      for (const a of audio.slice(1)) {
        const b = await get(a.url);
        if (b && a.replaces) redos.push({ blob: b, start: a.replaces[0], end: a.replaces[1] });
      }
      const url = redos.length ? await joinAudio(main, redos).catch(() => URL.createObjectURL(main)) : URL.createObjectURL(main);
      if (alive) setAudioUrl(url);
    })();
    return () => {
      alive = false;
    };
  }, [p.files]);

  const playing = p.shots.find((s) => now >= s.start && now < s.end) ?? p.shots[p.shots.length - 1] ?? null;
  const label = `snowmoon.party · ${p.standIns ? 'stand-in cards' : 'AI pictures'} · AI voice conversion`;

  async function save() {
    if (!audioUrl || !closing) return;
    setMessage(null);
    setVideo(null);
    stop.current = new AbortController();
    setSaving(0);
    try {
      const out = await saveVideo({
        audio: audioUrl,
        seconds: p.seconds,
        shots: p.shots.map((s) => ({ start: s.start, end: s.end, image: pictureFor.get(s.key) ?? null, words: s.words })),
        closing,
        closingSeconds: p.closingSeconds,
        label,
        onProgress: setSaving,
        signal: stop.current.signal,
      });
      const url = URL.createObjectURL(out.blob);
      setVideo({ url, ext: out.ext });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.fileName}.${out.ext}`;
      a.click();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The video could not be made.');
    } finally {
      setSaving(null);
      stop.current = null;
    }
  }

  return (
    <>
      <section className="vr-card" aria-labelledby="vs-play-h">
        <h2 id="vs-play-h">Play</h2>
        <div className="vb-screen">
          {ended && closing ? (
            <img src={closing} alt="The closing card" className="vb-picture" />
          ) : playing && pictureFor.get(playing.key) ? (
            <img src={pictureFor.get(playing.key)} alt={`Shot ${playing.n}`} className="vb-picture" />
          ) : (
            <div className="vb-picture vb-empty">{playing ? playing.words : 'Press play.'}</div>
          )}
          {!ended && playing && <span className="vb-shotno">Shot {playing.n}</span>}
        </div>
        {audioUrl ? (
          <audio
            ref={audioEl}
            controls
            src={audioUrl}
            className="vr-audio"
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            onPlay={() => setEnded(false)}
            onEnded={() => setEnded(true)}
          />
        ) : (
          <p className="vr-small">Loading the audio…</p>
        )}
        <div className="vr-row">
          {saving === null ? (
            <button type="button" className="vr-btn" onClick={save} disabled={!audioUrl || !closing || !videoType()}>
              Save as a video
            </button>
          ) : (
            <>
              <span className="vr-small" role="status">Making the video on this device… {Math.round(saving * 100)}%</span>
              <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => stop.current?.abort()}>Cancel</button>
            </>
          )}
          {video && <a className="vr-small" href={video.url} download={`${p.fileName}.${video.ext}`}>Download it again ({video.ext.toUpperCase()})</a>}
        </div>
        <p className="vr-small">
          The pictures held for each shot over the performance, then the closing card: stitched in this browser, in real time (as long as the speech), and saved on this device. No AI video.
          {!videoType() && ' This browser can’t record a video.'}
        </p>
        {message && <p className="vr-warn" role="alert">{message}</p>}
      </section>

      <section className="vr-card" aria-labelledby="vs-credits-h">
        <h2 id="vs-credits-h">Credits</h2>
        <ul className="vs-credits">
          {p.credits.map((c, i) => (
            <li key={i}>
              {c.who !== 'site' && <span className={`vr-tag vs-${c.who}`}>{c.who === 'ai' ? 'AI' : c.who === 'book' ? 'Book' : c.who === 'invented' ? 'Invented' : 'People'}</span>} {c.text}
            </li>
          ))}
        </ul>
        {p.recipe && (
          <details>
            <summary>Recipe</summary>
            <pre className="vs-recipe">{JSON.stringify(p.recipe, null, 2)}</pre>
          </details>
        )}
      </section>
    </>
  );
}
