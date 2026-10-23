import type { Metadata } from 'next';
import { MinpentaiApp } from '../minpentai-app';
import { minpentaiMetadata } from '../share-meta';

/**
 * The snap's own link (owner, 2026-10-23: a link never cast before, for the launch). A Farcaster client
 * that asks for a snap gets the snap (next.config.ts); a browser, X included, gets Play's home with
 * Minpentai's usual share card and the Link header that names the snap. No redirect, so the card stays.
 */
export function generateMetadata(): Metadata {
  return minpentaiMetadata('/minpentai/play');
}

export default function MinpentaiPlayPage() {
  return (
    <div className="page minpentai">
      <MinpentaiApp />
    </div>
  );
}
