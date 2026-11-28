/**
 * "Enter it" on /challenge/entries' "Published, not entered yet" (2026-11-27): who sees it is decided in the viewer's
 * own browser, never on the server, so the page everyone is served (and any cached copy of it) holds no viewer's
 * button. A picture's maker sees it: a Farcaster account by the FID of its session on this device, a Lens or Bluesky
 * account by the person number the signed-in GET /api/challenge/submit answers it with (as Submit itself decides,
 * src/components/challenge-submit.tsx). Signed out, or anyone else: nothing. Pure, so scripts/test-challenge.ts proves it.
 */
export type Viewer = { fid: number | null; person: number | null };

export function enterItShown(viewer: Viewer, maker: number): boolean {
  if (!Number.isSafeInteger(maker) || maker === 0) return false;
  return (viewer.fid !== null && viewer.fid === maker) || (viewer.person !== null && viewer.person === maker);
}

/** Where "Enter it" goes: the picture's own page, at its Submit section. */
export const enterItHref = (versionId: string) => `/challenge/p/${versionId}#submit`;
