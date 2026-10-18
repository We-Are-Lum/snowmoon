import type { Metadata } from 'next';
import { YouPage } from '~/components/you-page';
import '../../styles/images.css';
import './you.css';

/**
 * /you: the signed-in person's own page (owner, 2026-10-18), reached by tapping their name in the
 * menu's account area. Named like the site's other one-word pages (/about, /images, /cards); the public
 * side of a person is /@<handle>, as their scenes are /@<handle>/<id>. The page as served holds nothing
 * about anyone: sign-in is a bearer token kept on the device (src/lib/client-auth.ts), so what is
 * private is read in the browser from /api/you, which answers only for that token's own person.
 */
export const metadata: Metadata = { title: 'You', robots: { index: false, follow: false } };

export default function You() {
  return <YouPage />;
}
