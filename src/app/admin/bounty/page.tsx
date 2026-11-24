import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /admin/bounty (owner, 2026-11-23; branch bounty-review): the admins' private review of the poidh backstory bounty's
 * claims and the challenge's entries. Served to everyone as the site's usual "not found" (status 404, nothing of the
 * page in it, never cached), as /admin/activity is; ./not-found.tsx then shows a signed-in admin the review in the
 * browser, from GET /api/admin/bounty (admins only).
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminBountyPage() {
  notFound();
}
