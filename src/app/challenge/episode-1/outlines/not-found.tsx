import NotFound from 'next/dist/client/components/builtin/not-found';
import { EpisodeAdmin } from '~/components/challenge-episode-admin';

/** Episode 1 while it is off: the site's usual "not found", and, for a signed-in admin, the page itself (src/components/challenge-episode-admin.tsx). */
export default function EpisodeNotFound() {
  return <EpisodeAdmin fallback={<NotFound />} page="outlines" />;
}
