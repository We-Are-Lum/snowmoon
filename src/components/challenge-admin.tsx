'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import type { ChallengeView } from '~/lib/challenge/view';
import { ChallengeBody } from './challenge-body';

/**
 * The admins' /challenge while it is admin-only (CHALLENGE.public off; owner, 2026-11-04). Everyone else, and everyone
 * until their sign-in is known, sees `fallback` (the site's usual "not found"). A signed-in admin's browser asks
 * GET /api/challenge/view, which answers admins only (404 to everyone else), and draws what it returns. No challenge
 * words live in this file: they all come from that answer.
 */
export function ChallengeAdmin({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [view, setView] = useState<ChallengeView | null>(null);
  useEffect(() => {
    if (!admin) return;
    void authFetch('/api/challenge/view')
      .then(async (r) => (r.ok ? ((await r.json()) as ChallengeView) : null))
      .then(setView)
      .catch(() => setView(null));
  }, [admin]);
  return admin && view ? <ChallengeBody v={view} /> : <>{fallback}</>;
}
