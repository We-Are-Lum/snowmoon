import NotFound from 'next/dist/client/components/builtin/not-found';
import { ChallengeAdmin } from '~/components/challenge-admin';

/**
 * /challenge/<slug> while the challenge is admin-only (CHALLENGE.public off): the site's usual "not found" to everyone;
 * a signed-in admin's page then asks GET /api/challenge/view?page=character&character=<slug> (admins only) and shows
 * the character's page in its place, exactly like /challenge.
 */
export default function ChallengeCharacterNotFound() {
  return <ChallengeAdmin fallback={<NotFound />} page="character" />;
}
