'use client';

import { useState } from 'react';

/**
 * Remove, asked in the page (Nate, 2026-11-23: no window.confirm, which a miniapp's webview may not show): the button,
 * then the question with "Remove it" and "Keep it". Used for removing one's own storyboard and a draft.
 */
export function VoiceRemove({ label, question, disabled, busy, onRemove, className = 'vr-btn vr-quiet vr-small-btn' }: { label: string; question: string; disabled?: boolean; busy?: boolean; onRemove: () => void | Promise<unknown>; className?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className={className} disabled={disabled || busy} onClick={() => setAsking(true)}>
        {busy ? 'Removing…' : label}
      </button>
    );
  return (
    <span className="vr-confirm" role="group" aria-label={question}>
      <span className="vr-confirm-q">{question}</span>{' '}
      <button
        type="button"
        className="vr-btn vr-small-btn vr-remove-yes"
        disabled={busy || disabled}
        onClick={async () => {
          await onRemove();
          setAsking(false);
        }}
      >
        Remove it
      </button>{' '}
      <button type="button" className="vr-btn vr-quiet vr-small-btn" disabled={busy || disabled} onClick={() => setAsking(false)} autoFocus>
        Keep it
      </button>
    </span>
  );
}
