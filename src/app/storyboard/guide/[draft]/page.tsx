import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /storyboard/guide/<draft id>: the guided storyboard (Nate, 2026-11-22/23; DRAFT). Served to everyone as the site's usual
 * "not found"; ./not-found.tsx draws the dialogue for the draft's own person, when the switch lets them in.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function GuidePage() {
  notFound();
}
