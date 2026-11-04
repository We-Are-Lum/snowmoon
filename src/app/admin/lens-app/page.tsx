import type { Metadata } from 'next';
import { LensAppRegister } from '~/components/lens-app-register';
import '../../you/you.css';

/**
 * Registering Snowmoon's own Lens App (owner, 2026-11-04; docs/lens-app-registration.md). Everything happens in the
 * owner's browser, between the owner's wallet and Lens's public API: the Builder sign-in, createApp and, only if Lens
 * asks for one, a transaction the owner sends. Our server takes no part and keeps nothing, so the page needs no
 * database and works on a preview. Whoever signs owns the App it makes; the page is for the site's owner.
 */
export const metadata: Metadata = { title: 'Lens App', robots: { index: false, follow: false } };

export default function LensAppPage() {
  return (
    <main className="you">
      <p className="you-kicker label">Admin</p>
      <h1 className="you-title">Register the Lens App</h1>
      <p className="you-lede">
        For the site&rsquo;s owner, with the wallet that will own the App. Your wallet talks only to Lens; this site&rsquo;s
        server isn&rsquo;t involved and keeps nothing.
      </p>
      <LensAppRegister />
    </main>
  );
}
