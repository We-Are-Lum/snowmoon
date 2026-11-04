import NotFound from 'next/dist/client/components/builtin/not-found';
import { ChallengeAdmin } from '~/components/challenge-admin';

/**
 * /challenge while it is admin-only (CHALLENGE.public off; owner, 2026-11-04). Served to everyone as the site's usual
 * "not found" (status 404, the same page as any missing address, with nothing of the challenge in it). In the browser,
 * a signed-in admin's page then asks GET /api/challenge/view (admins only) and shows the challenge in its place.
 */
export default function ChallengeNotFound() {
  return <ChallengeAdmin fallback={<NotFound />} />;
}
