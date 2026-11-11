import NotFound from 'next/dist/client/components/builtin/not-found';
import { ChallengeAdmin } from '~/components/challenge-admin';

/**
 * /challenge/remixes while the challenge is admin-only (CHALLENGE.public off; owner, 2026-11-04: admins see it too,
 * exactly like /challenge). Served to everyone as the site's usual "not found" (status 404, nothing of the challenge in
 * it). In the browser, a signed-in admin's page then asks GET /api/challenge/view?page=remixes (admins only) and shows
 * the page in its place.
 */
export default function ChallengeRemixesNotFound() {
  return <ChallengeAdmin fallback={<NotFound />} page="remixes" />;
}
