import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /storyboard/board/<draft id>: Ephelion slice 2 (DRAFT). Served to everyone as the site's usual "not found";
 * ./not-found.tsx draws the storyboard for the draft's own person, when the switch lets them in (GET /api/voice/boards
 * answers 404 to everyone else).
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function BoardPage() {
  notFound();
}
