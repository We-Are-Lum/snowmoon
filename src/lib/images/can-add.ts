'use client';

import { useAuth } from '../client-auth';
import { IMAGES } from '../config';

/**
 * During the trial, "Add an image" (the selection action, the scene links, the player link) shows
 * only to a signed-in, invited FID (owner, 2026-10-08). Everyone sees the feed and the images.
 * The server checks the same list on every Generate; this only decides what is shown.
 */
export function useCanAddImage(): boolean {
  const auth = useAuth();
  return IMAGES.enabled && auth.kind === 'signed-in' && IMAGES.invited.includes(auth.fid);
}
