'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HOME_TEXT as H } from '~/lib/home';
import type { Intro } from '~/lib/intro';
import { lastChapter } from '~/lib/chat/device';
import { ReplayIntro } from './first-visit';

/**
 * The hero's buttons. A newcomer: Start chapter 1 and How this works (the first-visit intro, opened
 * again). A returning reader, as in Design, sees only Continue (a chapter opened on this device, from the reading record the rail and the
 * assistant already keep; nothing new is stored): Continue · Chapter n, the chapter opened last.
 */
/**
 * Whether a chapter has been opened on this device: the reading record's keys (src/lib/chat/device.ts,
 * recordChapterOpened), read only. Read here rather than added to device.ts, which is part of the chat's
 * fingerprint for the assistant notice (P6e).
 */
function hasReadingRecord(): boolean {
  try {
    return localStorage.getItem('snowmoon.last-chapter') !== null || localStorage.getItem('snowmoon.opened') !== null || Number(localStorage.getItem('snowmoon.read-to')) > 1;
  } catch {
    return false;
  }
}

export function HomeStart({ intro }: { intro: Intro }) {
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    if (hasReadingRecord()) setLast(lastChapter());
  }, []);
  return (
    <div className="home-hero-actions">
      {last !== null ? (
        <Link href={`/chapter/${last}`} className="home-btn home-btn-light">
          {H.continue(last)}
        </Link>
      ) : (
        <>
          <Link href="/chapter/1" className="home-btn home-btn-light">
            {H.start}
          </Link>
          <ReplayIntro intro={intro} label={H.how} className="home-btn home-btn-night home-how" />
        </>
      )}
    </div>
  );
}
