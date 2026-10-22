'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth, useWalletSession } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { TellAgent, sendRequest } from './tell-agent';
import './agents.css';

/**
 * Pause and note (owner, 2026-10-22: "watch the video on the website, and pause at any point and log notes
 * for themselves that their AI can then read, interpret, and take action on"). Under the scene's video, for
 * the invited people: "Note at m:ss" pauses the film and opens a short box, typed or spoken. The note goes to
 * the person's agent as a request at that moment (the server finds the shot from the time). Private to the
 * person; their agent acts on their own version, never this one.
 */
const F = AGENT_WORDING.film;
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
type Shot = { id: string; n: number; from: number; to: number; lines?: { at?: number; speaker?: string | null; text?: string | null }[] };

export function FilmNote({ videoId, adaptation, version, dataUrl }: { videoId: string; adaptation: number; version: number; dataUrl: string }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  // Shown only to the people agents are open to (the invited people): /api/agents answers 404 to everyone else.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (signedIn) void authFetch('/api/agents').then((r) => setOpen(r.ok)).catch(() => setOpen(false));
  }, [signedIn]);
  const [now, setNow] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  const [shots, setShots] = useState<Shot[] | null>(null);
  useEffect(() => {
    if (!open) return;
    const v = document.getElementById(videoId) as HTMLVideoElement | null;
    if (!v) return;
    const tick = () => setNow(v.currentTime);
    v.addEventListener('timeupdate', tick);
    v.addEventListener('seeked', tick);
    return () => {
      v.removeEventListener('timeupdate', tick);
      v.removeEventListener('seeked', tick);
    };
  }, [open, videoId]);
  if (!signedIn || !open) return null;

  const pause = () => {
    const v = document.getElementById(videoId) as HTMLVideoElement | null;
    v?.pause();
    setAt(v ? v.currentTime : now);
    if (!shots) void fetch(dataUrl).then((r) => (r.ok ? r.json() : null)).then((d: { shots?: Shot[] } | null) => setShots(d?.shots ?? []), () => setShots([]));
  };
  const shot = at === null || !shots ? null : (shots.find((s) => at >= s.from && at < s.to) ?? null);
  const said = shot?.lines?.filter((l) => typeof l.at === 'number' && l.at <= (at ?? 0) + 0.5).pop();

  return (
    <div className="film-note">
      {at === null ? (
        <button type="button" className="scene-small film-note-btn" onClick={pause}>{F.noteAt(clock(now))}</button>
      ) : (
        <div className="film-note-box" role="group" aria-label={F.label(clock(at))}>
          <p className="you-note">
            {shot ? `${F.shotThere(shot.id)} · ` : ''}{clock(at)}
          </p>
          {said?.text && (
            <p className="film-note-line"><span className="you-note">{F.lineThere}</span> {said.speaker ? `${said.speaker}: ` : ''}{said.text}</p>
          )}
          <TellAgent id={`film-note-${version}`} label={F.label(clock(at))} compact whenNote={F.private} send={(words, spoken) => sendRequest({ kind: 'note', words, spoken, film: { adaptation, version, seconds: Math.round(at * 100) / 100 } })} />
          <button type="button" className="ic-secondary film-note-close" onClick={() => setAt(null)}>{F.close}</button>
        </div>
      )}
    </div>
  );
}
