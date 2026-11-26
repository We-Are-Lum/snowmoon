import NotFound from 'next/dist/client/components/builtin/not-found';
import { AdminPayments } from '~/components/admin-payments';

/** /admin/payments: the site's usual "not found" for everyone; a signed-in admin's browser draws the ledger in its place. */
export default function AdminPaymentsNotFound() {
  return <AdminPayments fallback={<NotFound />} />;
}
