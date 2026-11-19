'use client';

import { useEffect, useState } from 'react';
import { countdown, countdownText } from '~/lib/editions/ladder';

/** Time left until `target` (unix seconds), ticking each second. The exact time is in the tooltip and for readers. */
export function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const when = new Date(target * 1000);
  return (
    <time dateTime={when.toISOString()} title={when.toLocaleString()} data-countdown={target}>
      {now === null ? when.toLocaleDateString() : countdownText(countdown(target, now))}
    </time>
  );
}
