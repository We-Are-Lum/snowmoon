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
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MicTestPage() {
  notFound();
}
