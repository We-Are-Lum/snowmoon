import NotFound from 'next/dist/client/components/builtin/not-found';
import { AdminBountyReview } from '~/components/admin-bounty-review';

/** /admin/bounty: the site's usual "not found" for everyone; a signed-in admin's browser draws the review in its place. */
export default function AdminBountyNotFound() {
  return <AdminBountyReview fallback={<NotFound />} />;
}
