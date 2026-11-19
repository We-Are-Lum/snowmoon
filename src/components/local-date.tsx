'use client';

import { useEffect, useState } from 'react';
import { day, localDay } from '~/lib/chapter-pictures/shared';

/**
 * A date in the reader's own time (owner, 2026-11-18: "caption and recipe dates in the reader's own time, not UTC").
 * The server, and the browser's first render, write it in UTC (day()), so the page as served and the first render
 * match and nothing hydrates wrongly; after it mounts, the browser writes it in its own time zone (localDay()), as the
 * challenge writes its reset time (resetLocal). The exact instant is in dateTime.
 */
export function LocalDate({ iso }: { iso: string }) {
  const [text, setText] = useState(() => day(iso));
  useEffect(() => setText(localDay(iso)), [iso]);
  return (
    <time dateTime={iso} data-local-date="">
      {text}
    </time>
  );
}
