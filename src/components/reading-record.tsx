'use client';

import { useEffect } from 'react';
import { recordChapterOpened } from '~/lib/chat/device';

/** Remembers, on this device only, the chapters opened (and the last one, the assistant's hint for "where was I"). */
export function ReadingRecord({ chapter }: { chapter: number }) {
  useEffect(() => {
    recordChapterOpened(chapter);
  }, [chapter]);
  return null;
}
