'use client';

import { useEffect, useState } from 'react';
import { ALLOWANCE_WORDING } from '~/lib/voice/allowance-wording';
import { withReset } from '~/lib/challenge/model-wording';

export interface Allowance {
  left: number;
  perDay: number;
  poolUsedUp: boolean;
  /** 00:00 UTC, as an instant; written here in the person's own time. */
  resetAt: string;
}

/**
 * The storyboard allowance on the board and guide pages (Nate, 2026-11-23): the count left, or the line that says it
 * ran out and when it comes back. The time is written after the page has loaded, in the person's own time zone, so the
 * server never renders a local time. Nothing for admins (their own pool) or while it doesn't apply (allowance null).
 */
export function VoiceAllowance({ allowance }: { allowance: Allowance | null }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (!allowance) return setLine(null);
    if (allowance.poolUsedUp) return setLine(withReset(ALLOWANCE_WORDING.pool, allowance.resetAt));
    if (allowance.left <= 0) return setLine(withReset(ALLOWANCE_WORDING.limit, allowance.resetAt));
    setLine(ALLOWANCE_WORDING.left(allowance.left));
  }, [allowance]);
  if (!allowance || !line) return null;
  const out = allowance.poolUsedUp || allowance.left <= 0;
  return (
    <p className={out ? 'vr-warn vr-allowance' : 'vr-small vr-allowance'} data-slot="storyboard-allowance" {...(out ? { role: 'status' } : {})}>
      {line}
    </p>
  );
}

/** After a picture's answer: the allowance as it now stands (the count from the answer, or what its refusal says). */
export function nextAllowance(a: Allowance | null, j: { left?: unknown; reason?: unknown }): Allowance | null {
  if (!a) return a;
  if (j.reason === 'storyboard-limit') return { ...a, left: 0 };
  if (j.reason === 'storyboard-spend') return { ...a, poolUsedUp: true };
  return typeof j.left === 'number' ? { ...a, left: j.left } : a;
}
