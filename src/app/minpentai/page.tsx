import type { Metadata } from 'next';
import { MinpentaiApp } from './minpentai-app';
import { minpentaiMetadata } from './share-meta';

export function generateMetadata(): Metadata {
  return minpentaiMetadata();
}

/** Learn and Free play (minpentai-app.tsx). The sandbox (sandbox.tsx) is kept in the repo, out of the page. */
export default function MinpentaiPage() {
  return (
    <div className="page minpentai">
      <MinpentaiApp />
    </div>
  );
}
