import NotFound from 'next/dist/client/components/builtin/not-found';
import { ChallengeAdmin } from '~/components/challenge-admin';

/**
 * /challenge/rules while the challenge is admin-only (CHALLENGE.public off; owner, 2026-11-04: admins see it too,
 * exactly like /challenge). Served to everyone as the site's usual "not found" (status 404, nothing of the challenge in
 * it). In the browser, a signed-in admin's page then asks GET /api/challenge/view?page=rules (admins only) and shows
 * the page in its place.
 */
export default function ChallengeRulesNotFound() {
  return <ChallengeAdmin fallback={<NotFound />} page="rules" />;
}
