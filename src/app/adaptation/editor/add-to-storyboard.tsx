'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DRAFT_EVENT, addToDraft, readDraft } from './storyboard-draft';

/** "Add to storyboard" (owner, 2026-10-18), under the version's frame of a shot or one of the person's remix frames. */
export function AddToStoryboard({ adaptation, version, shot, seconds, frame, boardPath, label = 'Add to storyboard' }: { adaptation: number; version: number; shot: string; seconds: number; frame: { id: string; url: string } | null; boardPath: string; label?: string }) {
  const [n, setN] = useState(0);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    const read = () => setN(readDraft(adaptation, version).items.length);
    read();
    window.addEventListener(DRAFT_EVENT, read);
    return () => window.removeEventListener(DRAFT_EVENT, read);
  }, [adaptation, version]);
  return (
    <div className="sb-add">
      <button
        type="button"
        className="ed-small"
        onClick={() => {
          addToDraft(adaptation, version, { shot, frame, seconds: Math.min(20, Math.max(0.5, Math.round(seconds * 10) / 10)) });
          setAdded(true);
        }}
      >
        {label}
      </button>
      {n > 0 && (
        <span className="ed-help" aria-live="polite">
          {added ? 'Added. ' : ''}
          <Link href={boardPath}>Your storyboard · {n}</Link>
        </span>
      )}
    </div>
  );
}
