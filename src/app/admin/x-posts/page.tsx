import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /admin/x-posts (owner, 2026-11-25; branch x-posts): the X posts log and the owner's "Register commands" button. Served
 * to everyone as the site's usual "not found" (status 404, nothing of the page in it, never cached), as /admin/activity
 * is; ./not-found.tsx then shows a signed-in admin the page in the browser, from GET /api/admin/x-posts (admins only).
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminXPostsPage() {
  notFound();
}
