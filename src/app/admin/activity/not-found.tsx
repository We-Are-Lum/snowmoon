import NotFound from 'next/dist/client/components/builtin/not-found';
import { AdminActivity } from '~/components/admin-activity';

/** /admin/activity: the site's usual "not found" for everyone; a signed-in admin's browser draws the dashboard in its place. */
export default function AdminActivityNotFound() {
  return <AdminActivity fallback={<NotFound />} />;
}
