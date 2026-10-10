'use client';

import { useAuth } from '../client-auth';
import { IMAGES } from '../config';

/**
 * "Add an image" (the selection action, the scene links, the player link) shows to every
 * signed-in reader while image making is on (owner, 2026-10-09). Everyone sees the feed and the
 * images. Who may actually generate (a Neynar score of at least IMAGES.neynarMinScore, or an
 * invited FID) is decided by the server at Generate, and the composer shows its answer.
 */
export function useCanAddImage(): boolean {
  const auth = useAuth();
  return IMAGES.enabled && auth.kind === 'signed-in';
}
