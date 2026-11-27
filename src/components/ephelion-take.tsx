'use client';
import { useEffect, useRef, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { joinAudio } from '~/lib/voice/join-audio';
import { TAKES_WORDING as W } from '~/lib/voice/takes-wording';

/**
 * The take page's player and actions (PR 6, 2026-11-26): the converted speech, its redone sentences joined in the browser
 * as the recorder joins them, playing over the take's picture; Share (the device's share sheet, or the link copied);
 * for its performer, Take it down (asked first in the page).
 */
export function TakePlayer({ picture, audio, alt }: { picture: string | null; audio: { url: string; part: string; replaces: [number, number] | null }[]; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    void (async () => {
      const main = audio.find((a) => a.part === 'take') ?? audio[0];
      const redos = audio.filter((a) => a.part === 'redo' && a.replaces);
      if (!main) return;
      if (!redos.length) return setSrc(main.url);
      const blob = async (u: string) => (await fetch(u)).blob();
      url = await joinAudio(await blob(main.url), await Promise.all(redos.map(async (r) => ({ blob: await blob(r.url), start: r.replaces![0], end: r.replaces![1] }))));
      setSrc(url);
    })().catch(() => setSrc(audio[0]?.url ?? null));
    return () => void (url && URL.revokeObjectURL(url));
  }, [audio]);
  return (
    <div className="eph-take-stage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {picture ? <img src={picture} alt={alt} /> : null}
      <span className="eph-ai">AI</span>
      {src ? <audio controls src={src} className="eph-take-audio" /> : null}
    </div>
  );
}

export function TakeActions({ id, title }: { id: string; title: string }) {
  const auth = useAuth();
  const [mine, setMine] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (auth.kind !== 'signed-in') return;
    void authFetch(`/api/voice/publications/${id}/report`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { mine: false }))
      .then((j: { mine?: boolean }) => setMine(Boolean(j.mine)), () => setMine(false));
  }, [auth.kind, id]);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) return void (await navigator.share({ title, url }));
      await navigator.clipboard.writeText(url);
      setNote('Link copied.');
    } catch {
      /* the share sheet was closed */
    }
  };
  return (
    <>
      <button type="button" className="eph-btn eph-btn-quiet" onClick={() => void share()}>{W.share}</button>
      {mine && !asking && <button type="button" className="eph-btn eph-btn-quiet" onClick={() => setAsking(true)}>{W.takeDown}</button>}
      {mine && asking && (
        <span className="eph-take-ask">
          {W.takeDownAsk}{' '}
          <button
            type="button"
            className="eph-btn eph-btn-small"
            onClick={async () => {
              if (done.current) return;
              done.current = true;
              const r = await authFetch(`/api/voice/takes/${id}`, { method: 'DELETE' }).catch(() => null);
              if (r?.ok) window.location.href = '/ephelion';
              else {
                done.current = false;
                setNote(W.notEntered);
              }
            }}
          >
            {W.takeDown}
          </button>{' '}
          <button type="button" className="eph-btn eph-btn-quiet eph-btn-small" onClick={() => setAsking(false)}>{W.replaceNo}</button>
        </span>
      )}
      {note && <span className="eph-meta">{note}</span>}
    </>
  );
}
