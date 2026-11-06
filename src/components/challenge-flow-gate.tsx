'use client';

import { useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';

/**
 * The remix flow's pages while the challenge is admin-only (CHALLENGE.public off; owner, 2026-11-04): everyone gets the
 * site's usual "not found"; a signed-in admin's browser shows the flow in its place, which then asks the flow's APIs
 * (admins only until the owner opens the challenge). No challenge words live here.
 */
export function ChallengeFlowGate({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  const auth = useAuth();
  return <>{auth.kind === 'signed-in' && isAdmin(auth.fid) ? children : fallback}</>;
}
