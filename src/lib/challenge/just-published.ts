/**
 * "Just published" on a challenge picture's page (owner, 2026-11-16): publishing (src/components/challenge-preview.tsx)
 * replaces the preview with the picture's page plus this one-time query parameter, so the page starts with its share
 * list open; the page then strips it from the address (history.replaceState), so a reload, a shared link or going back
 * to it later starts with the list closed. No cookie or storage: the address itself is the signal, and only once.
 * Client-safe (no words, no server code).
 */
export const JUST_PUBLISHED_PARAM = 'published';

/** The address publishing goes to: the picture's page, marked as just published. */
export const justPublishedHref = (versionId: string) => `/challenge/p/${versionId}?${JUST_PUBLISHED_PARAM}=1`;

/**
 * Whether `search` (window.location.search) marks the page as just published, and the same search without the mark
 * (any other parameters kept, in their order).
 */
export function readJustPublished(search: string): { just: boolean; rest: string } {
  const q = new URLSearchParams(search);
  const just = q.has(JUST_PUBLISHED_PARAM);
  q.delete(JUST_PUBLISHED_PARAM);
  const rest = q.toString();
  return { just, rest: rest ? `?${rest}` : '' };
}
