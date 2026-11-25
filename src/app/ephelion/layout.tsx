import type { Metadata } from 'next';
import { embedMeta, recordEmbed } from '~/lib/voice/embeds';

/**
 * /ephelion's metadata (was /storyboard/record, Nate 2026-11-24), here in its layout. The page answers 200 (Nate,
 * 2026-11-25) and draws the voice page; the embed stays here, where it has always been. Its own miniapp embed
 * (Nate, 2026-11-22), so a cast opens on this page, not the home page; never indexed.
 */
export const metadata: Metadata = { robots: { index: false, follow: false }, other: embedMeta(recordEmbed()) };

export default function EphelionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
