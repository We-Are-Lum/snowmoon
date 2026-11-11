'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import type { ChallengeView, CharacterView } from '~/lib/challenge/view';
import type { RulesView } from '~/lib/challenge/rules-view';
import type { RemixesView } from '~/lib/challenge/remixes-view';
import { ChallengeBody } from './challenge-body';
import { ChallengeCharacterBody } from './challenge-character';
import { ChallengeRulesBody } from './challenge-rules-body';
import { ChallengeRemixesBody } from './challenge-remixes-body';

/**
 * The admins' /challenge, /challenge/rules, /challenge/remixes and a character's page (/challenge/<slug>) while the challenge is admin-only (CHALLENGE.public
 * off; owner, 2026-11-04: admins see the rules and the feed too, exactly like /challenge). Everyone else, and everyone
 * until their sign-in is known, sees `fallback` (the site's usual "not found"). A signed-in admin's browser asks
 * GET /api/challenge/view (with ?page= and the feed's own ?character= and ?before=), which answers admins only (404 to
 * everyone else), and draws what it returns. No challenge words live in this file: they all come from that answer.
 */
type Page = 'challenge' | 'rules' | 'remixes' | 'character';
type View = { page: 'challenge'; v: ChallengeView } | { page: 'rules'; v: RulesView } | { page: 'remixes'; v: RemixesView } | { page: 'character'; v: CharacterView };

export function ChallengeAdmin({ fallback, page = 'challenge' }: { fallback: React.ReactNode; page?: Page }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [view, setView] = useState<View | null>(null);
  useEffect(() => {
    if (!admin) return;
    const q = new URLSearchParams(page === 'remixes' ? window.location.search : '');
    const keep = new URLSearchParams();
    for (const k of ['character', 'before']) if (q.get(k)) keep.set(k, q.get(k)!);
    // A character's page: its slug is the address's last part (/challenge/<slug>).
    if (page === 'character') keep.set('character', window.location.pathname.split('/').filter(Boolean)[1] ?? '');
    if (page !== 'challenge') keep.set('page', page);
    const s = keep.toString();
    void authFetch(`/api/challenge/view${s ? `?${s}` : ''}`)
      .then(async (r) => (r.ok ? ({ page, v: await r.json() } as View) : null))
      .then(setView)
      .catch(() => setView(null));
  }, [admin, page]);
  if (!admin || !view) return <>{fallback}</>;
  if (view.page === 'rules') return <ChallengeRulesBody v={view.v} />;
  if (view.page === 'remixes') return <ChallengeRemixesBody v={view.v} />;
  if (view.page === 'character') return <ChallengeCharacterBody v={view.v} />;
  return <ChallengeBody v={view.v} />;
}
