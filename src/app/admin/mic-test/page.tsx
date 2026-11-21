import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /admin/mic-test: the go/no-go for the Ephelion voice slice (Nate, 2026-11-19): can this browser, or this Farcaster
 * app, record from the microphone? Served to everyone as the site's usual "not found"; ./not-found.tsx shows a
 * signed-in admin the test. The recording stays in the tab: nothing is sent or kept.
 *
 * Its Farcaster embed is on ./layout.tsx (a not-found render's <head> comes from the layouts). The page is still a 404
 * to everyone who isn't a signed-in admin.
 */
// Static: the server's answer is the same 404 for everyone (an admin's browser draws the test), and a static render puts the
// layout's embed in the <head> for every user agent (a dynamic one streams it to all but known bots).
export const dynamic = 'force-static';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MicTestPage() {
  notFound();
}
