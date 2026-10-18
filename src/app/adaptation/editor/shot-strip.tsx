'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Every shot of the version, under the scene's player, each linking to the live editor
 * (/@<fname>/<id>/shot/<shot>). Read from the version's editor data; shows nothing when a version has none.
 */
type Strip = { id: string; n: number; from: number; thumb: string | null; setup: string | null; variant: string | null; made: string | null; lines: { speaker: string | null; text: string | null }[] };

export function ShotStrip({ dataUrl, scenePath, heading = 'Every shot \u00b7 open one in the live editor' }: { dataUrl: string; scenePath: string; heading?: string }) {
  const [shots, setShots] = useState<Strip[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(dataUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setShots(d?.shots ?? []))
      .catch(() => alive && setShots([]));
    return () => {
      alive = false;
    };
  }, [dataUrl]);
  if (!shots?.length) return null;
  const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <section className="scene-shots" aria-label="Every shot">
      <h2 className="label">{heading}</h2>
      <ol className="scene-shot-list">
        {shots.map((s) => (
          <li key={s.id}>
            <Link href={`${scenePath}/shot/${s.id}`} className="scene-shot">
              {s.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumb} alt="" width={320} height={180} loading="lazy" />
              ) : (
                <span className="scene-shot-made" aria-hidden="true" />
              )}
              <span className="scene-shot-cap">
                <span className="label">
                  {s.n} · {t(s.from)}
                </span>
                <span className="scene-shot-what">{s.lines[0]?.text ? `${s.lines[0].speaker}: ${s.lines[0].text}` : [s.setup, s.variant].filter(Boolean).join(' · ') || s.made}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
