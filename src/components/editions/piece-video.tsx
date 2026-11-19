'use client';

import { useRef, useState } from 'react';
import { EW } from '~/lib/editions/wording';

/** The piece as a video: the first frame with the mockups' round play button; once played, the video's own controls. */
export function PieceVideo({ src, alt, ratio }: { src: string; alt: string; ratio: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <span className="ed-video" style={{ aspectRatio: ratio }}>
      <video ref={ref} className="ed-media" src={`${src}#t=0.5`} playsInline preload="metadata" controls={playing} aria-label={alt} />
      {!playing && (
        <button
          type="button"
          className="ed-play"
          aria-label={EW.play}
          onClick={() => {
            setPlaying(true);
            void ref.current?.play().catch(() => {});
          }}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M7 4l13 8-13 8z" />
          </svg>
        </button>
      )}
    </span>
  );
}
