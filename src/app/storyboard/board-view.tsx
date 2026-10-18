'use client';

import { useEffect, useState } from 'react';
import { StoryboardPlayer } from './player';
import { buildSlides, type BoardData, type BoardItem } from './slides';

/** A saved storyboard, played from the version's committed data and the board's own frames. */
export function BoardView({ dataUrl, items, takes, frames, by, mixUrl, aiLabel }: { dataUrl: string; items: BoardItem[]; takes: Record<string, string>; frames: Record<string, { url: string; hidden: boolean }>; by: string; mixUrl: string | null; aiLabel: string | null }) {
  const [data, setData] = useState<BoardData | null>(null);
  useEffect(() => {
    fetch(dataUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [dataUrl]);
  if (!data) return <p className="label">Loading…</p>;
  return <StoryboardPlayer slides={buildSlides(data, items, takes, frames, by)} mixUrl={mixUrl} aiLabel={aiLabel} />;
}
