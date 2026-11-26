import NotFound from 'next/dist/client/components/builtin/not-found';
import { AdminXPosts } from '~/components/admin-x-posts';

/** /admin/x-posts: the site's usual "not found" for everyone; a signed-in admin's browser draws the log in its place. */
export default function AdminXPostsNotFound() {
  return <AdminXPosts fallback={<NotFound />} />;
}
