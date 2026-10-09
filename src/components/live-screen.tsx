'use client';
/**
 * A live voting screen (src/templates/live.ts): the template's HTML, exactly the source's
 * state, plus after mount a real range input over the drawn track, a note, the slider's
 * reading and a Reset that returns to where the book shows it.
 *
 * Nothing is stored or sent: no storage of any kind, no requests. test:render scans this
 * file and live.ts for both; check:ui moves the slider and resets it in a browser.
 */
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LIVE_WORDING as W, initialValue, liveReducer, sliderFraction, sliderReading, type LiveSlider } from '~/templates/live';

/** "🙁2" shows its 2 raised, as the screen draws it. */
function Reading({ text }: { text: string }) {
  const m = /^(\D+?)(\d+)$/u.exec(text);
  return m ? (
    <>
      {m[1]}
      <sup>{m[2]}</sup>
    </>
  ) : (
    <>{text}</>
  );
}

export function LiveScreen({ html, slider, draftLine }: { html: string; slider: LiveSlider; draftLine: boolean }) {
  const [value, dispatch] = useReducer(liveReducer(slider), slider, initialValue);
  const host = useRef<HTMLDivElement>(null);
  const [track, setTrack] = useState<HTMLElement | null>(null);
  useEffect(() => setTrack(host.current?.querySelector<HTMLElement>('[data-live-track]') ?? null), []);
  // The drawn thumb follows the input.
  useEffect(() => track?.style.setProperty('--f', String(sliderFraction(slider, value))), [track, slider, value]);
  const reading = sliderReading(slider, value);
  // The same object every render: React 19 sets innerHTML again whenever it changes, which would
  // wipe the input mounted inside it.
  const inner = useMemo(() => ({ __html: html }), [html]);
  return (
    <div className="live-screen" data-live={track ? 'on' : 'off'} data-value={value}>
      <div ref={host} dangerouslySetInnerHTML={inner} />
      {track &&
        createPortal(
          <input
            type="range"
            className="live-range"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={value}
            aria-label={slider.name}
            aria-valuetext={reading}
            onChange={(e) => dispatch({ type: 'set', value: Number(e.target.value) })}
          />,
          track,
        )}
      <p className="live-note">
        <span>{W.note}</span>{' '}
        <span className="live-reading" aria-hidden="true">
          {W.reading} <output className="live-value">{<Reading text={reading} />}</output>
        </span>{' '}
        <button type="button" className="live-reset" aria-label={W.resetLabel} onClick={() => dispatch({ type: 'reset' })}>
          {W.reset}
        </button>
        {draftLine && <span className="as-draft live-draft">{W.draftLine}</span>}
      </p>
    </div>
  );
}
