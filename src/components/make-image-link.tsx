'use client';

import Link from 'next/link';
import { useCanAddImage } from '~/lib/images/can-add';
import { createHref, type AddImageDetail } from '~/lib/images/client';

/**
 * A link into "Make an image" (/images/new), for a passage or none. Shown where "Add an image"
 * shows (useCanAddImage: during the trial, a signed-in, invited FID); the page itself is open to all.
 */
export function MakeImageLink({ passage, className, children }: { passage?: AddImageDetail; className?: string; children: React.ReactNode }) {
  if (!useCanAddImage()) return null;
  return (
    <Link className={className} href={createHref(passage)}>
      {children}
    </Link>
  );
}

/** Home's "Everything you can do here": a row under Pictures, where "Add an image" shows. Model-drafted wording. */
export function HomeMakeImageRow() {
  if (!useCanAddImage()) return null;
  return (
    <li>
      <Link href={createHref()}>
        <span className="home-do-text">
          <span className="home-do-name">Make an image</span>
          <span className="home-do-what">Choose a passage, then describe it</span>
        </span>
        <span className="home-do-meta">Trial →</span>
      </Link>
    </li>
  );
}
