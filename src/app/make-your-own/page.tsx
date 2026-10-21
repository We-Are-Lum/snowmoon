import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MakeYourOwn } from '~/components/make-your-own';
import { makeOn } from '~/lib/make/flag';
import { prepaidOpen } from '~/lib/wallet/credits';
import '../assistant/assistant.css';
import './make.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Make your own', robots: { index: false } };

/** "Make your own", story flow v1 (owner's long run 2, item 5). Open to Farcaster and wallet sign-ins (owner, 2026-10-19); the wallet button shows only while wallet sign-in is open. Off (404) unless MAKE_YOUR_OWN is on. At /make-your-own: /make is the end card's link to the repository (next.config), left as it is. */
export default function MakePage() {
  if (!makeOn()) notFound();
  return (
    <div className="page">
      <MakeYourOwn walletSignIn={prepaidOpen()} />
    </div>
  );
}
