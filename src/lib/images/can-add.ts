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

/**
 * Making a style or a character sheet (new, fork, new version, samples and views): invited FIDs
 * only, for now (owner, 2026-10-10: "Invited only, for now"). Browsing, picking and using picks in
 * the composer are for everyone signed in. The server refuses others (/api/designs, /api/designs/sample).
 */
export function useCanMakeDesigns(): boolean {
  const auth = useAuth();
  return IMAGES.enabled && auth.kind === 'signed-in' && IMAGES.invited.includes(auth.fid);
}
