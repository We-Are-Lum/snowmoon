import type { Metadata } from 'next';
import { YouPage } from '~/components/you-page';
import '../../styles/images.css';
import './you.css';

/**
 * /dashboard: the signed-in person's own page (owner, 2026-10-18), reached by tapping their name in the
 * menu's account area. It was /you until 2026-10-29 (owner: "/you → /dashboard"; the old addresses
 * redirect, next.config.ts). Private; the public side of a person is /@<handle>, as their scenes are /@<handle>/<id>. The page as served holds nothing
 * about anyone: sign-in is a bearer token kept on the device (src/lib/client-auth.ts), so what is
 * private is read in the browser from /api/you, which answers only for that token's own person.
 */
export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

export default function Dashboard() {
  return <YouPage />;
}
