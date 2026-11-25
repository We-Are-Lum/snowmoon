'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';

/**
 * Episode 1 while it is off (EPISODE.public; owner, 2026-11-24: "off until then, with its own switch"): everyone gets
 * the site's usual "not found" (`fallback`). A signed-in admin's browser then loads the pages themselves
 * (./challenge-episode-admin-pages.tsx, fetched only for an admin) and draws them, with their data from the
 * admin-only APIs. No Episode 1 words are in this file, which every visitor to a missing address is served.
 */
export type EpisodePage = 'landing' | 'make' | 'outlines' | 'outline';

export function EpisodeAdmin({ fallback, page }: { fallback: React.ReactNode; page: EpisodePage }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [Page, setPage] = useState<React.ComponentType<{ page: EpisodePage }> | null>(null);
  useEffect(() => {
    if (!admin) return;
    void import('./challenge-episode-admin-pages').then((m) => setPage(() => m.EpisodeAdminPage)).catch(() => null);
  }, [admin]);
  if (!admin || !Page) return <>{fallback}</>;
  return <Page page={page} />;
}
