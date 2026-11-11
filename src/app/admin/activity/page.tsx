import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /admin/activity (owner, 2026-11-05; docs/proposals/admin-activity.md). Served to everyone as the site's usual "not
 * found" (status 404, nothing of the page in it, never cached); ./not-found.tsx then shows a signed-in admin the
 * dashboard in the browser, from GET /api/admin/activity (admins only), as /challenge does while it is admin-only.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminActivityPage() {
  notFound();
}
