import NotFound from 'next/dist/client/components/builtin/not-found';

/**
 * While the challenge is admin-only (CHALLENGE.public off; owner, 2026-11-04), this page answers the site's usual
 * "not found" to everyone, admins included, with nothing of the challenge in it. (Without this file, /challenge's own
 * not-found, which shows admins the landing, would answer here.) Admins see the landing at /challenge.
 */
export default function ChallengeSubpageNotFound() {
  return <NotFound />;
}
