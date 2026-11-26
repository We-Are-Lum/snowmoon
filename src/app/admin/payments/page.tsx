import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /admin/payments (owner, 2026-11-25; branch ephelion-paid): the prepaid ledger for admins. Served to everyone as the
 * site's usual "not found" (status 404, nothing of the page in it, never cached), as /admin/bounty is; ./not-found.tsx
 * then shows a signed-in admin the ledger in the browser, from GET /api/admin/payments (admins only).
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminPaymentsPage() {
  notFound();
}
