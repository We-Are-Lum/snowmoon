import type { Metadata } from 'next';
import { embedMeta, recordEmbed } from '~/lib/voice/embeds';

/**
 * /ephelion's metadata (was /storyboard/record, Nate 2026-11-24), here in its layout: the page answers "not found" (./not-found.tsx draws the voice page
 * in its place), and a not-found render takes its segment's layout metadata, not the page's. Its own miniapp embed
 * (Nate, 2026-11-22), so a cast opens on this page, not the home page; never indexed.
 */
export const metadata: Metadata = { robots: { index: false, follow: false }, other: embedMeta(recordEmbed()) };

export default function EphelionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
