import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * /storyboard/record: the Ephelion voice slice 1 (DRAFT; docs/proposals/ephelion-voice.md). Served to everyone as the
 * site's usual "not found"; ./not-found.tsx draws the page for a signed-in person the switch lets in (admins only, and
 * only once VOICE.adminTrial is on; GET /api/voice/status answers 404 to everyone else).
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RecordPage() {
  notFound();
}
