'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Reloads the live link's view every few seconds while the match is on. */
export function Refresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
