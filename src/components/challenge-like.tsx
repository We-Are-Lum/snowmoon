import { likesOn } from '~/lib/challenge/landing';

/**
 * The like slot on a remix page (owner, 2026-11-04). Likes are planned for 12 November and don't exist yet: while
 * CHALLENGE.likes is off (it is), this renders nothing at all, no button, no count and no request. The slot keeps
 * the landing's layout ready for them.
 */
export function ChallengeLike(_: { versionId: string }) {
  if (!likesOn()) return null;
  // Not built: likes come with their own storage, Privacy line and the owner's reread (planned 12 November).
  return null;
}
