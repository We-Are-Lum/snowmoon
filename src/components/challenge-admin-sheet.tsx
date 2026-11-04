'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import type { SheetChallenge } from '~/lib/challenge/sheet-lines';
import { ChallengeLines, ChallengePosts } from './challenge-lines';

/**
 * A sheet page's remix-challenge lines for admins while the challenge is admin-only (CHALLENGE.public off; owner,
 * 2026-11-04). Nothing for anyone else: the page as served holds none of it. A signed-in admin's browser asks
 * GET /api/challenge/standing (admins only) and draws its answer, as if the challenge were open, so admins can test
 * marking. `part` picks the lines (under the title) or "Posted on" (under the share buttons).
 */
export function ChallengeAdminSheet({ versionId, byFid, part }: { versionId: string; byFid: number; part: 'lines' | 'posts' }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [c, setC] = useState<SheetChallenge | null>(null);
  useEffect(() => {
    if (!admin) return;
    void authFetch(`/api/challenge/standing?versionId=${versionId}`)
      .then(async (r) => (r.ok ? ((await r.json()) as SheetChallenge) : null))
      .then(setC)
      .catch(() => setC(null));
  }, [admin, versionId]);
  if (!admin || !c) return null;
  return part === 'lines' ? <ChallengeLines c={c} versionId={versionId} byFid={byFid} /> : <ChallengePosts c={c} versionId={versionId} />;
}
