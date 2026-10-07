'use client';

import { useEffect } from 'react';
import { recordChapterOpened } from '~/lib/chat/device';

/** Remembers, on this device only, the furthest chapter opened: the assistant's default spoiler limit. */
export function ReadingRecord({ chapter }: { chapter: number }) {
  useEffect(() => {
    recordChapterOpened(chapter);
  }, [chapter]);
  return null;
}
